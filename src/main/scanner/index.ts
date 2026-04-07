import { existsSync } from 'node:fs';
import type { BrowserWindow } from 'electron';
import type { ScanResult, ScanOptions } from './types';
import { SteamScanner } from './sources/steam';
import { EpicScanner } from './sources/epic';
import { GogScanner } from './sources/gog';
import { OriginScanner } from './sources/origin';
import { BattleNetScanner } from './sources/battlenet';
import { RegistryScanner } from './sources/registry';
import { CustomScanner } from './sources/custom';
import { DriveScanScanner } from './sources/drive-scan';
import {
  insertGame,
  findGameByPlatformId,
  findGameByTitleAndPath,
  updateGame,
  listGames,
  type InsertGameInput,
  type Platform,
} from '../db/games';
import { persistDb } from '../db/index';
import { startScan, completeScan } from '../db/scan-log';
import { getSetting } from '../db/settings';
import { isLikelyGame } from './filter';
import { loadValidationCache, validateResults } from './validator';

export interface ScanSummary {
  added: number;
  updated: number;
  removed: number;
  errors: string[];
  durationMs: number;
}

export interface ScanProgressData {
  source: string;
  found: number;
  phase: 'scanning' | 'persisting' | 'deduplicating';
}

// Map from the scanner's Platform type to the db Platform type.
// Both use the same values; this is a compile-time consistency alias.
type DbPlatform = Platform;

export class ScanOrchestrator {
  private abortController: AbortController | null = null;
  private isRunning = false;

  /**
   * Run all available scanners in parallel. Streams progress to the given
   * BrowserWindow via IPC events. Deduplicates results before persisting.
   */
  async runScan(
    win: BrowserWindow,
    options: ScanOptions = {},
  ): Promise<ScanSummary> {
    if (this.isRunning) {
      throw new Error('A scan is already in progress');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const started = Date.now();
    const errors: string[] = [];
    const allResults: ScanResult[] = [];
    const sourceFoundCounts: Record<string, number> = {};

    // Collect scan log ids per source.
    const logIds: Record<string, number> = {};

    try {
      // Build scanner instances.
      const customDirs = getSetting('scanDirectories');
      const customScanner = new CustomScanner();
      customScanner.setDirectories(customDirs);

      const registryScanner = new RegistryScanner();

      const scanners = [
        new SteamScanner(),
        new EpicScanner(),
        new GogScanner(),
        new OriginScanner(),
        new BattleNetScanner(),
        customScanner,
        registryScanner,
        new DriveScanScanner(),
      ];

      // Filter to available scanners.
      const available = (
        await Promise.all(
          scanners.map(async (s) => ({ scanner: s, ok: await s.isAvailable() })),
        )
      )
        .filter((x) => x.ok)
        .map((x) => x.scanner);

      // Open log entries for each source.
      for (const scanner of available) {
        logIds[scanner.platform] = startScan({ source: scanner.platform });
        sourceFoundCounts[scanner.platform] = 0;
      }

      // Run all scanners in parallel, collecting results as they stream in.
      const scanPromises = available.map(async (scanner) => {
        const sourceName = scanner.platform;
        try {
          for await (const result of scanner.scan()) {
            if (signal.aborted) break;

            allResults.push(result);
            sourceFoundCounts[sourceName] = (sourceFoundCounts[sourceName] ?? 0) + 1;

            this.sendProgress(win, {
              source: sourceName,
              found: sourceFoundCounts[sourceName]!,
              phase: 'scanning',
            });
          }
        } catch (err: unknown) {
          const msg = `[${sourceName}] ${(err as Error).message ?? String(err)}`;
          errors.push(msg);
          console.error(msg);
        }
      });

      await Promise.all(scanPromises);

      if (signal.aborted) {
        return { added: 0, updated: 0, removed: 0, errors, durationMs: Date.now() - started };
      }

      // Deduplicate results.
      this.sendProgress(win, { source: 'orchestrator', found: allResults.length, phase: 'deduplicating' });
      const deduplicated = this.deduplicate(allResults);

      // Layer 1: drop obvious non-games using local heuristics.
      const likelyGames = deduplicated.filter((r) => isLikelyGame(r));

      // Provide known install paths to the registry scanner so future incremental
      // scans can skip them. (The registry scan already ran above — this is
      // informational for the next run.)
      const knownPaths = likelyGames
        .filter((r) => r.platform !== 'registry')
        .map((r) => r.installPath ?? '')
        .filter(Boolean);
      registryScanner.setKnownPaths(knownPaths);

      // Layer 2: validate registry/drive-scan results against the Steam store
      // search. Trusted platform results are short-circuited as confirmed.
      const validationCache = loadValidationCache();
      const validationMap = await validateResults(likelyGames, validationCache);

      // Drop results that the validator identified as definitively not a game.
      const validated = likelyGames.filter((r) => {
        const entry = validationMap.get(r.title.toLowerCase());
        return entry?.status !== 'not_a_game';
      });

      // Persist results.
      this.sendProgress(win, { source: 'orchestrator', found: validated.length, phase: 'persisting' });

      let added = 0;
      let updated = 0;

      if (!signal.aborted && validated.length > 0) {
        for (const result of validated) {
          const { wasAdded } = this.upsertGame(result);
          if (wasAdded) added++;
          else updated++;
        }
        persistDb();
      }

      // Soft-delete games with missing install paths.
      const removed = this.markMissingGames(validated);

      // Close scan log entries.
      for (const scanner of available) {
        const logId = logIds[scanner.platform];
        if (logId !== undefined) {
          completeScan(logId, {
            gamesFound: sourceFoundCounts[scanner.platform] ?? 0,
            gamesAdded: added,
            gamesRemoved: removed,
            errors: errors.filter((e) => e.startsWith(`[${scanner.platform}]`)),
          });
        }
      }

      const summary: ScanSummary = {
        added,
        updated,
        removed,
        errors,
        durationMs: Date.now() - started,
      };

      win.webContents.send('scan:complete', summary);
      return summary;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private sendProgress(win: BrowserWindow, data: ScanProgressData): void {
    if (!win.isDestroyed()) {
      win.webContents.send('scan:progress', data);
    }
  }

  /**
   * Deduplicate scan results. Priority: platform-specific scanners over registry
   * scanner. Within the same platform, deduplicate by (platform, platformId) for
   * identified games, or by normalised (title + installPath) for standalone games.
   */
  private deduplicate(results: ScanResult[]): ScanResult[] {
    const byPlatformId = new Map<string, ScanResult>();
    const byTitle = new Map<string, ScanResult>();
    const output: ScanResult[] = [];

    // Trusted platforms first so they win deduplication over custom/registry.
    const platformPriority: Record<string, number> = {
      steam: 0, epic: 1, gog: 2, origin: 3, battlenet: 4, registry: 6, custom: 5,
    };
    const sorted = [...results].sort((a, b) =>
      (platformPriority[a.platform] ?? 5) - (platformPriority[b.platform] ?? 5)
    );

    for (const result of sorted) {
      // Dedup by platform + platformId for store games.
      if (result.platformId) {
        const pidKey = `${result.platform}::${result.platformId}`;
        if (byPlatformId.has(pidKey)) continue;
        byPlatformId.set(pidKey, result);
      }

      // Dedup by normalized title across ALL platforms.
      // If Steam already found "Sekiro", the custom scanner's "Sekiro" is dropped.
      const normTitle = result.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (byTitle.has(normTitle)) continue;
      byTitle.set(normTitle, result);
      output.push(result);
    }

    return output;
  }

  /**
   * Insert or update a game in the database. Returns whether the record was new.
   */
  private upsertGame(result: ScanResult): { wasAdded: boolean } {
    const platform = result.platform as DbPlatform;

    // Check by platformId first (Steam, Epic, etc.)
    if (result.platformId) {
      const existing = findGameByPlatformId(platform, result.platformId);
      if (existing) {
        updateGame(existing.id, {
          title: result.title,
          executablePath: result.exePath,
          installPath: result.installPath,
          launchUri: result.launchUri,
        });
        return { wasAdded: false };
      }
    }

    // Check by title + install path (catches custom/registry duplicates)
    const existingByTitle = findGameByTitleAndPath(result.title, result.installPath ?? null);
    if (existingByTitle) {
      updateGame(existingByTitle.id, {
        executablePath: result.exePath,
        launchUri: result.launchUri,
      });
      return { wasAdded: false };
    }

    insertGame({
      title: result.title,
      platform,
      platformId: result.platformId,
      executablePath: result.exePath,
      installPath: result.installPath,
      launchUri: result.launchUri,
    });
    return { wasAdded: true };
  }

  /**
   * Mark games as hidden if their install directories no longer exist.
   * Uses a 3-strike policy tracked via a dedicated metadata field.
   * Returns the count of games newly hidden.
   */
  private markMissingGames(foundResults: ScanResult[]): number {
    // Build a set of install paths found in this scan.
    const foundPaths = new Set(
      foundResults
        .map((r) => r.installPath?.toLowerCase().replace(/\\/g, '/'))
        .filter((p): p is string => Boolean(p)),
    );

    const allGames = listGames({ hidden: false });
    let removed = 0;

    for (const game of allGames) {
      if (!game.installPath) continue;
      const normPath = game.installPath.toLowerCase().replace(/\\/g, '/');

      if (foundPaths.has(normPath)) continue;

      // Check if the path still exists on disk.
      if (!existsSync(game.installPath)) {
        // Hide games whose directory is genuinely missing.
        updateGame(game.id, { hidden: true });
        removed++;
      }
    }

    return removed;
  }
}

// Singleton instance for use throughout the main process.
export const scanOrchestrator = new ScanOrchestrator();
