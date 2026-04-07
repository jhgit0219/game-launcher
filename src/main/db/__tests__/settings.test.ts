import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Database } from 'sql.js';

vi.mock('../index', async () => {
  const { createTestDb } = await import('./helpers');
  const db = await createTestDb();
  return {
    getDb: () => db,
    persistDb: () => undefined,
    closeDatabase: () => db.close(),
  };
});

import { getSetting, setSetting, getAllSettings, patchSettings } from '../settings';
import { getDb } from '../index';

const testDb: Database = getDb();

describe('settings db module', () => {
  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.run('DELETE FROM settings');
  });

  // ── getSetting ────────────────────────────────────────────────────────────

  describe('getSetting', () => {
    it('returns the compiled-in default when the key has not been persisted', () => {
      expect(getSetting('scanOnStartup')).toBe(true);
      expect(getSetting('minimizeToTray')).toBe(true);
      expect(getSetting('launchOnStartup')).toBe(false);
      expect(getSetting('artQuality')).toBe('standard');
    });

    it('returns a caller-provided fallback when the key has not been persisted', () => {
      const result = getSetting('scanIntervalMinutes', 60);
      expect(result).toBe(60);
    });

    it('returns the stored value after it has been set', () => {
      setSetting('scanIntervalMinutes', 30);
      expect(getSetting('scanIntervalMinutes')).toBe(30);
    });

    it('returns a stored array value correctly', () => {
      setSetting('scanDirectories', ['C:/Games', 'D:/Steam']);
      const dirs = getSetting('scanDirectories');
      expect(dirs).toEqual(['C:/Games', 'D:/Steam']);
    });

    it('returns the stored boolean false without falling back to default', () => {
      setSetting('scanOnStartup', false);
      expect(getSetting('scanOnStartup')).toBe(false);
    });
  });

  // ── setSetting ────────────────────────────────────────────────────────────

  describe('setSetting', () => {
    it('persists a string value', () => {
      setSetting('steamGridDbApiKey', 'my-api-key');
      expect(getSetting('steamGridDbApiKey')).toBe('my-api-key');
    });

    it('overwrites a previously stored value (upsert semantics)', () => {
      setSetting('artQuality', 'standard');
      setSetting('artQuality', 'high');
      expect(getSetting('artQuality')).toBe('high');
    });

    it('persists the artQuality "high" variant', () => {
      setSetting('artQuality', 'high');
      expect(getSetting('artQuality')).toBe('high');
    });
  });

  // ── getAllSettings ────────────────────────────────────────────────────────

  describe('getAllSettings', () => {
    it('returns a settings object with all expected keys', () => {
      const settings = getAllSettings();
      const expectedKeys = [
        'scanDirectories',
        'scanOnStartup',
        'scanIntervalMinutes',
        'minimizeToTray',
        'launchOnStartup',
        'steamGridDbApiKey',
        'artQuality',
      ];
      for (const key of expectedKeys) {
        expect(settings).toHaveProperty(key);
      }
    });

    it('merges stored values over defaults', () => {
      setSetting('launchOnStartup', true);
      setSetting('artQuality', 'high');

      const settings = getAllSettings();
      expect(settings.launchOnStartup).toBe(true);
      expect(settings.artQuality).toBe('high');
      expect(settings.scanOnStartup).toBe(true);
    });

    it('returns defaults when no settings have been stored', () => {
      const settings = getAllSettings();
      expect(settings.scanDirectories).toEqual([]);
      expect(settings.steamGridDbApiKey).toBe('');
      expect(settings.scanIntervalMinutes).toBe(0);
    });
  });

  // ── patchSettings ─────────────────────────────────────────────────────────

  describe('patchSettings', () => {
    it('writes only the supplied keys and returns the full merged settings', () => {
      const result = patchSettings({ launchOnStartup: true, artQuality: 'high' });

      expect(result.launchOnStartup).toBe(true);
      expect(result.artQuality).toBe('high');
      expect(result.minimizeToTray).toBe(true);
      expect(result.scanOnStartup).toBe(true);
    });

    it('silently ignores unknown keys at runtime', () => {
      const unknownPatch = { unknownKey: 'value' } as Record<string, unknown>;
      expect(() =>
        patchSettings(unknownPatch as Parameters<typeof patchSettings>[0]),
      ).not.toThrow();
    });

    it('applies an empty patch without error and returns all settings', () => {
      const result = patchSettings({});
      expect(result).toHaveProperty('scanDirectories');
    });

    it('applies multiple keys in one call', () => {
      const result = patchSettings({
        scanOnStartup: false,
        scanIntervalMinutes: 120,
        steamGridDbApiKey: 'key-xyz',
      });

      expect(result.scanOnStartup).toBe(false);
      expect(result.scanIntervalMinutes).toBe(120);
      expect(result.steamGridDbApiKey).toBe('key-xyz');
    });
  });
});
