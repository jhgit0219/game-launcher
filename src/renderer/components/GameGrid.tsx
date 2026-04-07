import { useCallback, useRef } from 'react';
import type { Game } from '../types/game';
import { GameCard } from './GameCard';
import { ipc } from '../lib/ipc';
import styles from './GameGrid.module.css';

export interface GameGridProps {
  games: Game[];
  loading: boolean;
  onSelectGame: (game: Game) => void;
}

export function GameGrid({ games, loading, onSelectGame }: GameGridProps) {
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
