import { useCallback, useState, useMemo, useRef, useEffect, type ChangeEvent } from 'react';
import { useLibrary } from '../context/LibraryContext';
import type { Game, Platform } from '../types/game';
import { ALL_PLATFORMS, PLATFORM_LABELS } from '../../shared/constants';
import { useScanProgress } from '../hooks/useScanProgress';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  games?: Game[];
  onSelectGame?: (game: Game) => void;
}

export function Sidebar({ games = [], onSelectGame }: SidebarProps) {
  const {
    view,
    setView,
    searchQuery,
    setSearchQuery,
    platforms,
    togglePlatform,
    favoritesOnly,
    setFavoritesOnly,
    recentlyPlayed,
    setRecentlyPlayed,
    clearFilters,
    activeFilterCount,
  } = useLibrary();

  const { scanning, progress, startScan } = useScanProgress();

  const [quickFiltersCollapsed, setQuickFiltersCollapsed] = useState(false);
  const [platformsCollapsed, setPlatformsCollapsed] = useState(false);

  const [collapsedPlatforms, setCollapsedPlatforms] = useState<Set<Platform>>(
    new Set(),
  );

  const toggleCollapse = useCallback((platform: Platform) => {
    setCollapsedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }, []);

  const gamesByPlatform = useMemo(() => {
    const grouped = new Map<Platform, Game[]>();
    for (const game of games) {
      const list = grouped.get(game.platform);
      if (list) {
        list.push(game);
      } else {
        grouped.set(game.platform, [game]);
      }
    }
    // Sort games within each platform alphabetically
    for (const list of grouped.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return grouped;
  }, [games]);

  const favoriteGames = useMemo(
    () => games.filter((g) => g.favorite),
    [games],
  );

  const recentGames = useMemo(() => {
    return games
      .filter((g) => g.lastPlayed !== null)
      .sort(
        (a, b) =>
          new Date(b.lastPlayed!).getTime() -
          new Date(a.lastPlayed!).getTime(),
      )
      .slice(0, 5);
  }, [games]);

  const handleGameClick = useCallback(
    (game: Game) => {
      onSelectGame?.(game);
    },
    [onSelectGame],
  );

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  // ── Resizable filters / game-list split ─────────────────────────────────

  // Height of the filters section in pixels. null means use natural height.
  const [filtersHeight, setFiltersHeight] = useState<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(0);
  const filtersRef = useRef<HTMLDivElement>(null);

  const handleDragHandleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartHeight.current =
        filtersRef.current?.getBoundingClientRect().height ?? filtersHeight ?? 200;
    },
    [filtersHeight],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragStartY.current === null) return;
      const delta = e.clientY - dragStartY.current;
      const next = Math.max(80, dragStartHeight.current + delta);
      setFiltersHeight(next);
    }

    function onMouseUp() {
      dragStartY.current = null;
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <aside className={styles.sidebar} aria-label="Sidebar navigation">
      {/* Search */}
      <div className={styles.searchBox}>
        <svg
          className={styles.searchIcon}
          width="16"
          height="16"
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
            className={styles.clearSearch}
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            &#10005;
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        <button
          className={`${styles.navItem} ${view === 'library' ? styles.navItemActive : ''}`}
          onClick={() => setView('library')}
        >
          <span className={styles.navIcon}>&#127918;</span>
          Library
        </button>
        <button
          className={`${styles.navItem} ${view === 'apps' ? styles.navItemActive : ''}`}
          onClick={() => setView('apps')}
        >
          <span className={styles.navIcon}>&#128187;</span>
          Apps
        </button>
        <button
          className={`${styles.navItem} ${view === 'settings' ? styles.navItemActive : ''}`}
          onClick={() => setView('settings')}
        >
          <span className={styles.navIcon}>&#9881;</span>
          Settings
        </button>
      </nav>

      {/* Filters (only in library view) */}
      {view === 'library' && (
        <div
          ref={filtersRef}
          className={styles.filters}
          style={filtersHeight !== null ? { flexShrink: 0, height: filtersHeight, minHeight: 80, overflow: 'hidden auto' } : undefined}
        >
          {/* Quick filters — collapsible */}
          <div className={styles.filterSection}>
            <button
              className={styles.filterTitle}
              onClick={() => setQuickFiltersCollapsed(v => !v)}
              aria-expanded={!quickFiltersCollapsed}
            >
              <span className={`${styles.collapseIcon} ${quickFiltersCollapsed ? styles.collapseIconCollapsed : ''}`}>&#9660;</span>
              Quick Filters
            </button>
            {!quickFiltersCollapsed && (
              <>
                <label className={styles.filterCheck}>
                  <input
                    type="checkbox"
                    checked={favoritesOnly}
                    onChange={(e) => setFavoritesOnly(e.target.checked)}
                  />
                  <span>Favorites</span>
                </label>
                <label className={styles.filterCheck}>
                  <input
                    type="checkbox"
                    checked={recentlyPlayed}
                    onChange={(e) => setRecentlyPlayed(e.target.checked)}
                  />
                  <span>Recently Played</span>
                </label>
              </>
            )}
          </div>

          {/* Platform filters — collapsible */}
          <div className={styles.filterSection}>
            <button
              className={styles.filterTitle}
              onClick={() => setPlatformsCollapsed(v => !v)}
              aria-expanded={!platformsCollapsed}
            >
              <span className={`${styles.collapseIcon} ${platformsCollapsed ? styles.collapseIconCollapsed : ''}`}>&#9660;</span>
              Platforms
            </button>
            {!platformsCollapsed && (
              ALL_PLATFORMS.map((platform) => (
                <label key={platform} className={styles.filterCheck}>
                  <input
                    type="checkbox"
                    checked={platforms.includes(platform)}
                    onChange={() => togglePlatform(platform)}
                  />
                  <span>{PLATFORM_LABELS[platform]}</span>
                </label>
              ))
            )}
          </div>

          {activeFilterCount > 0 && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      {/* Drag handle — only shown in library view when both panels are present */}
      {view === 'library' && games.length > 0 && (
        <div
          className={styles.dragHandle}
          role="separator"
          aria-label="Resize filters panel"
          onMouseDown={handleDragHandleMouseDown}
        />
      )}

      {/* Game List (only in library view) */}
      {view === 'library' && games.length > 0 && (
        <div className={styles.gameList}>
          {/* Library section */}
          {(favoriteGames.length > 0 || recentGames.length > 0) && (
            <div className={styles.gameListSection}>
              <h4 className={styles.filterTitle}>Library</h4>
              {favoriteGames.length > 0 && (
                <button
                  className={styles.gameListHeader}
                  onClick={() => toggleCollapse('custom' as Platform)}
                  aria-label="Toggle favorites"
                >
                  <span className={styles.gameListHeaderText}>
                    Favorites ({favoriteGames.length})
                  </span>
                </button>
              )}
              {recentGames.length > 0 && (
                <>
                  <div className={styles.gameListSubHeader}>
                    Recently Played ({recentGames.length})
                  </div>
                  {recentGames.map((game) => (
                    <button
                      key={`recent-${game.id}`}
                      className={styles.gameListItem}
                      onClick={() => handleGameClick(game)}
                      title={game.title}
                    >
                      {game.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Platforms section */}
          <div className={styles.gameListSection}>
            <h4 className={styles.filterTitle}>Platforms</h4>
            {ALL_PLATFORMS.map((platform) => {
              const platformGames = gamesByPlatform.get(platform);
              if (!platformGames || platformGames.length === 0) return null;

              const collapsed = collapsedPlatforms.has(platform);

              return (
                <div key={platform}>
                  <button
                    className={styles.gameListHeader}
                    onClick={() => toggleCollapse(platform)}
                    aria-expanded={!collapsed}
                    aria-label={`${PLATFORM_LABELS[platform]}, ${platformGames.length} games`}
                  >
                    <span
                      className={`${styles.collapseIcon} ${collapsed ? styles.collapseIconCollapsed : ''}`}
                      aria-hidden="true"
                    >
                      &#9660;
                    </span>
                    <span className={styles.gameListHeaderText}>
                      {PLATFORM_LABELS[platform]} ({platformGames.length})
                    </span>
                  </button>
                  {!collapsed && (
                    <div className={styles.gameListItems}>
                      {platformGames.map((game) => (
                        <button
                          key={game.id}
                          className={styles.gameListItem}
                          onClick={() => handleGameClick(game)}
                          title={game.title}
                        >
                          {game.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan status */}
      <div className={styles.scanSection}>
        {scanning ? (
          <div className={styles.scanProgress}>
            <div className={styles.scanDot} />
            <span className={styles.scanText}>
              Scanning {progress?.source ?? '...'}
              {progress ? ` (${progress.found} found)` : ''}
            </span>
          </div>
        ) : (
          <button className={styles.scanBtn} onClick={startScan}>
            Scan for Games
          </button>
        )}
      </div>
    </aside>
  );
}
