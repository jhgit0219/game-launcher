import { getDb, persistDb } from '../db/index';
import { getSetting } from '../db/settings';
import type { ScanResult } from './types';

const STEAM_SEARCH_URL =
  'https://store.steampowered.com/api/storesearch/?term={TERM}&l=english&cc=US';
const SGDB_API_BASE = 'https://www.steamgriddb.com/api/v2';

const REQUEST_DELAY_MS = 250;
const MAX_LOOKUPS_PER_SCAN = 60;

interface TitleCacheEntry {
  original: string;
  resolved: string;
  source: string;
}

/**
 * Load cached title resolutions from the database.
 */
function loadTitleCache(): Map<string, string> {
  const db = getDb();
  const results = db.exec(
    `SELECT original_title, resolved_title FROM title_resolution`,
  );

  const cache = new Map<string, string>();
  if (!results[0]) return cache;

  for (const row of results[0].values) {
    cache.set((row[0] as string).toLowerCase(), row[1] as string);
  }
  return cache;
}

function saveTitleResolution(original: string, resolved: string, source: string): void {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO title_resolution (original_title, resolved_title, source)
     VALUES (?, ?, ?)`,
    [original, resolved, source],
  );
}

function normalise(title: string): string {
  return title
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1.0;
  if (na.length === 0 || nb.length === 0) return 0;

  // Check containment
  if (nb.includes(na) || na.includes(nb)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer;
  }
  return 0;
}

/**
 * Search SteamGridDB for a game title. Returns the official name if found.
 * SteamGridDB has a much broader catalog than Steam Store — covers
 * non-Steam games like Genshin Impact, League of Legends, etc.
 */
async function searchSteamGridDb(query: string, apiKey: string): Promise<string | null> {
  try {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const url = `${SGDB_API_BASE}/search/autocomplete/${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json() as { success: boolean; data: Array<{ id: number; name: string }> };
    let results = data.success ? data.data ?? [] : [];

    // Fallback: retry with longest word if no results (handles "TES Skyrim" → "Skyrim")
    if (results.length === 0) {
      const words = query.split(/\s+/).filter(w => w.length >= 4);
      const longest = words.sort((a, b) => b.length - a.length)[0];
      if (longest && longest.toLowerCase() !== query.toLowerCase()) {
        const retryRes = await fetch(
          `${SGDB_API_BASE}/search/autocomplete/${encodeURIComponent(longest)}`,
          { headers, signal: AbortSignal.timeout(8000) },
        );
        if (retryRes.ok) {
          const retryData = await retryRes.json() as typeof data;
          if (retryData.success) results = retryData.data ?? [];
        }
      }
    }

    if (results.length === 0) return null;

    // Find the best match
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const item of results.slice(0, 5)) {
      const score = similarity(query, item.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item.name;
      }
    }

    // Accept if similarity is above threshold
    if (bestMatch && bestScore >= 0.5) return bestMatch;

    // If the first result's normalized form contains our query, accept it
    const first = results[0];
    if (first && normalise(first.name).includes(normalise(query))) {
      return first.name;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Search Steam Store for a game title. Returns the official name if found.
 */
async function searchSteamStore(query: string): Promise<string | null> {
  try {
    const url = STEAM_SEARCH_URL.replace('{TERM}', encodeURIComponent(query));
    const res = await fetch(url, {
      headers: { 'User-Agent': 'game-launcher/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json() as { total: number; items?: Array<{ name: string }> };
    if (!data.items?.length) return null;

    for (const item of data.items.slice(0, 5)) {
      const score = similarity(query, item.name);
      if (score >= 0.5) return item.name;
    }

    return null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve correct titles for scan results using SteamGridDB and Steam Store.
 * Mutates the results array in-place, updating titles to official names.
 *
 * Only resolves titles for non-trusted platforms (custom, registry, drive-scan)
 * since trusted platforms already have correct titles from their store APIs.
 */
export async function resolveTitles(results: ScanResult[]): Promise<number> {
  const cache = loadTitleCache();
  const apiKey = getSetting('steamGridDbApiKey');
  let resolved = 0;
  let lookups = 0;

  const trustedPlatforms = new Set(['steam', 'epic', 'gog', 'origin', 'battlenet']);

  for (const result of results) {
    // Skip trusted platforms — they already have correct titles
    if (trustedPlatforms.has(result.platform)) continue;

    const key = result.title.toLowerCase();

    // Check cache first
    const cached = cache.get(key);
    if (cached) {
      if (cached !== result.title) {
        result.title = cached;
        resolved++;
      }
      continue;
    }

    // Rate limit
    if (lookups >= MAX_LOOKUPS_PER_SCAN) continue;

    // Try SteamGridDB first (broader catalog), then Steam Store
    let officialName: string | null = null;

    if (apiKey) {
      officialName = await searchSteamGridDb(result.title, apiKey);
      await delay(REQUEST_DELAY_MS);
      lookups++;
    }

    if (!officialName) {
      officialName = await searchSteamStore(result.title);
      await delay(REQUEST_DELAY_MS);
      lookups++;
    }

    if (officialName && officialName !== result.title) {
      saveTitleResolution(result.title, officialName, apiKey ? 'steamgriddb' : 'steam');
      cache.set(key, officialName);
      result.title = officialName;
      resolved++;
    } else {
      // Cache the original title so we don't re-query next scan
      saveTitleResolution(result.title, result.title, 'none');
      cache.set(key, result.title);
    }
  }

  if (resolved > 0) persistDb();
  return resolved;
}

/**
 * Clear the title resolution cache so the next scan re-queries all titles.
 */
export function clearTitleCache(): void {
  const db = getDb();
  db.run(`DELETE FROM title_resolution`);
  persistDb();
}
