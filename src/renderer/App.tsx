import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useLibrary } from './context/LibraryContext';
import { useGames } from './hooks/useGames';
import { useSettings } from './hooks/useSettings';
import { ipc } from './lib/ipc';
import { Sidebar } from './components/Sidebar';
import { GameGrid } from './components/GameGrid';
import { GameDetail } from './components/GameDetail';
import { AppShortcuts } from './components/AppShortcuts';
import { DownloadToast } from './components/DownloadToast';
import { Settings } from './components/Settings';
import { SortDropdown } from './components/SortDropdown';
import { PlatformFilter } from './components/PlatformFilter';
import { ThumbnailSizeSelector } from './components/ThumbnailSizeSelector';
import type { Game, GameStatus, Platform, GamesListFilter } from './types/game';
import styles from './App.module.css';

export function App() {
  const {
    view,
    searchQuery,
    setSearchQuery,
    favoritesOnly,
    recentlyPlayed,
    sortBy,
    setSortBy,
    selectedGame,
    setSelectedGame,
  } = useLibrary();

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  const filter = useMemo<GamesListFilter>(
    () => ({
      favoritesOnly: favoritesOnly || undefined,
      recentlyPlayed: recentlyPlayed || undefined,
      sortBy,
    }),
    [favoritesOnly, recentlyPlayed, sortBy],
  );

  const { games: allGames, loading, refetch } = useGames(filter);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');

  // Client-side filtering for instant reactive response
  const games = useMemo(() => {
    let filtered = allGames;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((g) => g.title.toLowerCase().includes(q));
    }
    if (statusFilter) {
      filtered = filtered.filter((g) => g.status === statusFilter);
    }
    if (platformFilter !== 'all') {
      filtered = filtered.filter((g) => g.platform === platformFilter);
    }
    return filtered;
  }, [allGames, searchQuery, statusFilter, platformFilter]);

  const { settings, updateSettings } = useSettings();
  const thumbnailSize = settings.thumbnailSize ?? 'medium';
  const sidebarAutoHide = settings.sidebarAutoHide ?? false;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Subscribe to fullscreen state changes from the main process
  useEffect(() => {
    const unsub = ipc.window.onFullscreenChanged((fs) => {
      setIsFullscreen(fs);
    });
    return unsub;
  }, []);

  // Handle F11 and ESC for fullscreen toggling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F11') {
        e.preventDefault();
        ipc.window.toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        ipc.window.toggleFullscreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Refetch games when a scan completes
  useEffect(() => {
    const unsub = ipc.scan.onComplete(() => {
      refetch();
    });
    return unsub;
  }, [refetch]);

  // Refetch games when cover art is downloaded (so cards show the new cover)
  useEffect(() => {
    const unsub = ipc.art.onUpdated(() => {
      refetch();
    });
    return unsub;
  }, [refetch]);

  const handleGameStatusChange = useCallback((gameId: string, status: string) => {
    ipc.games.setStatus(gameId, status as GameStatus);
    refetch();
  }, [refetch]);

  const handleSelectGame = useCallback(
    (game: Game) => {
      setSelectedGame(game);
    },
    [setSelectedGame],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedGame(null);
  }, [setSelectedGame]);

  return (
    <div className={styles.shell} data-fullscreen={isFullscreen || undefined}>
      <Sidebar
        games={games}
        onSelectGame={handleSelectGame}
        autoHide={sidebarAutoHide}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        onGameStatusChange={handleGameStatusChange}
      />

      <main className={`${styles.content} ${sidebarAutoHide ? styles.contentAutoHide : ''}`}>
        {view === 'library' && (
          <>
            <header className={styles.header}>
              <div className={styles.headerLeft}>
                <h1 className={styles.heading}>
                  Library
                  {(statusFilter || platformFilter !== 'all') && (
                    <span className={styles.filterBadge}>
                      {statusFilter && statusFilter.replace('-', ' ')}
                      {statusFilter && platformFilter !== 'all' && ' · '}
                      {platformFilter !== 'all' && platformFilter}
                    </span>
                  )}
                </h1>
                {!loading && (
                  <span className={styles.count}>
                    {games.length} game{games.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className={styles.searchBar}>
                <svg
                  className={styles.searchIcon}
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="10.5" y1="10.5" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search games..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  aria-label="Search games"
                />
                {searchQuery && (
                  <button
                    className={styles.searchClear}
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    &#10005;
                  </button>
                )}
              </div>

              <div className={styles.headerRight}>
                <button
                  className={styles.headerBtn}
                  onClick={refetch}
                  title="Refresh library"
                >
                  &#8635;
                </button>
                <ThumbnailSizeSelector
                  value={thumbnailSize}
                  onChange={(size) => updateSettings({ thumbnailSize: size })}
                />
                <PlatformFilter value={platformFilter} onChange={setPlatformFilter} />
                <SortDropdown value={sortBy} onChange={setSortBy} />
              </div>
            </header>

            <GameGrid
              games={games}
              loading={loading}
              onSelectGame={handleSelectGame}
              thumbnailSize={thumbnailSize}
            />

            <AppShortcuts />
          </>
        )}

        {view === 'apps' && <AppShortcuts />}

        {view === 'settings' && <Settings />}
      </main>

      {selectedGame && (
        <GameDetail game={selectedGame} onClose={handleCloseDetail} onStatusChange={refetch} />
      )}

      <DownloadToast />
    </div>
  );
}
