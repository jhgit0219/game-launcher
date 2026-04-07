import { getDb, persistDb } from '../db/index';
import type { ScanResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationStatus =
  | 'confirmed' // Found on Steam store search with a close title match
  | 'not_a_game' // Searched and definitively not a game
  | 'unverified'; // Could not confirm either way

export interface ValidationResult {
  title: string;
  status: ValidationStatus;
  source: 'steam' | 'heuristic' | 'cache';
}

/** Platforms whose results are already known-good games — skip remote validation. */
const TRUSTED_PLATFORMS = new Set<string>(['steam', 'epic', 'gog', 'origin', 'battlenet']);

const STEAM_SEARCH_URL =
  'https://store.steampowered.com/api/storesearch/?term={TERM}&l=english&cc=US';

const REQUEST_DELAY_MS = 300;
const MAX_VALIDATIONS_PER_SCAN = 30;

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Load the full validation cache from the database into a Map keyed by
 * lower-cased title. Called once per scan before processing begins.
 */
export function loadValidationCache(): Map<string, ValidationResult> {
  const db = getDb();
  const results = db.exec(
    `SELECT title, is_game, source FROM game_validation`,
  );

  const cache = new Map<string, ValidationResult>();
  if (!results[0]) return cache;

  const { columns, values } = results[0];
  const titleIdx = columns.indexOf('title');
  const isGameIdx = columns.indexOf('is_game');
  const sourceIdx = columns.indexOf('source');

  for (const row of values) {
    const title = row[titleIdx] as string;
    const isGame = row[isGameIdx] as number;
    const source = row[sourceIdx] as string;

    let status: ValidationStatus;
    if (isGame === 1) status = 'confirmed';
    else if (isGame === 0) status = 'not_a_game';
    else status = 'unverified';

    cache.set(title.toLowerCase(), {
      title,
      status,
      source: source as ValidationResult['source'],
    });
  }

  return cache;
}

/**
 * Persist a single validation result to the database. Uses INSERT OR REPLACE
 * so repeated scans update stale cache entries.
 */
function saveValidationEntry(title: string, status: ValidationStatus, source: 'steam' | 'heuristic'): void {
  const isGame = status === 'confirmed' ? 1 : status === 'not_a_game' ? 0 : -1;
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO game_validation (title, is_game, source)
     VALUES (?, ?, ?)`,
    [title, isGame, source],
  );
  persistDb();
}

// ---------------------------------------------------------------------------
// Steam store search
// ---------------------------------------------------------------------------

interface SteamSearchApp {
  name: string;
  [key: string]: unknown;
}

interface SteamSearchResponse {
  total: number;
  items: SteamSearchApp[];
}

async function searchSteamStore(term: string): Promise<SteamSearchResponse | null> {
  const url = STEAM_SEARCH_URL.replace('{TERM}', encodeURIComponent(term));
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'game-launcher/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SteamSearchResponse;
  } catch {
    return null;
  }
}

/**
 * Normalise a title for fuzzy comparison: lowercase, strip punctuation and
 * common noise words so "Call of Duty®: Modern Warfare" matches
 * "Call of Duty: Modern Warfare".
 */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(query: string, candidate: string): boolean {
  const a = normaliseTitle(query);
  const b = normaliseTitle(candidate);

  // Exact match after normalisation.
  if (a === b) return true;

  // One contains the other (handles subtitle variations).
  if (a.length >= 3 && (b.startsWith(a) || a.startsWith(b))) return true;

  return false;
}

async function validateAgainstSteam(title: string): Promise<ValidationStatus> {
  const data = await searchSteamStore(title);
  if (!data || data.total === 0 || data.items.length === 0) return 'unverified';

  for (const item of data.items.slice(0, 5)) {
    if (titlesMatch(title, item.name)) return 'confirmed';
  }

  // Results exist but nothing matched closely — leave as unverified rather
  // than marking as not_a_game, since the store search may simply be noisy.
  return 'unverified';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a batch of scan results that passed the local filter. Results from
 * trusted platform scanners (Steam, Epic, GOG, etc.) are short-circuited as
 * confirmed. Registry and drive-scan results are checked against the cache
 * first, then against the Steam store search for up to MAX_VALIDATIONS_PER_SCAN
 * uncached titles.
 *
 * Returns a map of lower-cased title → ValidationResult for the caller to use
 * when deciding which results to persist.
 */
export async function validateResults(
  results: ScanResult[],
  existingCache: Map<string, ValidationResult>,
): Promise<Map<string, ValidationResult>> {
  const output = new Map<string, ValidationResult>(existingCache);
  const needsRemote: ScanResult[] = [];

  for (const result of results) {
    const key = result.title.toLowerCase();

    // Already validated.
    if (output.has(key)) continue;

    // Trusted platform — mark confirmed without a network call.
    if (TRUSTED_PLATFORMS.has(result.platform)) {
      const entry: ValidationResult = {
        title: result.title,
        status: 'confirmed',
        source: 'heuristic',
      };
      output.set(key, entry);
      saveValidationEntry(result.title, 'confirmed', 'heuristic');
      continue;
    }

    needsRemote.push(result);
  }

  // Process uncached registry/drive-scan results against Steam.
  const toQuery = needsRemote.slice(0, MAX_VALIDATIONS_PER_SCAN);
  const skipped = needsRemote.slice(MAX_VALIDATIONS_PER_SCAN);

  for (const result of toQuery) {
    const key = result.title.toLowerCase();

    const status = await validateAgainstSteam(result.title);
    const entry: ValidationResult = {
      title: result.title,
      status,
      source: 'steam',
    };
    output.set(key, entry);
    saveValidationEntry(result.title, status, 'steam');

    // Respect rate limit between requests.
    await delay(REQUEST_DELAY_MS);
  }

  // Results that exceeded the per-scan cap are marked unverified without
  // querying the network. They will be re-evaluated on the next scan.
  for (const result of skipped) {
    const key = result.title.toLowerCase();
    const entry: ValidationResult = {
      title: result.title,
      status: 'unverified',
      source: 'heuristic',
    };
    output.set(key, entry);
    saveValidationEntry(result.title, 'unverified', 'heuristic');
  }

  return output;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
