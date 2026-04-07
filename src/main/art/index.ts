import type { BrowserWindow } from 'electron';
import { findGameById, updateGame } from '../db/games';
import { getSetting } from '../db/settings';
import { hasCachedCover, saveCoverBuffer, getCoverPath } from './cache';
import { getSteamCdnUrl } from './providers/steam-cdn';
import { searchSteamForCover } from './providers/steam-search';
import { fetchSteamGridDbCover } from './providers/steam-grid';
import { fetchIgdbCover } from './providers/igdb';

const MAX_RETRIES = 3;
const CONCURRENCY_LIMIT = 3;
const RETRY_DELAYS_MS = [1000, 3000, 8000];

interface FetchJob {
  gameId: string;
  win: BrowserWindow;
}

export class ArtFetcher {
  private queue: FetchJob[] = [];
  private active = 0;

  enqueue(gameId: string, win: BrowserWindow): void {
    // Skip if already cached.
    if (hasCachedCover(gameId)) {
      const game = findGameById(gameId);
      if (game?.coverArtPath) {
        win.webContents.send('art:updated', { gameId, coverPath: game.coverArtPath });
        return;
      }
    }

    // Avoid duplicate queue entries.
    if (this.queue.some((j) => j.gameId === gameId)) return;

    this.queue.push({ gameId, win });
    this.drain();
  }

  private drain(): void {
    while (this.active < CONCURRENCY_LIMIT && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      this.processJob(job).finally(() => {
        this.active--;
        this.drain();
      });
    }
  }

  private async processJob(job: FetchJob): Promise<void> {
    const { gameId, win } = job;
    const game = findGameById(gameId);
    if (!game) return;

    // Already has a cached cover on disk — just notify the renderer.
    if (hasCachedCover(gameId)) {
      const coverPath = getCoverPath(gameId);
      updateGame(game.id, { coverArtPath: coverPath });
      this.notifyRenderer(win, gameId, coverPath);
      return;
    }

    const settings = {
      steamGridDbApiKey: getSetting('steamGridDbApiKey'),
      artQuality: getSetting('artQuality'),
    };

    // Build the provider chain.
    const providers: Array<() => Promise<string | null>> = [];

    // Tier 1: Steam CDN (Steam games with known appId — instant, no API call).
    const steamUrl = getSteamCdnUrl(game);
    if (steamUrl) {
      providers.push(() => Promise.resolve(steamUrl));
    }

    // Tier 2: SteamGridDB (best coverage, community art, needs API key).
    if (settings.steamGridDbApiKey) {
      providers.push(() => fetchSteamGridDbCover(game.title, settings.steamGridDbApiKey));
    }

    // Tier 3: Steam Store search (free, no key, tries portrait then landscape).
    providers.push(() => searchSteamForCover(game.title));

    // Tier 4: IGDB (requires Twitch credentials — future extension).
    const twitchClientId = '';
    const twitchClientSecret = '';
    if (twitchClientId && twitchClientSecret) {
      providers.push(() => fetchIgdbCover(game.title, twitchClientId, twitchClientSecret));
    }

    for (const provider of providers) {
      const url = await provider();
      if (!url) continue;

      const buffer = await this.downloadWithRetry(url);
      if (!buffer) continue;

      try {
        const coverPath = await saveCoverBuffer(gameId, buffer);
        updateGame(game.id, { coverArtPath: coverPath });
        this.notifyRenderer(win, gameId, coverPath);
        return;
      } catch (err) {
        console.error(`[art] Failed to save cover for ${gameId}:`, err);
      }
    }
    // No provider succeeded — leave placeholder.
  }

  private async downloadWithRetry(url: string): Promise<Buffer | null> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) continue;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAYS_MS[attempt] ?? 1000);
        }
      }
    }
    return null;
  }

  private notifyRenderer(win: BrowserWindow, gameId: string, coverPath: string): void {
    if (!win.isDestroyed()) {
      win.webContents.send('art:updated', { gameId, coverPath });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const artFetcher = new ArtFetcher();
