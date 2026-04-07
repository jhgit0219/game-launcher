import { useCallback, useEffect, useState, useRef } from 'react';
import type { Game } from '../types/game';
import { PLATFORM_LABELS } from '../../shared/constants';
import { ipc } from '../lib/ipc';
import styles from './GameDetail.module.css';

export interface GameDetailProps {
  game: Game;
  onClose: () => void;
}

function formatPlaytime(minutes: number): string {
  if (minutes === 0) return 'Never played';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${hours}h ${remaining}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function GameDetail({ game, onClose }: GameDetailProps) {
  const [launching, setLaunching] = useState(false);
  const [imgError, setImgError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    try {
      await ipc.games.launch(game.id);
    } finally {
      setLaunching(false);
    }
  }, [game.id]);

  const handleFavorite = useCallback(() => {
    ipc.games.favorite(game.id);
  }, [game.id]);

  const handleHide = useCallback(() => {
    ipc.games.hide(game.id);
    onClose();
  }, [game.id, onClose]);

  const handleOpenFolder = useCallback(() => {
    ipc.games.openInstallFolder(game.id);
  }, [game.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const showCover = game.coverArtPath && !imgError;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${game.title} details`}
        tabIndex={-1}
      >
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close details"
        >
          &#10005;
        </button>

        <div className={styles.coverArea}>
          {showCover ? (
            <img
              className={styles.coverImg}
              src={game.coverArtPath ?? undefined}
              alt={game.title}
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className={styles.coverPlaceholder}
              data-platform={game.platform}
            >
              <span className={styles.coverPlaceholderText}>{game.title}</span>
            </div>
          )}
        </div>

        <div className={styles.content}>
          <h2 className={styles.title}>{game.title}</h2>

          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Platform</span>
              <span className={styles.metaValue}>
                {PLATFORM_LABELS[game.platform]}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Playtime</span>
              <span className={styles.metaValue}>
                {formatPlaytime(game.playtimeMinutes)}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last Played</span>
              <span className={styles.metaValue}>
                {formatDate(game.lastPlayed)}
              </span>
            </div>
            {game.installPath && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Location</span>
                <span className={`${styles.metaValue} ${styles.pathValue}`}>
                  {game.installPath}
                </span>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.launchBtn}
              onClick={handleLaunch}
              disabled={launching}
            >
              {launching ? 'Launching...' : 'Launch Game'}
            </button>

            <div className={styles.secondaryActions}>
              <button
                className={styles.actionBtn}
                onClick={handleFavorite}
              >
                {game.favorite ? '\u2605 Unfavorite' : '\u2606 Favorite'}
              </button>
              {game.installPath && (
                <button
                  className={styles.actionBtn}
                  onClick={handleOpenFolder}
                >
                  Open Folder
                </button>
              )}
              <button
                className={`${styles.actionBtn} ${styles.dangerBtn}`}
                onClick={handleHide}
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
