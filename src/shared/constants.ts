import type { Platform, SortOption } from './ipc-types';

export const PLATFORM_LABELS: Record<Platform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  origin: 'Origin / EA',
  battlenet: 'Battle.net',
  registry: 'Registry',
  custom: 'Custom',
};

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'title-asc', label: 'Title A\u2013Z' },
  { value: 'title-desc', label: 'Title Z\u2013A' },
  { value: 'recently-played', label: 'Recently Played' },
  { value: 'most-played', label: 'Most Played' },
  { value: 'recently-added', label: 'Recently Added' },
  { value: 'platform', label: 'Platform' },
];

export const ALL_PLATFORMS: Platform[] = [
  'steam',
  'epic',
  'gog',
  'origin',
  'battlenet',
  'registry',
  'custom',
];
