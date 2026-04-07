import { randomUUID } from 'node:crypto';
import { getDb, persistDb } from './index';
import type { SqlValue } from 'sql.js';

export type ShortcutCategory = 'productivity' | 'utility' | 'other';

export interface Shortcut {
  id: string;
  name: string;
  executablePath: string;
  iconPath: string | null;
  category: ShortcutCategory | null;
  createdAt: string;
}

export interface InsertShortcutInput {
  name: string;
  executablePath: string;
  iconPath?: string | null;
  category?: ShortcutCategory | null;
}

export interface UpdateShortcutInput {
  name?: string;
  executablePath?: string;
  iconPath?: string | null;
  category?: ShortcutCategory | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

function queryOne(
  sql: string,
  params: SqlValue[],
): Record<string, SqlValue> | undefined {
  const results = getDb().exec(sql, params);
  if (!results[0] || results[0].values.length === 0) return undefined;
  const { columns, values } = results[0];
  return execToRows(columns, values)[0];
}

function queryAll(
  sql: string,
  params: SqlValue[],
): Record<string, SqlValue>[] {
  const results = getDb().exec(sql, params);
  if (!results[0]) return [];
  const { columns, values } = results[0];
  return execToRows(columns, values);
}

function rowToShortcut(row: Record<string, SqlValue>): Shortcut {
  return {
    id:             row['id'] as string,
    name:           row['name'] as string,
    executablePath: row['executable_path'] as string,
    iconPath:       (row['icon_path'] as string | null) ?? null,
    category:       (row['category'] as ShortcutCategory | null) ?? null,
    createdAt:      row['created_at'] as string,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function insertShortcut(input: InsertShortcutInput): Shortcut {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  getDb().run(`
    INSERT INTO shortcuts (id, name, executable_path, icon_path, category, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id,
    input.name,
    input.executablePath,
    input.iconPath ?? null,
    input.category ?? null,
    createdAt,
  ]);

  persistDb();
  return findShortcutById(id) as Shortcut;
}

export function updateShortcut(id: string, input: UpdateShortcutInput): Shortcut | null {
  const existing = findShortcutById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: SqlValue[] = [];

  if (input.name !== undefined)           { fields.push('name = ?');            values.push(input.name); }
  if (input.executablePath !== undefined) { fields.push('executable_path = ?'); values.push(input.executablePath); }
  if (input.iconPath !== undefined)       { fields.push('icon_path = ?');       values.push(input.iconPath); }
  if (input.category !== undefined)       { fields.push('category = ?');        values.push(input.category); }

  if (fields.length === 0) return existing;

  values.push(id);

  getDb().run(`UPDATE shortcuts SET ${fields.join(', ')} WHERE id = ?`, values);
  persistDb();

  return findShortcutById(id);
}

export function findShortcutById(id: string): Shortcut | null {
  const row = queryOne(`
    SELECT id, name, executable_path, icon_path, category, created_at
    FROM shortcuts
    WHERE id = ?
  `, [id]);

  return row ? rowToShortcut(row) : null;
}

export function listShortcuts(category?: ShortcutCategory): Shortcut[] {
  if (category !== undefined) {
    const rows = queryAll(`
      SELECT id, name, executable_path, icon_path, category, created_at
      FROM shortcuts
      WHERE category = ?
      ORDER BY name COLLATE NOCASE ASC
    `, [category]);

    return rows.map(rowToShortcut);
  }

  const rows = queryAll(`
    SELECT id, name, executable_path, icon_path, category, created_at
    FROM shortcuts
    ORDER BY name COLLATE NOCASE ASC
  `, []);

  return rows.map(rowToShortcut);
}

export function deleteShortcut(id: string): boolean {
  const db = getDb();
  db.run('DELETE FROM shortcuts WHERE id = ?', [id]);
  const changed = db.getRowsModified() > 0;
  if (changed) persistDb();
  return changed;
}
