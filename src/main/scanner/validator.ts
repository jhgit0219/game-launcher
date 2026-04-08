import { getDb, persistDb } from '../db/index';
import { getSetting } from '../db/settings';
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
  source: 'steam' | 'steamgriddb' | 'heuristic' | 'cache';
}

/** Platforms whose results are already known-good games — skip remote validation. */
const TRUSTED_PLATFORMS = new Set<string>(['steam', 'epic', 'gog', 'origin', 'battlenet']);

const STEAM_SEARCH_URL =
  'https://store.steampowered.com/api/storesearch/?term={TERM}&l=english&cc=US';

const REQUEST_DELAY_MS = 200;
const MAX_VALIDATIONS_PER_SCAN = 500;

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
  id: number;
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

const SGDB_API_BASE = 'https://www.steamgriddb.com/api/v2';

async function validateAgainstSteamGridDb(title: string, apiKey: string): Promise<ValidationStatus> {
  if (!apiKey) return 'unverified';
  try {
    const url = `${SGDB_API_BASE}/search/autocomplete/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'unverified';

    const data = await res.json() as { success: boolean; data: Array<{ name: string }> };
    if (!data.success || !data.data?.length) return 'unverified';

    for (const item of data.data.slice(0, 5)) {
      if (titlesMatch(title, item.name)) return 'confirmed';
    }
    return 'unverified';
  } catch {
    return 'unverified';
  }
}

interface SteamAppGenre {
  id: string;
  description: string;
}

/**
 * Check Steam appdetails to see if an app is actually a game by its genres.
 * Game genres have IDs 1-49 (Action, RPG, Strategy, etc.)
 * Software genres have IDs 50+ (Utilities, Animation & Modeling, etc.)
 * If ALL genres are 50+, it's software. If ANY genre is under 50, it's a game.
 */
async function isGameByGenre(appId: number): Promise<boolean> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return true; // Can't check — assume game to avoid false rejections

    const data = await res.json() as Record<string, { success: boolean; data?: { genres?: SteamAppGenre[] } }>;
    const appData = data[String(appId)];
    if (!appData?.success || !appData.data?.genres?.length) return true; // No genre info — assume game

    const hasGameGenre = appData.data.genres.some((g) => parseInt(g.id, 10) < 50);
    return hasGameGenre;
  } catch {
    return true; // Network error — assume game
  }
}

/**
 * Read the CompanyName from a Windows exe's version info.
 * Returns null if it can't be read.
 */
function getExeCompany(exePath: string | null): string | null {
  if (!exePath) return null;
  try {
    const { execSync } = require('node:child_process');
    // Pass path via env variable to avoid PowerShell escaping issues
    const output = execSync(
      'powershell.exe -NoProfile -Command "[System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:EXEPATH).CompanyName"',
      { encoding: 'utf-8', timeout: 5000, windowsHide: true, env: { ...process.env, EXEPATH: exePath } },
    );
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if the Steam game's developer/publisher plausibly matches the local
 * exe's company name. Used to catch false positives where a non-game shares
 * the same name as a Steam game (e.g. "Audacity" audio editor vs the game).
 */
async function steamDevMatchesExe(appId: number, exePath: string | null): Promise<boolean> {
  const company = getExeCompany(exePath);
  if (!company) return true; // Can't check — assume match

  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return true;

    const data = await res.json() as Record<string, { success: boolean; data?: { developers?: string[]; publishers?: string[] } }>;
    const appData = data[String(appId)];
    if (!appData?.success || !appData.data) return true;

    const devs = [...(appData.data.developers ?? []), ...(appData.data.publishers ?? [])];
    if (devs.length === 0) return true;

    // Check if the exe company name overlaps with any dev/publisher
    const companyLower = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const dev of devs) {
      const devLower = dev.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (companyLower.includes(devLower) || devLower.includes(companyLower)) return true;
    }

    return false; // No match — likely a different app with the same name
  } catch {
    return true;
  }
}

async function validateAgainstSteam(title: string, exePath?: string | null): Promise<ValidationStatus> {
  const data = await searchSteamStore(title);
  if (!data || data.total === 0 || data.items.length === 0) return 'unverified';

  for (const item of data.items.slice(0, 5)) {
    if (!titlesMatch(title, item.name)) continue;

    if (item.id) {
      // Check genre — is it actually a game category?
      const isGame = await isGameByGenre(item.id);
      if (!isGame) return 'not_a_game';

      // Check developer vs local exe company — catch same-name false positives
      if (exePath) {
        const devMatches = await steamDevMatchesExe(item.id, exePath);
        if (!devMatches) return 'not_a_game';
      }
    }
    return 'confirmed';
  }

  return 'unverified';
}

async function validateTitle(title: string, exePath?: string | null): Promise<{ status: ValidationStatus; source: 'steamgriddb' | 'steam' | 'heuristic' }> {
  // Check Steam Store first — if Steam confirms it, it's definitely a game
  const steamStatus = await validateAgainstSteam(title, exePath);
  if (steamStatus === 'confirmed') return { status: 'confirmed', source: 'steam' };

  // Try SteamGridDB — broader catalog but includes non-games (Overwolf, LGHub, etc.)
  // So a SteamGridDB-only match is weaker; mark as 'unverified' rather than 'confirmed'.
  // The orchestrator will keep it only if the folder also has game indicators.
  const apiKey = getSetting('steamGridDbApiKey');
  if (apiKey) {
    const sgdbStatus = await validateAgainstSteamGridDb(title, apiKey);
    if (sgdbStatus === 'confirmed') return { status: 'unverified', source: 'steamgriddb' };
  }

  // Neither found it
  return { status: 'not_a_game', source: 'heuristic' };
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

  // Validate uncached results against SteamGridDB (primary) then Steam Store (fallback).
  const toQuery = needsRemote.slice(0, MAX_VALIDATIONS_PER_SCAN);
  const skipped = needsRemote.slice(MAX_VALIDATIONS_PER_SCAN);

  for (const result of toQuery) {
    const key = result.title.toLowerCase();

    const { status, source } = await validateTitle(result.title, result.exePath);
    const entry: ValidationResult = {
      title: result.title,
      status,
      source,
    };
    output.set(key, entry);
    saveValidationEntry(result.title, status, source as 'steam' | 'heuristic');

    await delay(REQUEST_DELAY_MS);
  }

  // Results exceeding the per-scan cap are re-evaluated next scan.
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
