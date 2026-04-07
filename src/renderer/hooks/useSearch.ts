import { useState, useMemo } from 'react';
import { useDebounce } from './useDebounce';

interface UseSearchResult {
  query: string;
  debouncedQuery: string;
  setQuery: (value: string) => void;
  clear: () => void;
}

export function useSearch(delayMs = 300): UseSearchResult {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, delayMs);

  return useMemo(
    () => ({
      query,
      debouncedQuery,
      setQuery,
      clear: () => setQuery(''),
    }),
    [query, debouncedQuery],
  );
}
