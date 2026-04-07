/**
 * SteamGridDB cover art provider.
 * Requires a user-supplied API key (free tier).
 * API docs: https://www.steamgriddb.com/api/v2
 */

const API_BASE = 'https://www.steamgriddb.com/api/v2';

interface SteamGridSearchResult {
  id: number;
  name: string;
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
  let gameId: number | null = null;
  try {
    const searchUrl = `${API_BASE}/search/autocomplete/${encodeURIComponent(title)}`;
    const searchRes = await fetchWithTimeout(searchUrl, { headers });
    if (!searchRes.ok) return null;

    const searchJson = (await searchRes.json()) as SteamGridResponse<SteamGridSearchResult>;
    if (!searchJson.success || !searchJson.data.length) return null;

    // Find the best matching title rather than blindly taking the first result.
    // This prevents "Bejeweled 2" from getting "Bejeweled" art.
    const normQuery = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    let bestMatch = searchJson.data[0]!;
    let bestScore = 0;

    for (const item of searchJson.data) {
      const normName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normName === normQuery) {
        bestMatch = item;
        bestScore = 100;
        break;
      }
      // Prefer items that contain the full query and are similar length
      if (normName.includes(normQuery) || normQuery.includes(normName)) {
        const lengthRatio = Math.min(normName.length, normQuery.length) / Math.max(normName.length, normQuery.length);
        const score = lengthRatio * 50;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
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
