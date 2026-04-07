import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Platform, SortOption, Game } from '../types/game';

type ViewMode = 'library' | 'apps' | 'settings';

interface LibraryState {
  view: ViewMode;
  searchQuery: string;
  platforms: Platform[];
  favoritesOnly: boolean;
  recentlyPlayed: boolean;
  sortBy: SortOption;
  selectedGame: Game | null;
}

interface LibraryActions {
  setView: (view: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  togglePlatform: (platform: Platform) => void;
  setFavoritesOnly: (value: boolean) => void;
  setRecentlyPlayed: (value: boolean) => void;
  setSortBy: (value: SortOption) => void;
  setSelectedGame: (game: Game | null) => void;
  clearFilters: () => void;
  activeFilterCount: number;
}

type LibraryContextValue = LibraryState & LibraryActions;

const LibraryContext = createContext<LibraryContextValue | null>(null);

export interface LibraryProviderProps {
  children: ReactNode;
}

export function LibraryProvider({ children }: LibraryProviderProps) {
  const [view, setView] = useState<ViewMode>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('title-asc');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const togglePlatform = useCallback((platform: Platform) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  }, []);

  const clearFilters = useCallback(() => {
    setPlatforms([]);
    setFavoritesOnly(false);
    setRecentlyPlayed(false);
    setSearchQuery('');
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = platforms.length;
    if (favoritesOnly) count += 1;
    if (recentlyPlayed) count += 1;
    return count;
  }, [platforms, favoritesOnly, recentlyPlayed]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      view,
      searchQuery,
      platforms,
      favoritesOnly,
      recentlyPlayed,
      sortBy,
      selectedGame,
      setView,
      setSearchQuery,
      togglePlatform,
      setFavoritesOnly,
      setRecentlyPlayed,
      setSortBy,
      setSelectedGame,
      clearFilters,
      activeFilterCount,
    }),
    [
      view,
      searchQuery,
      platforms,
      favoritesOnly,
      recentlyPlayed,
      sortBy,
      selectedGame,
      togglePlatform,
      clearFilters,
      activeFilterCount,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return ctx;
}
