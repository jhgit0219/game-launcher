/**
 * SteamGridDB cover art provider.
 * Requires a user-supplied API key (free tier).
 * API docs: https://www.steamgriddb.com/api/v2
 */

const API_BASE = 'https://www.steamgriddb.com/api/v2';

interface SteamGridSearchResult {
  id: number;
  name: string;
  types: string[];
}

interface SteamGridGridResult {
  url: string;
  score: number;
  style: string;
}

interface SteamGridResponse<T> {
  success: boolean;
  data: T[];
}

export async function fetchSteamGridDbCover(
  title: string,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;

  const headers = { Authorization: `Bearer ${apiKey}` };

  // Step 1: Search for the game by name, finding the best title match.
  // If no results, retry with the longest word (handles abbreviations like "TES Skyrim").
  let gameId: number | null = null;
  try {
    let searchData: SteamGridSearchResult[] = [];

    const searchUrl = `${API_BASE}/search/autocomplete/${encodeURIComponent(title)}`;
    const searchRes = await fetchWithTimeout(searchUrl, { headers });
    if (searchRes.ok) {
      const searchJson = (await searchRes.json()) as SteamGridResponse<SteamGridSearchResult>;
      if (searchJson.success) searchData = searchJson.data;
    }

    // Fallback: retry with the longest word from the title
    if (searchData.length === 0) {
      const words = title.split(/\s+/).filter(w => w.length >= 4);
      const longest = words.sort((a, b) => b.length - a.length)[0];
      if (longest && longest.toLowerCase() !== title.toLowerCase()) {
        const retryUrl = `${API_BASE}/search/autocomplete/${encodeURIComponent(longest)}`;
        const retryRes = await fetchWithTimeout(retryUrl, { headers });
        if (retryRes.ok) {
          const retryJson = (await retryRes.json()) as SteamGridResponse<SteamGridSearchResult>;
          if (retryJson.success) searchData = retryJson.data;
        }
      }
    }

    if (searchData.length === 0) return null;

    // Find the best matching title rather than blindly taking the first result.
    // This prevents "Bejeweled 2" from getting "Bejeweled" art.
    const normQuery = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    let bestMatch = searchData[0]!;
    let bestScore = -1;

    for (const item of searchData) {
      let score = 0;
      const normName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Title similarity
      if (normName === normQuery) {
        score += 50;
      } else if (normName.includes(normQuery) || normQuery.includes(normName)) {
        const lengthRatio = Math.min(normName.length, normQuery.length) / Math.max(normName.length, normQuery.length);
        score += lengthRatio * 30;
      } else {
        continue; // No title match at all
      }

      // Strongly prefer PC/Steam versions over console entries.
      // items with types:['steam'] are PC games; empty types are usually console.
      const hasSteamType = item.types?.includes('steam');
      const hasAnyPcType = item.types?.some((t: string) =>
        ['steam', 'egs', 'origin', 'gog', 'battlenet', 'uplay'].includes(t)
      );
      if (hasSteamType) score += 40;
      else if (hasAnyPcType) score += 30;
      else if (item.types?.length > 0) score += 10;
      // No types = likely console-only, no bonus

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    gameId = bestMatch.id;
  } catch {
    return null;
  }

  // Step 2: Try portrait grids first, then any grid, then heroes (landscape)
  const queries = [
    `grids/game/${gameId}?dimensions=600x900&types=static&nsfw=false`,
    `grids/game/${gameId}?types=static&nsfw=false`,
    `heroes/game/${gameId}?types=static&nsfw=false`,
  ];

  for (const query of queries) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/${query}`, { headers });
      if (!res.ok) continue;

      const json = (await res.json()) as SteamGridResponse<SteamGridGridResult>;
      if (!json.success || !json.data.length) continue;

      const sorted = [...json.data].sort((a, b) => b.score - a.score);
      if (sorted[0]?.url) return sorted[0].url;
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
