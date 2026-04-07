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

import {
  insertShortcut,
  updateShortcut,
  findShortcutById,
  listShortcuts,
  deleteShortcut,
  type InsertShortcutInput,
} from '../shortcuts';

import { getDb } from '../index';

const testDb: Database = getDb();

describe('shortcuts db module', () => {
  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.run('DELETE FROM shortcuts');
  });

  // ── insertShortcut ────────────────────────────────────────────────────────

  describe('insertShortcut', () => {
    it('inserts a shortcut and returns the persisted record', () => {
      const shortcut = insertShortcut({
        name: 'Notepad',
        executablePath: 'C:/Windows/System32/notepad.exe',
      });

      expect(shortcut.id).toBeTruthy();
      expect(shortcut.name).toBe('Notepad');
      expect(shortcut.executablePath).toBe('C:/Windows/System32/notepad.exe');
      expect(shortcut.iconPath).toBeNull();
      expect(shortcut.category).toBeNull();
      expect(shortcut.createdAt).toBeTruthy();
    });

    it('stores optional fields when provided', () => {
      const input: InsertShortcutInput = {
        name: 'VS Code',
        executablePath: 'C:/Program Files/VSCode/code.exe',
        iconPath: 'C:/Program Files/VSCode/code.ico',
        category: 'productivity',
      };
      const shortcut = insertShortcut(input);

      expect(shortcut.iconPath).toBe('C:/Program Files/VSCode/code.ico');
      expect(shortcut.category).toBe('productivity');
    });
  });

  // ── updateShortcut ────────────────────────────────────────────────────────

  describe('updateShortcut', () => {
    it('updates name and returns the updated record', () => {
      const original = insertShortcut({ name: 'Old Name', executablePath: 'C:/app.exe' });
      const updated = updateShortcut(original.id, { name: 'New Name' });
      expect(updated?.name).toBe('New Name');
    });

    it('updates executable path', () => {
      const original = insertShortcut({ name: 'App', executablePath: 'C:/old.exe' });
      const updated = updateShortcut(original.id, { executablePath: 'C:/new.exe' });
      expect(updated?.executablePath).toBe('C:/new.exe');
    });

    it('clears iconPath when set to null', () => {
      const original = insertShortcut({
        name: 'IconApp',
        executablePath: 'C:/icon.exe',
        iconPath: 'C:/icon.ico',
      });
      const updated = updateShortcut(original.id, { iconPath: null });
      expect(updated?.iconPath).toBeNull();
    });

    it('returns null for a nonexistent id', () => {
      expect(updateShortcut('no-such-id', { name: 'Ghost' })).toBeNull();
    });

    it('returns the existing record unchanged when no fields are supplied', () => {
      const original = insertShortcut({ name: 'Static', executablePath: 'C:/static.exe' });
      const result = updateShortcut(original.id, {});
      expect(result?.name).toBe('Static');
    });
  });

  // ── findShortcutById ──────────────────────────────────────────────────────

  describe('findShortcutById', () => {
    it('returns the shortcut for a known id', () => {
      const inserted = insertShortcut({ name: 'Find Me', executablePath: 'C:/find.exe' });
      const found = findShortcutById(inserted.id);
      expect(found?.id).toBe(inserted.id);
      expect(found?.name).toBe('Find Me');
    });

    it('returns null for an unknown id', () => {
      expect(findShortcutById('phantom')).toBeNull();
    });
  });

  // ── listShortcuts ─────────────────────────────────────────────────────────

  describe('listShortcuts', () => {
    beforeEach(() => {
      insertShortcut({ name: 'Calc', executablePath: 'C:/calc.exe', category: 'utility' });
      insertShortcut({ name: 'Word', executablePath: 'C:/word.exe', category: 'productivity' });
      insertShortcut({ name: 'Misc', executablePath: 'C:/misc.exe', category: 'other' });
      insertShortcut({ name: 'NoCat', executablePath: 'C:/nocat.exe' });
    });

    it('returns all shortcuts when called with no category argument', () => {
      expect(listShortcuts()).toHaveLength(4);
    });

    it('filters by utility category', () => {
      const utils = listShortcuts('utility');
      expect(utils).toHaveLength(1);
      expect(utils[0]?.name).toBe('Calc');
    });

    it('filters by productivity category', () => {
      const prod = listShortcuts('productivity');
      expect(prod).toHaveLength(1);
      expect(prod[0]?.name).toBe('Word');
    });

    it('filters by other category', () => {
      expect(listShortcuts('other')).toHaveLength(1);
    });

    it('returns shortcuts sorted by name ascending', () => {
      const all = listShortcuts();
      const names = all.map((s) => s.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('returns empty array when no shortcuts exist for a category', () => {
      testDb.run('DELETE FROM shortcuts');
      expect(listShortcuts('utility')).toHaveLength(0);
    });
  });

  // ── deleteShortcut ────────────────────────────────────────────────────────

  describe('deleteShortcut', () => {
    it('removes the shortcut and returns true', () => {
      const shortcut = insertShortcut({ name: 'Gone', executablePath: 'C:/gone.exe' });
      expect(deleteShortcut(shortcut.id)).toBe(true);
      expect(findShortcutById(shortcut.id)).toBeNull();
    });

    it('returns false for an id that does not exist', () => {
      expect(deleteShortcut('nobody')).toBe(false);
    });
  });
});
