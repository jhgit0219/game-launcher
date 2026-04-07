import { getDb, persistDb } from './index';
import type { SqlValue } from 'sql.js';

export interface AppSettings {
  scanDirectories: string[];
  scanOnStartup: boolean;
  scanIntervalMinutes: number;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  steamGridDbApiKey: string;
  artQuality: 'standard' | 'high';
  sidebarAutoHide: boolean;
  thumbnailSize: 'small' | 'medium' | 'large';
}

const DEFAULTS: AppSettings = {
  scanDirectories:     [],
  scanOnStartup:       true,
  scanIntervalMinutes: 0,
  minimizeToTray:      true,
  launchOnStartup:     false,
  steamGridDbApiKey:   '',
  artQuality:          'standard',
  sidebarAutoHide:     false,
  thumbnailSize:       'medium' as const,
};

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve a single setting by key. Returns the stored value cast to T,
 * or the provided fallback if the key does not exist.
 */
export function getSetting<K extends keyof AppSettings>(
  key: K,
  fallback?: AppSettings[K],
): AppSettings[K] {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);

  if (row === undefined) {
    return fallback !== undefined ? fallback : DEFAULTS[key];
  }

  return JSON.parse(row['value'] as string) as AppSettings[K];
}

/**
 * Persist a single setting. The value is JSON-serialised before storage.
 */
export function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): void {
  const now = new Date().toISOString();
  getDb().run(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE
      SET value      = excluded.value,
          updated_at = excluded.updated_at
  `, [key, JSON.stringify(value), now]);

  persistDb();
}

/**
 * Read all settings, merging persisted values over the compiled-in defaults.
 */
export function getAllSettings(): AppSettings {
  const rows = queryAll('SELECT key, value FROM settings', []);

  const stored: Partial<AppSettings> = {};
  for (const row of rows) {
    const k = row['key'] as string;
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
      const key = k as keyof AppSettings;
      (stored as Record<keyof AppSettings, unknown>)[key] = JSON.parse(
        row['value'] as string,
      );
    }
  }

  return { ...DEFAULTS, ...stored };
}

/**
 * Apply a partial patch to settings. Only the supplied keys are written.
 */
export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  for (const rawKey of Object.keys(patch)) {
    const key = rawKey as keyof AppSettings;
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
      setSetting(key, patch[key] as AppSettings[typeof key]);
    }
  }

  return getAllSettings();
}
