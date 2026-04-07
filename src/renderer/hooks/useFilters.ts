import { useState, useCallback, useMemo } from 'react';
import type { Platform, SortOption } from '../types/game';

interface FilterState {
  platforms: Platform[];
  favoritesOnly: boolean;
  recentlyPlayed: boolean;
  sortBy: SortOption;
}

interface UseFiltersResult {
  filters: FilterState;
  togglePlatform: (platform: Platform) => void;
  setFavoritesOnly: (value: boolean) => void;
  setRecentlyPlayed: (value: boolean) => void;
  setSortBy: (value: SortOption) => void;
  clearFilters: () => void;
  activeFilterCount: number;
}

const DEFAULT_FILTERS: FilterState = {
  platforms: [],
  favoritesOnly: false,
  recentlyPlayed: false,
  sortBy: 'title-asc',
};

export function useFilters(): UseFiltersResult {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const togglePlatform = useCallback((platform: Platform) => {
    setFilters((prev) => {
      const exists = prev.platforms.includes(platform);
      return {
        ...prev,
        platforms: exists
          ? prev.platforms.filter((p) => p !== platform)
          : [...prev.platforms, platform],
      };
    });
  }, []);

  const setFavoritesOnly = useCallback((value: boolean) => {
    setFilters((prev) => ({ ...prev, favoritesOnly: value }));
  }, []);

  const setRecentlyPlayed = useCallback((value: boolean) => {
    setFilters((prev) => ({ ...prev, recentlyPlayed: value }));
  }, []);

  const setSortBy = useCallback((value: SortOption) => {
    setFilters((prev) => ({ ...prev, sortBy: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.platforms.length > 0) count += filters.platforms.length;
    if (filters.favoritesOnly) count += 1;
    if (filters.recentlyPlayed) count += 1;
    return count;
  }, [filters]);

  return {
    filters,
    togglePlatform,
    setFavoritesOnly,
    setRecentlyPlayed,
    setSortBy,
    clearFilters,
    activeFilterCount,
  };
}
