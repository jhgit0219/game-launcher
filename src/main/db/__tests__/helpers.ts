/**
 * Database test helpers.
 *
 * Provides a factory for creating isolated in-memory SQLite databases.
 * Each test file mocks '../index' using these helpers so the modules under
 * test never touch the real on-disk database.
 */

import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { applySchema } from '../schema';

/**
 * Open a fresh in-memory SQLite database with the full application schema.
 * Returns the instance; callers are responsible for closing it in afterAll.
 *
 * Note: This is intentionally synchronous-looking for use inside vi.mock
 * factories. The caller must await it (vi.mock supports async factories).
 */
export async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  applySchema(db);
  return db;
}
