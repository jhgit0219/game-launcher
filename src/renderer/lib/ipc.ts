import type {
  ElectronAPI,
  GamesListFilter,
  Game,
  AppShortcut,
  AppSettings,
  ScanProgress,
  ScanSummary,
} from '../../shared/ipc-types';

function getAPI(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error(
      'electronAPI is not available. Ensure the preload script is loaded.',
    );
  }
  return window.electronAPI;
}

export const ipc = {
  titles: {
    refresh: (): Promise<void> => getAPI().titlesRefresh(),
  },

  scan: {
    start: (): Promise<void> => getAPI().scanStart(),
    cancel: (): Promise<void> => getAPI().scanCancel(),
    onProgress: (cb: (data: ScanProgress) => void): (() => void) =>
      getAPI().onScanProgress(cb),
    onComplete: (cb: (data: ScanSummary) => void): (() => void) =>
      getAPI().onScanComplete(cb),
    onError: (cb: (err: string) => void): (() => void) =>
      getAPI().onScanError(cb),
  },

  games: {
    list: (filter: GamesListFilter): Promise<Game[]> =>
      getAPI().gamesList(filter),
    launch: (gameId: string): Promise<void> => getAPI().gamesLaunch(gameId),
    favorite: (gameId: string): Promise<void> => getAPI().gamesFavorite(gameId),
    hide: (gameId: string): Promise<void> => getAPI().gamesHide(gameId),
    setStatus: (gameId: string, status: import('../../shared/ipc-types').GameStatus): Promise<void> =>
      getAPI().gamesSetStatus(gameId, status),
    uninstall: (gameId: string): Promise<{ ok: boolean; error?: string }> =>
      getAPI().gamesUninstall(gameId),
    openInstallFolder: (gameId: string): Promise<void> =>
      getAPI().openInstallFolder(gameId),
  },

  shortcuts: {
    add: (data: Omit<AppShortcut, 'id' | 'createdAt'>): Promise<AppShortcut> =>
      getAPI().shortcutsAdd(data),
    remove: (id: string): Promise<void> => getAPI().shortcutsRemove(id),
    list: (): Promise<AppShortcut[]> => getAPI().shortcutsList(),
  },

  settings: {
    get: (): Promise<AppSettings> => getAPI().settingsGet(),
    update: (patch: Partial<AppSettings>): Promise<void> =>
      getAPI().settingsUpdate(patch),
  },

  art: {
    fetch: (gameId: string): Promise<string | null> =>
      getAPI().artFetch(gameId),
    refetchMissing: (): Promise<void> => getAPI().artRefetchMissing(),
    refetchAll: (): Promise<void> => getAPI().artRefetchAll(),
    failures: (): Promise<Array<{ gameId: string; title: string; reason: string; timestamp: string }>> =>
      getAPI().artFailures(),
    onUpdated: (cb: (data: { gameId: string; coverPath: string }) => void): (() => void) =>
      getAPI().onArtUpdated(cb),
    onDownloadStatus: (cb: (data: { title: string; provider: string }) => void): (() => void) =>
      getAPI().onArtDownloadStatus(cb),
  },

  window: {
    toggleFullscreen: (): Promise<void> => getAPI().toggleFullscreen(),
    onFullscreenChanged: (cb: (isFullscreen: boolean) => void): (() => void) =>
      getAPI().onFullscreenChanged(cb),
  },

  app: {
    reset: (): Promise<void> => getAPI().appReset(),
  },

  dialog: {
    selectDirectory: (): Promise<string | null> =>
      getAPI().selectDirectory(),
    selectExecutable: (): Promise<string | null> =>
      getAPI().selectExecutable(),
  },
} as const;
