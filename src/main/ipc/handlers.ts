import { ipcMain, dialog, shell, app } from 'electron';
import type { BrowserWindow } from 'electron';
import { Channels } from './channels';
import { scanOrchestrator } from '../scanner/index';
import { clearTitleCache } from '../scanner/title-resolver';
import { gameLauncher } from '../launcher/index';
import { artFetcher } from '../art/index';
import {
  listGames,
  findGameById,
  toggleFavorite,
  updateGame,
  type ListGamesFilter,
} from '../db/games';
import {
  insertShortcut,
  deleteShortcut,
  listShortcuts,
  type InsertShortcutInput,
} from '../db/shortcuts';
import { getAllSettings, patchSettings } from '../db/settings';
import type { AppSettings } from '../db/settings';
import type { GamesListFilter, SortOption } from '../../shared/ipc-types';

// UUID v4 format validation regex.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Known settings keys with their expected types for runtime validation.
const SETTINGS_VALIDATORS: {
  [K in keyof AppSettings]: (v: unknown) => v is AppSettings[K];
} = {
  scanDirectories:     (v): v is string[]                   => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  scanOnStartup:       (v): v is boolean                    => typeof v === 'boolean',
  scanIntervalMinutes: (v): v is number                     => typeof v === 'number' && Number.isFinite(v) && v >= 0,
  minimizeToTray:      (v): v is boolean                    => typeof v === 'boolean',
  launchOnStartup:     (v): v is boolean                    => typeof v === 'boolean',
  steamGridDbApiKey:   (v): v is string                     => typeof v === 'string' && v.length <= 512,
  artQuality:          (v): v is 'standard' | 'high'        => v === 'standard' || v === 'high',
  sidebarAutoHide:     (v): v is boolean                    => typeof v === 'boolean',
  thumbnailSize:       (v): v is 'small' | 'medium' | 'large' => v === 'small' || v === 'medium' || v === 'large',
};

export function registerIpcHandlers(win: BrowserWindow): void {
  // ─── Scan ────────────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.TITLES_REFRESH, () => {
    clearTitleCache();
  });

  ipcMain.handle(Channels.SCAN_START, async () => {
    if (scanOrchestrator.running) return;
    scanOrchestrator.runScan(win).catch((err: unknown) => {
      console.error('[scan] Scan failed:', err);
      win.webContents.send(Channels.SCAN_ERROR, (err as Error).message);
    });
  });

  ipcMain.handle(Channels.SCAN_CANCEL, () => {
    scanOrchestrator.cancel();
  });

  // ─── Games ───────────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.GAMES_LIST, (_event, filter: GamesListFilter = {}) => {
    const dbFilter: ListGamesFilter = {};

    if (filter.platforms?.length === 1) {
      // Single platform filter maps directly.
      const p = filter.platforms[0];
      if (p) dbFilter.platform = p as ListGamesFilter['platform'];
    }

    if (filter.favoritesOnly) dbFilter.favorite = true;
    if (!filter.includeHidden) dbFilter.hidden = false;
    if (filter.search) dbFilter.search = filter.search;

    let games = listGames(dbFilter);

    // Apply multi-platform filter in memory when multiple platforms are selected.
    if (filter.platforms && filter.platforms.length > 1) {
      const set = new Set(filter.platforms);
      games = games.filter((g) => set.has(g.platform as typeof filter.platforms[0]));
    }

    // Apply sort.
    const sort: SortOption = filter.sortBy ?? 'title-asc';
    games = sortGames(games, sort);

    return games;
  });

  ipcMain.handle(Channels.GAMES_LAUNCH, async (_event, gameId: unknown) => {
    if (!isValidUuid(gameId)) return { ok: false, error: 'Invalid game ID.' };
    return gameLauncher.launch(gameId);
  });

  ipcMain.handle(Channels.GAMES_FAVORITE, (_event, gameId: unknown) => {
    if (!isValidUuid(gameId)) return null;
    return toggleFavorite(gameId);
  });

  ipcMain.handle(Channels.GAMES_HIDE, (_event, gameId: unknown, hidden: unknown) => {
    if (!isValidUuid(gameId)) return null;
    if (typeof hidden !== 'boolean') return null;
    return updateGame(gameId, { hidden });
  });

  const VALID_STATUSES = new Set(['unplayed', 'playing', 'completed', 'on-hold', 'dropped']);

  ipcMain.handle(Channels.GAMES_SET_STATUS, (_event, gameId: unknown, status: unknown) => {
    if (!isValidUuid(gameId)) return null;
    if (typeof status !== 'string' || !VALID_STATUSES.has(status)) return null;
    return updateGame(gameId, { status: status as 'unplayed' | 'playing' | 'completed' | 'on-hold' | 'dropped' });
  });

  ipcMain.handle(Channels.GAMES_UNINSTALL, async (_event, gameId: unknown) => {
    if (!isValidUuid(gameId)) return { ok: false, error: 'Invalid game ID.' };
    const game = findGameById(gameId);
    if (!game) return { ok: false, error: 'Game not found.' };
    const { uninstallGame } = await import('../launcher/uninstall');
    return uninstallGame(game);
  });

  ipcMain.handle(Channels.GAMES_OPEN_FOLDER, async (_event, gameId: unknown) => {
    if (!isValidUuid(gameId)) return;
    const game = findGameById(gameId);
    if (!game?.installPath) return;
    await shell.openPath(game.installPath);
  });

  // ─── Shortcuts ───────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.SHORTCUTS_ADD, (_event, data: InsertShortcutInput) => {
    return insertShortcut(data);
  });

  ipcMain.handle(Channels.SHORTCUTS_REMOVE, (_event, id: unknown) => {
    if (!isValidUuid(id)) return false;
    return deleteShortcut(id);
  });

  ipcMain.handle(Channels.SHORTCUTS_LIST, () => {
    return listShortcuts();
  });

  // ─── Settings ────────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.SETTINGS_GET, () => {
    return getAllSettings();
  });

  ipcMain.handle(Channels.SETTINGS_UPDATE, (_event, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      return getAllSettings();
    }
    const validated: Partial<AppSettings> = {};
    for (const rawKey of Object.keys(patch as Record<string, unknown>)) {
      const key = rawKey as keyof AppSettings;
      if (!Object.prototype.hasOwnProperty.call(SETTINGS_VALIDATORS, key)) continue;
      const value = (patch as Record<string, unknown>)[key];
      const validator = SETTINGS_VALIDATORS[key] as (v: unknown) => boolean;
      if (validator(value)) {
        (validated as Record<string, unknown>)[key] = value;
      }
    }
    return patchSettings(validated);
  });

  // ─── Cover art ───────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.ART_FETCH, (_event, gameId: unknown) => {
    if (!isValidUuid(gameId)) return;
    artFetcher.enqueue(gameId, win);
  });

  ipcMain.handle(Channels.ART_REFETCH_MISSING, () => {
    artFetcher.refetchAll(win, true);
  });

  ipcMain.handle(Channels.ART_REFETCH_ALL, () => {
    artFetcher.refetchAll(win, false);
  });

  ipcMain.handle(Channels.ART_FAILURES, () => {
    return artFetcher.failures;
  });

  // ─── Dialogs ─────────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.DIALOG_SELECT_DIR, async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Game Directory',
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(Channels.DIALOG_SELECT_EXE, async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      title: 'Select Executable',
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // ─── App reset ──────────────────────────────────────────────────────────────

  ipcMain.handle(Channels.APP_RESET, async () => {
    const { rmSync, existsSync } = await import('node:fs');
    const path = await import('node:path');
    const appData = process.env['APPDATA'];
    if (!appData) return;

    const appDir = path.join(appData, 'game-launcher');
    if (existsSync(appDir)) {
      rmSync(appDir, { recursive: true, force: true });
    }

    app.relaunch();
    app.exit(0);
  });

  // ─── Window controls ─────────────────────────────────────────────────────────

  ipcMain.on(Channels.WINDOW_MINIMIZE, () => win.minimize());

  ipcMain.on(Channels.WINDOW_MAXIMIZE, () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on(Channels.WINDOW_CLOSE, () => win.close());

  ipcMain.handle(Channels.WINDOW_TOGGLE_FULLSCREEN, () => {
    win.setFullScreen(!win.isFullScreen());
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DbGame = ReturnType<typeof findGameById>;

function sortGames(
  games: NonNullable<DbGame>[],
  sort: SortOption,
): NonNullable<DbGame>[] {
  switch (sort) {
    case 'title-asc':
      return [...games].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      );
    case 'title-desc':
      return [...games].sort((a, b) =>
        b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }),
      );
    case 'recently-played':
      return [...games].sort((a, b) =>
        (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''),
      );
    case 'most-played':
      return [...games].sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
    case 'recently-added':
      return [...games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'platform':
      return [...games].sort((a, b) => a.platform.localeCompare(b.platform));
    default:
      return games;
  }
}
