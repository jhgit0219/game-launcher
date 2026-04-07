import type { Database } from 'sql.js';

export function applySchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id               TEXT    PRIMARY KEY,
      title            TEXT    NOT NULL,
      platform         TEXT    NOT NULL CHECK (platform IN ('steam','epic','gog','origin','battlenet','registry','custom')),
      executable_path  TEXT,
      install_path     TEXT,
      platform_id      TEXT,
      cover_art_path   TEXT,
      cover_art_url    TEXT,
      launch_uri       TEXT,
      playtime_minutes INTEGER NOT NULL DEFAULT 0,
      last_played      TEXT,
      favorite         INTEGER NOT NULL DEFAULT 0,
      hidden           INTEGER NOT NULL DEFAULT 0,
      genre            TEXT,
      status           TEXT    NOT NULL DEFAULT 'unplayed' CHECK (status IN ('unplayed','playing','completed','on-hold','dropped')),
      created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  // Add status column to existing databases (migration-safe)
  try {
    db.run(`ALTER TABLE games ADD COLUMN status TEXT NOT NULL DEFAULT 'unplayed'`);
  } catch {
    // Column already exists — ignore
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_games_status      ON games (status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_games_platform    ON games (platform)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_games_favorite    ON games (favorite)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_games_last_played ON games (last_played)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_games_title       ON games (title COLLATE NOCASE)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_games_hidden      ON games (hidden, title COLLATE NOCASE)`);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_games_platform_id
      ON games (platform, platform_id)
      WHERE platform_id IS NOT NULL
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shortcuts (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      executable_path TEXT NOT NULL,
      icon_path       TEXT,
      category        TEXT CHECK (category IN ('productivity','utility','other')),
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scan_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source        TEXT    NOT NULL,
      games_found   INTEGER NOT NULL DEFAULT 0,
      games_added   INTEGER NOT NULL DEFAULT 0,
      games_removed INTEGER NOT NULL DEFAULT 0,
      errors        TEXT,
      started_at    TEXT    NOT NULL,
      completed_at  TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS title_resolution (
      original_title  TEXT PRIMARY KEY,
      resolved_title  TEXT NOT NULL,
      source          TEXT,
      resolved_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS game_validation (
      title      TEXT    PRIMARY KEY,
      is_game    INTEGER NOT NULL,
      source     TEXT,
      checked_at TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
}
