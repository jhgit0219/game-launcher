export type Platform =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'origin'
  | 'battlenet'
  | 'registry'
  | 'custom';

export interface Game {
  id: string;
  title: string;
  platform: Platform;
  executablePath: string | null;
  installPath: string | null;
  platformId: string | null;
  coverArtPath: string | null;
  coverArtUrl: string | null;
  playtimeMinutes: number;
  lastPlayed: string | null;
  favorite: boolean;
  hidden: boolean;
  genre: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppShortcut {
  id: string;
  name: string;
  executablePath: string;
  iconPath: string | null;
  category: string | null;
  createdAt: string;
}

export interface AppSettings {
  scanDirectories: string[];
  scanOnStartup: boolean;
  scanIntervalMinutes: number;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  steamGridDbApiKey: string;
  artQuality: 'standard' | 'high';
}

export interface ScanProgress {
  source: string;
  found: number;
  total: number;
  phase: string;
}

export interface ScanSummary {
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

export interface GamesListFilter {
  search?: string;
  platforms?: Platform[];
  favoritesOnly?: boolean;
  recentlyPlayed?: boolean;
  includeHidden?: boolean;
  sortBy?: SortOption;
}

export type SortOption =
  | 'title-asc'
  | 'title-desc'
  | 'recently-played'
  | 'most-played'
  | 'recently-added'
  | 'platform';

export interface ElectronAPI {
  scanStart: () => Promise<void>;
  scanCancel: () => Promise<void>;
  gamesList: (filter: GamesListFilter) => Promise<Game[]>;
  gamesLaunch: (gameId: string) => Promise<void>;
  gamesFavorite: (gameId: string) => Promise<void>;
  gamesHide: (gameId: string) => Promise<void>;
  shortcutsAdd: (data: Omit<AppShortcut, 'id' | 'createdAt'>) => Promise<AppShortcut>;
  shortcutsRemove: (id: string) => Promise<void>;
  shortcutsList: () => Promise<AppShortcut[]>;
  settingsGet: () => Promise<AppSettings>;
  settingsUpdate: (patch: Partial<AppSettings>) => Promise<void>;
  artFetch: (gameId: string) => Promise<string | null>;
  openInstallFolder: (gameId: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  selectExecutable: () => Promise<string | null>;
  onScanProgress: (callback: (data: ScanProgress) => void) => () => void;
  onScanComplete: (callback: (data: ScanSummary) => void) => () => void;
  onScanError: (callback: (err: string) => void) => () => void;
  onArtUpdated: (callback: (data: { gameId: string; coverPath: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
