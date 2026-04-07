import React, { useCallback, useRef } from 'react';
import type { Game } from '../types/game';
import { GameCard } from './GameCard';
import { ipc } from '../lib/ipc';
import styles from './GameGrid.module.css';

export interface GameGridProps {
  games: Game[];
  loading: boolean;
  onSelectGame: (game: Game) => void;
  thumbnailSize?: 'small' | 'medium' | 'large';
}

const THUMB_SIZE_MAP: Record<string, string> = {
  small: '120px',
  medium: '160px',
  large: '220px',
};

export function GameGrid({ games, loading, onSelectGame, thumbnailSize = 'medium' }: GameGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = useCallback((game: Game) => {
    ipc.games.launch(game.id);
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading library...</span>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>&#127918;</span>
        <h3>No games found</h3>
        <p>Try adjusting your filters or scan for games in Settings.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      role="grid"
      aria-label={`Game library, ${games.length} games`}
      style={{ '--grid-col-width': THUMB_SIZE_MAP[thumbnailSize] } as React.CSSProperties}
    >
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          onClick={onSelectGame}
          onDoubleClick={handleDoubleClick}
        />
      ))}
    </div>
  );
}
