import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useLibrary } from '../context/LibraryContext';
import type { Game, GameStatus, Platform } from '../types/game';
import { ALL_PLATFORMS, PLATFORM_LABELS } from '../../shared/constants';
import { useScanProgress } from '../hooks/useScanProgress';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  games?: Game[];
  onSelectGame?: (game: Game) => void;
  autoHide?: boolean;
  statusFilter?: string | null;
  onStatusFilter?: (status: string | null) => void;
  onGameStatusChange?: (gameId: string, status: string) => void;
}

const STATUS_LIST: { value: GameStatus; label: string }[] = [
  { value: 'unplayed', label: 'Unplayed' },
  { value: 'playing', label: 'Playing' },
  { value: 'completed', label: 'Completed' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
];

export function Sidebar({ games = [], onSelectGame, autoHide = false, statusFilter, onStatusFilter, onGameStatusChange }: SidebarProps) {
  const {
    view,
    setView,
    favoritesOnly,
    setFavoritesOnly,
    recentlyPlayed,
    setRecentlyPlayed,
    clearFilters,
    activeFilterCount,
  } = useLibrary();

  const { scanning, progress, startScan } = useScanProgress();

  const [quickFiltersCollapsed, setQuickFiltersCollapsed] = useState(false);
  const [statusCollapsed, setStatusCollapsed] = useState(false);

  const [hovered, setHovered] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounter = useRef(0);
  const collapsed = autoHide && !hovered;

  const expand = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setHovered(true);
  }, []);

  const scheduleCollapse = useCallback(() => {
    collapseTimer.current = setTimeout(() => {
      setHovered(false);
    }, 300);
  }, []);

  const handleMouseEnter = expand;
  const handleMouseLeave = scheduleCollapse;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) expand();
  }, [expand]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      scheduleCollapse();
    }
  }, [scheduleCollapse]);

  const handleSidebarDrop = useCallback(() => {
    dragCounter.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (collapseTimer.current) {
        clearTimeout(collapseTimer.current);
      }
    };
  }, []);

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
    <aside
      className={`${styles.sidebar} ${autoHide ? styles.sidebarAutoHide : ''} ${collapsed ? styles.sidebarCollapsed : ''}`}
      aria-label="Sidebar navigation"
      onMouseEnter={autoHide ? handleMouseEnter : undefined}
      onMouseLeave={autoHide ? handleMouseLeave : undefined}
      onDragEnter={autoHide ? handleDragEnter : undefined}
      onDragLeave={autoHide ? handleDragLeave : undefined}
      onDrop={autoHide ? handleSidebarDrop : undefined}
    >
      {/* Navigation */}
      <nav className={`${styles.nav} ${collapsed ? styles.navCollapsed : ''}`}>
        <button
          className={`${styles.navItem} ${collapsed ? styles.navItemCollapsed : ''} ${view === 'library' ? styles.navItemActive : ''}`}
          onClick={() => setView('library')}
        >
          <span className={styles.navIcon}>&#127918;</span>
          <span className={`${styles.navLabel} ${collapsed ? styles.navLabelHidden : ''}`}>Library</span>
        </button>
        <button
          className={`${styles.navItem} ${collapsed ? styles.navItemCollapsed : ''} ${view === 'apps' ? styles.navItemActive : ''}`}
          onClick={() => setView('apps')}
        >
          <span className={styles.navIcon}>&#128187;</span>
          <span className={`${styles.navLabel} ${collapsed ? styles.navLabelHidden : ''}`}>Apps</span>
        </button>
        <button
          className={`${styles.navItem} ${collapsed ? styles.navItemCollapsed : ''} ${view === 'settings' ? styles.navItemActive : ''}`}
          onClick={() => setView('settings')}
        >
          <span className={styles.navIcon}>&#9881;</span>
          <span className={`${styles.navLabel} ${collapsed ? styles.navLabelHidden : ''}`}>Settings</span>
        </button>
      </nav>

      <div className={`${styles.sidebarBody} ${collapsed ? styles.sidebarBodyHidden : ''}`}>
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

          {/* Status filters — collapsible */}
          <div className={styles.filterSection}>
            <button
              className={styles.filterTitle}
              onClick={() => setStatusCollapsed(v => !v)}
              aria-expanded={!statusCollapsed}
            >
              <span className={`${styles.collapseIcon} ${statusCollapsed ? styles.collapseIconCollapsed : ''}`}>&#9660;</span>
              Status
            </button>
            {!statusCollapsed && (<>
              {statusFilter && (
                <div
                  className={styles.statusItem}
                  onClick={() => onStatusFilter?.(null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onStatusFilter?.(null); }}
                >
                  <span>All Games</span>
                  <span className={styles.statusCount}>{games.length}</span>
                </div>
              )}
              {STATUS_LIST.map((status) => {
                const count = games.filter(g => g.status === status.value).length;
                const active = statusFilter === status.value;
                return (
                  <div
                    key={status.value}
                    className={`${styles.statusItem} ${active ? styles.statusItemActive : ''}`}
                    onClick={() => onStatusFilter?.(active ? null : status.value)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add(styles.statusItemDragOver);
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove(styles.statusItemDragOver);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove(styles.statusItemDragOver);
                      const gameId = e.dataTransfer.getData('text/gameId');
                      if (gameId) onGameStatusChange?.(gameId, status.value);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onStatusFilter?.(active ? null : status.value);
                    }}
                  >
                    <span>{status.label}</span>
                    <span className={styles.statusCount}>{count}</span>
                  </div>
                );
              })}
            </>)}
          </div>

          {activeFilterCount > 0 && (
            <button className={styles.clearBtn} onClick={clearFilters}>
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      {/* Drag handle */}
      {view === 'library' && games.length > 0 && (
        <div
          className={styles.dragHandle}
          role="separator"
          aria-label="Resize filters panel"
          onMouseDown={handleDragHandleMouseDown}
        />
      )}

      {/* Game List */}
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

              const platformCollapsed = collapsedPlatforms.has(platform);

              return (
                <div key={platform}>
                  <button
                    className={styles.gameListHeader}
                    onClick={() => toggleCollapse(platform)}
                    aria-expanded={!platformCollapsed}
                    aria-label={`${PLATFORM_LABELS[platform]}, ${platformGames.length} games`}
                  >
                    <span
                      className={`${styles.collapseIcon} ${platformCollapsed ? styles.collapseIconCollapsed : ''}`}
                      aria-hidden="true"
                    >
                      &#9660;
                    </span>
                    <span className={styles.gameListHeaderText}>
                      {PLATFORM_LABELS[platform]} ({platformGames.length})
                    </span>
                  </button>
                  {!platformCollapsed && (
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
      </div>{/* end sidebarBody */}
    </aside>
  );
}
