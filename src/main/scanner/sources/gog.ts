import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { GameScanner, ScanResult } from '../types';

const GOG_DB_PATH = 'C:/ProgramData/GOG.com/Galaxy/storage/galaxy-2.0.db';
const GOG_GAMES_DIR_X86 = 'C:/Program Files (x86)/GOG Galaxy/Games';
const GOG_GAMES_DIR = 'C:/Program Files/GOG Galaxy/Games';

export class GogScanner implements GameScanner {
  readonly platform = 'gog' as const;

  async isAvailable(): Promise<boolean> {
    return (
      existsSync(GOG_DB_PATH) ||
      existsSync(GOG_GAMES_DIR_X86) ||
      existsSync(GOG_GAMES_DIR)
    );
  }

  async *scan(): AsyncGenerator<ScanResult> {
    // Try the Galaxy database first (richest metadata).
    if (existsSync(GOG_DB_PATH)) {
      yield* this.scanFromDatabase();
    } else {
      // Fallback: enumerate the GOG Games directory.
      const gamesDir = existsSync(GOG_GAMES_DIR_X86) ? GOG_GAMES_DIR_X86 : GOG_GAMES_DIR;
      if (existsSync(gamesDir)) {
        yield* this.scanFromDirectory(gamesDir);
      }
    }
  }

  private async *scanFromDatabase(): AsyncGenerator<ScanResult> {
    // Open the GOG Galaxy SQLite database read-only using sql.js.
    let db: import('sql.js').Database | null = null;
    try {
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const buf = readFileSync(GOG_DB_PATH);
      db = new SQL.Database(buf);

      // GamePieces stores individual attributes per game; join on releaseKey.
      const results = db.exec(`
        SELECT gp.releaseKey, gp.gamePieceTypeId, gp.value
        FROM GamePieces gp
        WHERE gp.gamePieceTypeId IN ('title','originalTitle','meta')
        ORDER BY gp.releaseKey
      `);

      type PieceRow = { releaseKey: string; gamePieceTypeId: string; value: string };
      const rows: PieceRow[] = [];
      if (results[0]) {
        const { columns, values } = results[0];
        for (const row of values) {
          const obj: Record<string, string> = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i] as string] = String(row[i] ?? '');
          }
          rows.push(obj as PieceRow);
        }
      }

      // Group attributes by releaseKey.
      const gameMap = new Map<string, Record<string, string>>();
      for (const row of rows) {
        if (!gameMap.has(row.releaseKey)) {
          gameMap.set(row.releaseKey, {});
        }
        gameMap.get(row.releaseKey)![row.gamePieceTypeId] = row.value;
      }

      // Also query InstalledExternalProducts for install paths.
      type InstallRow = { productId: string; installationPath: string };
      let installRows: InstallRow[] = [];
      try {
        const installResults = db.exec(
          'SELECT productId, installationPath FROM InstalledExternalProducts',
        );
        if (installResults[0]) {
          const { columns, values } = installResults[0];
          for (const row of values) {
            const obj: Record<string, string> = {};
            for (let i = 0; i < columns.length; i++) {
              obj[columns[i] as string] = String(row[i] ?? '');
            }
            installRows.push(obj as InstallRow);
          }
        }
      } catch {
        // Table may not exist in all Galaxy versions.
      }

      const installMap = new Map<string, string>();
      for (const row of installRows) {
        installMap.set(String(row.productId), row.installationPath);
      }

      for (const [releaseKey, attrs] of gameMap) {
        // Parse the title value (stored as JSON {"title":"..."} or plain string).
        let title: string | null = null;
        const titleRaw = attrs['title'] ?? attrs['originalTitle'];
        if (titleRaw) {
          try {
            const parsed = JSON.parse(titleRaw) as Record<string, unknown>;
            title = (parsed['title'] as string) ?? titleRaw;
          } catch {
            title = titleRaw;
          }
        }

        if (!title) continue;

        // releaseKey format for GOG games: "gog_12345678"
        const gogIdMatch = releaseKey.match(/^gog_(\d+)$/);
        const platformId = gogIdMatch ? gogIdMatch[1]! : releaseKey;

        const installPath = installMap.get(platformId)?.replace(/\\/g, '/') ?? null;

        yield {
          title,
          platform: 'gog',
          platformId,
          exePath: null,
          installPath,
          launchUri: `goggalaxy://openGame/${platformId}`,
        };
      }
    } catch {
      // Locked or incompatible database — fall back to directory scan.
      yield* this.scanFromDirectory(GOG_GAMES_DIR_X86);
    } finally {
      db?.close();
    }
  }

  private async *scanFromDirectory(dir: string): AsyncGenerator<ScanResult> {
    if (!existsSync(dir)) return;

    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const installPath = path.join(dir, entry.name).replace(/\\/g, '/');
      yield {
        title: entry.name,
        platform: 'gog',
        platformId: null,
        exePath: null,
        installPath,
        launchUri: null,
      };
    }
  }
}
