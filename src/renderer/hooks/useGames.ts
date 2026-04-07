import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../lib/ipc';
import type { Game, GamesListFilter } from '../types/game';

interface UseGamesResult {
  games: Game[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGames(filter: GamesListFilter): UseGamesResult {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.games.list(filter);
      setGames(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load games';
      setError(message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  return { games, loading, error, refetch: fetchGames };
}
