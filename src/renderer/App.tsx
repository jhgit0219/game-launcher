import { useCallback, useEffect, useMemo } from 'react';
import { useLibrary } from './context/LibraryContext';
import { useGames } from './hooks/useGames';
import { useDebounce } from './hooks/useDebounce';
import { ipc } from './lib/ipc';
import { Sidebar } from './components/Sidebar';
import { GameGrid } from './components/GameGrid';
import { GameDetail } from './components/GameDetail';
import { AppShortcuts } from './components/AppShortcuts';
import { Settings } from './components/Settings';
import { SortDropdown } from './components/SortDropdown';
import type { Game, GamesListFilter } from './types/game';
import styles from './App.module.css';

export function App() {
  const {
    view,
    searchQuery,
    platforms,
    favoritesOnly,
    recentlyPlayed,
    sortBy,
    setSortBy,
    selectedGame,
    setSelectedGame,
  } = useLibrary();

  const debouncedSearch = useDebounce(searchQuery, 300);

  const filter = useMemo<GamesListFilter>(
    () => ({
      search: debouncedSearch || undefined,
      platforms: platforms.length > 0 ? platforms : undefined,
      favoritesOnly: favoritesOnly || undefined,
      recentlyPlayed: recentlyPlayed || undefined,
      sortBy,
    }),
    [debouncedSearch, platforms, favoritesOnly, recentlyPlayed, sortBy],
  );

  const { games, loading, refetch } = useGames(filter);

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
    <div className={styles.shell}>
      <Sidebar games={games} onSelectGame={handleSelectGame} />

      <main className={styles.content}>
        {view === 'library' && (
          <>
            <header className={styles.header}>
              <div className={styles.headerLeft}>
                <h1 className={styles.heading}>Library</h1>
                {!loading && (
                  <span className={styles.count}>
                    {games.length} game{games.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={refetch}
                  title="Refresh library"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--bg-active)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  &#8635;
                </button>
                <SortDropdown value={sortBy} onChange={setSortBy} />
              </div>
            </header>

            <GameGrid
              games={games}
              loading={loading}
              onSelectGame={handleSelectGame}
            />

            <AppShortcuts />
          </>
        )}

        {view === 'apps' && <AppShortcuts />}

        {view === 'settings' && <Settings />}
      </main>

      {selectedGame && (
        <GameDetail game={selectedGame} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
