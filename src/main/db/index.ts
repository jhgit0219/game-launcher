import path from 'node:path';
import fs from 'node:fs';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { applySchema } from './schema';

function resolveDbPath(): string {
  const appData = process.env['APPDATA'];
  if (!appData) {
    throw new Error('APPDATA environment variable is not set');
  }
  const dir = path.join(appData, 'game-launcher');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'data.db');
}

let _db: Database | null = null;
let _dbPath: string | null = null;

/**
 * Return the active database instance. Throws if `initDb` has not been
 * awaited first.
 */
export function getDb(): Database {
  if (_db === null) {
    throw new Error(
      'Database has not been initialised. Await initDb() before making any queries.',
    );
  }
  return _db;
}

/**
 * Flush the in-memory database to disk. Called automatically after every
 * mutation by the individual query helpers.
 */
export function persistDb(): void {
  if (_db === null || _dbPath === null) return;
  const data = _db.export();
  fs.writeFileSync(_dbPath, Buffer.from(data));
}

/**
 * Initialise sql.js, load the on-disk database (or create a new one), apply
 * the schema, and run an integrity check. Must be awaited once at application
 * startup before any db helpers are called.
 */
export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  const dbPath = resolveDbPath();
  _dbPath = dbPath;

  let db: Database;
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);

    // Integrity check on load.
    const results = db.exec('PRAGMA integrity_check');
    const firstRow = results[0]?.values[0]?.[0];
    if (firstRow !== 'ok') {
      db.close();
      throw new Error(
        `Database integrity check failed at ${dbPath}. ` +
        'The file may be corrupted. Please remove it and restart the application to re-scan.',
      );
    }
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA busy_timeout = 5000');

  applySchema(db);
  persistDb();

  _db = db;
}

export function closeDatabase(): void {
  if (_db !== null) {
    persistDb();
    _db.close();
    _db = null;
  }
}
