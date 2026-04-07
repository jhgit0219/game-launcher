import { randomUUID } from 'node:crypto';
import { getDb, persistDb } from './index';
import type { SqlValue } from 'sql.js';

export type Platform = 'steam' | 'epic' | 'gog' | 'origin' | 'battlenet' | 'registry' | 'custom';
export type GameStatus = 'unplayed' | 'playing' | 'completed' | 'on-hold' | 'dropped';

export interface Game {
  id: string;
  title: string;
  platform: Platform;
  executablePath: string | null;
  installPath: string | null;
  platformId: string | null;
  coverArtPath: string | null;
  coverArtUrl: string | null;
  launchUri: string | null;
  playtimeMinutes: number;
  lastPlayed: string | null;
  favorite: boolean;
  hidden: boolean;
  genre: string | null;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InsertGameInput {
  title: string;
  platform: Platform;
  executablePath?: string | null;
  installPath?: string | null;
  platformId?: string | null;
  coverArtPath?: string | null;
  coverArtUrl?: string | null;
  launchUri?: string | null;
  playtimeMinutes?: number;
  lastPlayed?: string | null;
  favorite?: boolean;
  hidden?: boolean;
  genre?: string | null;
  status?: GameStatus;
}

export interface UpdateGameInput {
  title?: string;
  executablePath?: string | null;
  installPath?: string | null;
  coverArtPath?: string | null;
  coverArtUrl?: string | null;
  launchUri?: string | null;
  playtimeMinutes?: number;
  lastPlayed?: string | null;
  favorite?: boolean;
  hidden?: boolean;
  genre?: string | null;
  status?: GameStatus;
}

export interface ListGamesFilter {
  platform?: Platform;
  favorite?: boolean;
  hidden?: boolean;
  search?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a sql.js QueryExecResult columns/values pair into an array of plain
 * row objects keyed by column name.
 */
function execToRows(
  columns: string[],
  values: SqlValue[][],
): Record<string, SqlValue>[] {
  return values.map((row) => {
    const obj: Record<string, SqlValue> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i] ?? null;
    }
    return obj;
  });
}

/**
 * Run a SELECT that returns at most one row. Returns the row as an object, or
 * `undefined` if the query produced no results.
 */
function queryOne(
  sql: string,
  params: SqlValue[],
): Record<string, SqlValue> | undefined {
  const results = getDb().exec(sql, params);
  if (!results[0] || results[0].values.length === 0) return undefined;
  const { columns, values } = results[0];
  return execToRows(columns, values)[0];
}

/**
 * Run a SELECT that may return multiple rows.
 */
function queryAll(
  sql: string,
  params: SqlValue[],
): Record<string, SqlValue>[] {
  const results = getDb().exec(sql, params);
  if (!results[0]) return [];
  const { columns, values } = results[0];
  return execToRows(columns, values);
}

// Map a raw database row to a typed Game object.
function rowToGame(row: Record<string, SqlValue>): Game {
  return {
    id:               row['id'] as string,
    title:            row['title'] as string,
    platform:         row['platform'] as Platform,
    executablePath:   (row['executable_path'] as string | null) ?? null,
    installPath:      (row['install_path'] as string | null) ?? null,
    platformId:       (row['platform_id'] as string | null) ?? null,
    coverArtPath:     (row['cover_art_path'] as string | null) ?? null,
    coverArtUrl:      (row['cover_art_url'] as string | null) ?? null,
    launchUri:        (row['launch_uri'] as string | null) ?? null,
    playtimeMinutes:  (row['playtime_minutes'] as number) ?? 0,
    lastPlayed:       (row['last_played'] as string | null) ?? null,
    favorite:         (row['favorite'] as number) === 1,
    hidden:           (row['hidden'] as number) === 1,
    genre:            (row['genre'] as string | null) ?? null,
    status:           (row['status'] as GameStatus | null) ?? 'unplayed',
    createdAt:        row['created_at'] as string,
    updatedAt:        row['updated_at'] as string,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function insertGame(input: InsertGameInput): Game {
  const db = getDb();
  const id = randomUUID();
  const now = nowIso();

  db.run(`
    INSERT INTO games (
      id, title, platform, executable_path, install_path, platform_id,
      cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
      favorite, hidden, genre, status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `, [
    id,
    input.title,
    input.platform,
    input.executablePath ?? null,
    input.installPath ?? null,
    input.platformId ?? null,
    input.coverArtPath ?? null,
    input.coverArtUrl ?? null,
    input.launchUri ?? null,
    input.playtimeMinutes ?? 0,
    input.lastPlayed ?? null,
    input.favorite ? 1 : 0,
    input.hidden ? 1 : 0,
    input.genre ?? null,
    input.status ?? 'unplayed',
    now,
    now,
  ]);

  return findGameById(id) as Game;
}

export function updateGame(id: string, input: UpdateGameInput): Game | null {
  const existing = findGameById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: SqlValue[] = [];

  if (input.title !== undefined)          { fields.push('title = ?');            values.push(input.title); }
  if (input.executablePath !== undefined) { fields.push('executable_path = ?');  values.push(input.executablePath); }
  if (input.installPath !== undefined)    { fields.push('install_path = ?');     values.push(input.installPath); }
  if (input.coverArtPath !== undefined)   { fields.push('cover_art_path = ?');   values.push(input.coverArtPath); }
  if (input.coverArtUrl !== undefined)    { fields.push('cover_art_url = ?');    values.push(input.coverArtUrl); }
  if (input.launchUri !== undefined)      { fields.push('launch_uri = ?');       values.push(input.launchUri); }
  if (input.playtimeMinutes !== undefined){ fields.push('playtime_minutes = ?'); values.push(input.playtimeMinutes); }
  if (input.lastPlayed !== undefined)     { fields.push('last_played = ?');      values.push(input.lastPlayed); }
  if (input.favorite !== undefined)       { fields.push('favorite = ?');         values.push(input.favorite ? 1 : 0); }
  if (input.hidden !== undefined)         { fields.push('hidden = ?');           values.push(input.hidden ? 1 : 0); }
  if (input.genre !== undefined)          { fields.push('genre = ?');            values.push(input.genre); }
  if (input.status !== undefined)         { fields.push('status = ?');           values.push(input.status); }

  if (fields.length === 0) return existing;

  const updatedAt = nowIso();
  fields.push('updated_at = ?');
  values.push(updatedAt);
  values.push(id);

  getDb().run(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`, values);
  persistDb();

  // Construct the return value directly from the merged state to avoid a
  // second SELECT round-trip on the hot path.
  return {
    ...existing,
    ...(input.title              !== undefined && { title:           input.title }),
    ...(input.executablePath     !== undefined && { executablePath:  input.executablePath }),
    ...(input.installPath        !== undefined && { installPath:     input.installPath }),
    ...(input.coverArtPath       !== undefined && { coverArtPath:    input.coverArtPath }),
    ...(input.coverArtUrl        !== undefined && { coverArtUrl:     input.coverArtUrl }),
    ...(input.launchUri          !== undefined && { launchUri:       input.launchUri }),
    ...(input.playtimeMinutes    !== undefined && { playtimeMinutes: input.playtimeMinutes }),
    ...(input.lastPlayed         !== undefined && { lastPlayed:      input.lastPlayed }),
    ...(input.favorite           !== undefined && { favorite:        input.favorite }),
    ...(input.hidden             !== undefined && { hidden:          input.hidden }),
    ...(input.genre              !== undefined && { genre:           input.genre }),
    ...(input.status             !== undefined && { status:          input.status }),
    updatedAt,
  };
}

export function findGameById(id: string): Game | null {
  const row = queryOne(`
    SELECT id, title, platform, executable_path, install_path, platform_id,
           cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
           favorite, hidden, genre, status, created_at, updated_at
    FROM games
    WHERE id = ?
  `, [id]);

  return row ? rowToGame(row) : null;
}

export function findGameByPlatformId(platform: Platform, platformId: string): Game | null {
  const row = queryOne(`
    SELECT id, title, platform, executable_path, install_path, platform_id,
           cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
           favorite, hidden, genre, status, created_at, updated_at
    FROM games
    WHERE platform = ? AND platform_id = ?
  `, [platform, platformId]);

  return row ? rowToGame(row) : null;
}

export function findGameByInstallPath(installPath: string): Game | null {
  const row = queryOne(`
    SELECT id, title, platform, executable_path, install_path, platform_id,
           cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
           favorite, hidden, genre, status, created_at, updated_at
    FROM games
    WHERE install_path = ?
  `, [installPath]);

  return row ? rowToGame(row) : null;
}

export function findGameByTitleAndPath(title: string, installPath: string | null): Game | null {
  const row = queryOne(`
    SELECT id, title, platform, executable_path, install_path, platform_id,
           cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
           favorite, hidden, genre, status, created_at, updated_at
    FROM games
    WHERE LOWER(title) = LOWER(?) AND (install_path = ? OR (install_path IS NULL AND ? IS NULL))
  `, [title, installPath, installPath]);

  return row ? rowToGame(row) : null;
}

export function listGames(filter: ListGamesFilter = {}): Game[] {
  const conditions: string[] = [];
  const values: SqlValue[] = [];

  if (filter.platform !== undefined) {
    conditions.push('platform = ?');
    values.push(filter.platform);
  }
  if (filter.favorite !== undefined) {
    conditions.push('favorite = ?');
    values.push(filter.favorite ? 1 : 0);
  }
  if (filter.hidden !== undefined) {
    conditions.push('hidden = ?');
    values.push(filter.hidden ? 1 : 0);
  }
  if (filter.search !== undefined && filter.search.trim() !== '') {
    conditions.push('title LIKE ? COLLATE NOCASE');
    values.push(`%${filter.search.trim()}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = queryAll(`
    SELECT id, title, platform, executable_path, install_path, platform_id,
           cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
           favorite, hidden, genre, status, created_at, updated_at
    FROM games
    ${where}
    ORDER BY title COLLATE NOCASE ASC
  `, values);

  return rows.map(rowToGame);
}

export function deleteGame(id: string): boolean {
  const db = getDb();
  db.run('DELETE FROM games WHERE id = ?', [id]);
  const changed = db.getRowsModified() > 0;
  if (changed) persistDb();
  return changed;
}

export function toggleFavorite(id: string): Game | null {
  const existing = findGameById(id);
  if (!existing) return null;

  getDb().run(
    'UPDATE games SET favorite = ?, updated_at = ? WHERE id = ?',
    [existing.favorite ? 0 : 1, nowIso(), id],
  );
  persistDb();

  return findGameById(id);
}

export function updatePlaytime(id: string, additionalMinutes: number): Game | null {
  if (additionalMinutes < 0) {
    throw new RangeError('additionalMinutes must be non-negative');
  }

  const now = nowIso();
  getDb().run(`
    UPDATE games
    SET playtime_minutes = playtime_minutes + ?,
        last_played = ?,
        updated_at  = ?
    WHERE id = ?
  `, [additionalMinutes, now, now, id]);
  persistDb();

  return findGameById(id);
}

/**
 * Insert multiple games in a single transaction. Returns the number of rows
 * inserted. Existing rows with the same (platform, platform_id) pair are
 * skipped via INSERT OR IGNORE so a partial scan does not clobber user edits
 * (favorites, hidden flags, etc.).
 */
export function bulkInsertGames(inputs: InsertGameInput[]): number {
  if (inputs.length === 0) return 0;

  const db = getDb();
  const now = nowIso();
  let inserted = 0;

  const sql = `
    INSERT OR IGNORE INTO games (
      id, title, platform, executable_path, install_path, platform_id,
      cover_art_path, cover_art_url, launch_uri, playtime_minutes, last_played,
      favorite, hidden, genre, status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `;

  // sql.js has no native transaction API, so we manage it manually.
  db.run('BEGIN');
  try {
    for (const item of inputs) {
      db.run(sql, [
        randomUUID(),
        item.title,
        item.platform,
        item.executablePath ?? null,
        item.installPath ?? null,
        item.platformId ?? null,
        item.coverArtPath ?? null,
        item.coverArtUrl ?? null,
        item.launchUri ?? null,
        item.playtimeMinutes ?? 0,
        item.lastPlayed ?? null,
        item.favorite ? 1 : 0,
        item.hidden ? 1 : 0,
        item.genre ?? null,
        item.status ?? 'unplayed',
        now,
        now,
      ]);
      inserted += db.getRowsModified();
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  persistDb();
  return inserted;
}
