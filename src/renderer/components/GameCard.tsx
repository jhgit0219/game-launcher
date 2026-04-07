import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import type { Game } from '../types/game';
import { PLATFORM_LABELS } from '../../shared/constants';
import { ipc } from '../lib/ipc';
import styles from './GameCard.module.css';

export interface GameCardProps {
  game: Game;
  onClick: (game: Game) => void;
  onDoubleClick: (game: Game) => void;
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

export function GameCard({ game, onClick, onDoubleClick }: GameCardProps) {
  const [imgError, setImgError] = useState(false);
  const [coverPath, setCoverPath] = useState(game.coverArtPath);

  // Trigger art fetch if no cover art cached
  useEffect(() => {
    if (!coverPath) {
      ipc.art.fetch(game.id).then((path) => {
        if (path) setCoverPath(path);
      }).catch(() => {});
    }
  }, [game.id, coverPath]);

  // Update cover when game prop changes (e.g. after scan refresh)
  useEffect(() => {
    if (game.coverArtPath && game.coverArtPath !== coverPath) {
      setCoverPath(game.coverArtPath);
    }
  }, [game.coverArtPath, coverPath]);

  const handleClick = useCallback(() => {
    onClick(game);
  }, [game, onClick]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick(game);
  }, [game, onDoubleClick]);

  const handleFavorite = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      ipc.games.favorite(game.id);
    },
    [game.id],
  );

  const showCover = coverPath && !imgError;

  return (
    <div
      className={styles.card}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={0}
      aria-label={`${game.title} - ${PLATFORM_LABELS[game.platform]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick();
      }}
    >
      {showCover ? (
        <>
          <img
            className={styles.cover}
            src={coverPath}
            alt={game.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
          {/* Overlay with title — only on cover images */}
          <div className={styles.overlay}>
            <div className={styles.info}>
              <span className={styles.title}>{game.title}</span>
              <span className={styles.meta}>
                {PLATFORM_LABELS[game.platform]}
                {game.playtimeMinutes > 0 && ` · ${formatPlaytime(game.playtimeMinutes)}`}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.placeholder} data-platform={game.platform}>
          <span className={styles.placeholderTitle}>{game.title}</span>
          <span className={styles.placeholderMeta}>
            {PLATFORM_LABELS[game.platform]}
            {game.playtimeMinutes > 0 && ` · ${formatPlaytime(game.playtimeMinutes)}`}
          </span>
        </div>
      )}

      <button
        className={`${styles.favorite} ${game.favorite ? styles.favoriteActive : ''}`}
        onClick={handleFavorite}
        aria-label={game.favorite ? 'Remove from favorites' : 'Add to favorites'}
        title={game.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {game.favorite ? '\u2605' : '\u2606'}
      </button>
    </div>
  );
}
