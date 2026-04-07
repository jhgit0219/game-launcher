import { getDb, persistDb } from './index';
import type { SqlValue } from 'sql.js';

export interface ScanLogEntry {
  id: number;
  source: string;
  gamesFound: number;
  gamesAdded: number;
  gamesRemoved: number;
  errors: string[];
  startedAt: string;
  completedAt: string | null;
}

export interface StartScanInput {
  source: string;
  startedAt?: string;
}

export interface CompleteScanInput {
  gamesFound: number;
  gamesAdded: number;
  gamesRemoved: number;
  errors?: string[];
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function queryOne(
  sql: string,
  params: SqlValue[],
): Record<string, SqlValue> | undefined {
  const results = getDb().exec(sql, params);
  if (!results[0] || results[0].values.length === 0) return undefined;
  const { columns, values } = results[0];
  const obj: Record<string, SqlValue> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i] as string] = values[0]?.[i] ?? null;
  }
  return obj;
}

function queryAll(
  sql: string,
  params: SqlValue[],
): Record<string, SqlValue>[] {
  const results = getDb().exec(sql, params);
  if (!results[0]) return [];
  const { columns, values } = results[0];
  return values.map((row) => {
    const obj: Record<string, SqlValue> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i] ?? null;
    }
    return obj;
  });
}

function rowToEntry(row: Record<string, SqlValue>): ScanLogEntry {
  let errors: string[] = [];
  const rawErrors = row['errors'];
  if (typeof rawErrors === 'string' && rawErrors.length > 0) {
    try {
      errors = JSON.parse(rawErrors) as string[];
    } catch {
      errors = [rawErrors];
    }
  }

  return {
    id:           row['id'] as number,
    source:       row['source'] as string,
    gamesFound:   (row['games_found'] as number) ?? 0,
    gamesAdded:   (row['games_added'] as number) ?? 0,
    gamesRemoved: (row['games_removed'] as number) ?? 0,
    errors,
    startedAt:    row['started_at'] as string,
    completedAt:  (row['completed_at'] as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a new scan log row for a given source. Returns the generated row id so
 * the caller can pass it back to completeScan once the scan finishes.
 */
export function startScan(input: StartScanInput): number {
  const db = getDb();
  const startedAt = input.startedAt ?? new Date().toISOString();

  db.run(`
    INSERT INTO scan_log (source, games_found, games_added, games_removed, errors, started_at)
    VALUES (?, 0, 0, 0, NULL, ?)
  `, [input.source, startedAt]);

  const row = queryOne('SELECT last_insert_rowid() AS id', []);
  persistDb();

  return (row?.['id'] as number) ?? 0;
}

/**
 * Close an existing scan log row with final counts and any error messages.
 */
export function completeScan(id: number, input: CompleteScanInput): ScanLogEntry | null {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const errorsJson = (input.errors && input.errors.length > 0)
    ? JSON.stringify(input.errors)
    : null;

  getDb().run(`
    UPDATE scan_log
    SET games_found   = ?,
        games_added   = ?,
        games_removed = ?,
        errors        = ?,
        completed_at  = ?
    WHERE id = ?
  `, [
    input.gamesFound,
    input.gamesAdded,
    input.gamesRemoved,
    errorsJson,
    completedAt,
    id,
  ]);

  persistDb();
  return findScanLogById(id);
}

export function findScanLogById(id: number): ScanLogEntry | null {
  const row = queryOne(`
    SELECT id, source, games_found, games_added, games_removed, errors, started_at, completed_at
    FROM scan_log
    WHERE id = ?
  `, [id]);

  return row ? rowToEntry(row) : null;
}

/**
 * Return the most recent scan log entries, newest first.
 */
export function listScanLog(limit = 50): ScanLogEntry[] {
  const rows = queryAll(`
    SELECT id, source, games_found, games_added, games_removed, errors, started_at, completed_at
    FROM scan_log
    ORDER BY id DESC
    LIMIT ?
  `, [limit]);

  return rows.map(rowToEntry);
}

/**
 * Return only the most recent log entry for a specific source.
 */
export function latestScanForSource(source: string): ScanLogEntry | null {
  const row = queryOne(`
    SELECT id, source, games_found, games_added, games_removed, errors, started_at, completed_at
    FROM scan_log
    WHERE source = ?
    ORDER BY id DESC
    LIMIT 1
  `, [source]);

  return row ? rowToEntry(row) : null;
}
