import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Database } from 'sql.js';

// vi.mock is hoisted to the top of the file before any let/const declarations,
// so the factory cannot close over a `let testDb` variable.  Instead we store
// the instance inside the mock module and retrieve it after import.
vi.mock('../index', async () => {
  const { createTestDb } = await import('./helpers');
  const db = await createTestDb();
  return {
    getDb: () => db,
    persistDb: () => undefined,
    closeDatabase: () => db.close(),
  };
});

// Import the module under test AFTER the mock is in place.
import {
  insertGame,
  updateGame,
  findGameById,
  findGameByPlatformId,
  listGames,
  deleteGame,
  toggleFavorite,
  updatePlaytime,
  bulkInsertGames,
  type InsertGameInput,
} from '../games';

// Retrieve the injected in-memory db so we can wipe between tests.
import { getDb } from '../index';

const testDb: Database = getDb();

// --------------------------------------------------------------------------

describe('games db module', () => {
  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.run('DELETE FROM games');
  });

  // ── insertGame ────────────────────────────────────────────────────────────

  describe('insertGame', () => {
    it('inserts a game and returns the persisted record', () => {
      const game = insertGame({ title: 'Half-Life 2', platform: 'steam' });

      expect(game.id).toBeTruthy();
      expect(game.title).toBe('Half-Life 2');
      expect(game.platform).toBe('steam');
      expect(game.favorite).toBe(false);
      expect(game.hidden).toBe(false);
      expect(game.playtimeMinutes).toBe(0);
      expect(game.createdAt).toBeTruthy();
    });

    it('stores optional fields when provided', () => {
      const input: InsertGameInput = {
        title: 'Witcher 3',
        platform: 'gog',
        platformId: 'gog-123',
        executablePath: 'C:/Games/Witcher3/witcher3.exe',
        installPath: 'C:/Games/Witcher3',
        launchUri: 'gog://launch/123',
        playtimeMinutes: 300,
        favorite: true,
        genre: 'RPG',
      };
      const game = insertGame(input);

      expect(game.platformId).toBe('gog-123');
      expect(game.executablePath).toBe('C:/Games/Witcher3/witcher3.exe');
      expect(game.launchUri).toBe('gog://launch/123');
      expect(game.playtimeMinutes).toBe(300);
      expect(game.favorite).toBe(true);
      expect(game.genre).toBe('RPG');
    });

    it('defaults nullable fields to null when not supplied', () => {
      const game = insertGame({ title: 'Test Game', platform: 'custom' });

      expect(game.executablePath).toBeNull();
      expect(game.installPath).toBeNull();
      expect(game.platformId).toBeNull();
      expect(game.coverArtPath).toBeNull();
      expect(game.coverArtUrl).toBeNull();
      expect(game.launchUri).toBeNull();
      expect(game.lastPlayed).toBeNull();
      expect(game.genre).toBeNull();
    });
  });

  // ── updateGame ────────────────────────────────────────────────────────────

  describe('updateGame', () => {
    it('updates mutable fields and returns the updated record', () => {
      const original = insertGame({ title: 'Portal', platform: 'steam' });

      const updated = updateGame(original.id, {
        title: 'Portal 2',
        playtimeMinutes: 120,
        favorite: true,
        genre: 'Puzzle',
      });

      expect(updated?.title).toBe('Portal 2');
      expect(updated?.playtimeMinutes).toBe(120);
      expect(updated?.favorite).toBe(true);
      expect(updated?.genre).toBe('Puzzle');
    });

    it('returns null when the id does not exist', () => {
      const result = updateGame('nonexistent-id', { title: 'Ghost' });
      expect(result).toBeNull();
    });

    it('returns the existing record unchanged when no fields are supplied', () => {
      const original = insertGame({ title: 'Doom', platform: 'battlenet' });
      const result = updateGame(original.id, {});
      expect(result?.title).toBe('Doom');
    });
  });

  // ── findGameById ──────────────────────────────────────────────────────────

  describe('findGameById', () => {
    it('returns the game for a known id', () => {
      const inserted = insertGame({ title: 'Celeste', platform: 'steam' });
      const found = findGameById(inserted.id);
      expect(found?.id).toBe(inserted.id);
      expect(found?.title).toBe('Celeste');
    });

    it('returns null for an unknown id', () => {
      expect(findGameById('does-not-exist')).toBeNull();
    });
  });

  // ── findGameByPlatformId ──────────────────────────────────────────────────

  describe('findGameByPlatformId', () => {
    it('returns the game matching a (platform, platformId) pair', () => {
      insertGame({ title: 'Hades', platform: 'epic', platformId: 'epic-hades' });
      const found = findGameByPlatformId('epic', 'epic-hades');
      expect(found?.title).toBe('Hades');
    });

    it('returns null when no match exists', () => {
      expect(findGameByPlatformId('gog', 'missing-id')).toBeNull();
    });
  });

  // ── listGames ─────────────────────────────────────────────────────────────

  describe('listGames', () => {
    beforeEach(() => {
      insertGame({ title: 'Alpha', platform: 'steam', favorite: true });
      insertGame({ title: 'Beta', platform: 'epic', hidden: true });
      insertGame({ title: 'Gamma', platform: 'steam' });
    });

    it('returns all games when called with no filter', () => {
      const games = listGames();
      expect(games.length).toBe(3);
    });

    it('filters by platform', () => {
      const steamGames = listGames({ platform: 'steam' });
      expect(steamGames).toHaveLength(2);
      expect(steamGames.every((g) => g.platform === 'steam')).toBe(true);
    });

    it('filters favorites only', () => {
      const favs = listGames({ favorite: true });
      expect(favs).toHaveLength(1);
      expect(favs[0]?.title).toBe('Alpha');
    });

    it('filters hidden games', () => {
      const hidden = listGames({ hidden: true });
      expect(hidden).toHaveLength(1);
      expect(hidden[0]?.title).toBe('Beta');
    });

    it('filters by search term (case-insensitive)', () => {
      const results = listGames({ search: 'alpha' });
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('Alpha');
    });

    it('returns empty array when search matches nothing', () => {
      expect(listGames({ search: 'ZZZNOTHERE' })).toHaveLength(0);
    });

    it('returns games sorted by title ascending', () => {
      const games = listGames({ platform: 'steam' });
      const titles = games.map((g) => g.title);
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    });
  });

  // ── deleteGame ────────────────────────────────────────────────────────────

  describe('deleteGame', () => {
    it('removes the game and returns true', () => {
      const game = insertGame({ title: 'To Delete', platform: 'custom' });
      expect(deleteGame(game.id)).toBe(true);
      expect(findGameById(game.id)).toBeNull();
    });

    it('returns false when the id does not exist', () => {
      expect(deleteGame('ghost-id')).toBe(false);
    });
  });

  // ── toggleFavorite ────────────────────────────────────────────────────────

  describe('toggleFavorite', () => {
    it('sets favorite to true when currently false', () => {
      const game = insertGame({ title: 'FaveMe', platform: 'gog' });
      const toggled = toggleFavorite(game.id);
      expect(toggled?.favorite).toBe(true);
    });

    it('sets favorite to false when currently true', () => {
      const game = insertGame({ title: 'UnfaveMe', platform: 'gog', favorite: true });
      const toggled = toggleFavorite(game.id);
      expect(toggled?.favorite).toBe(false);
    });

    it('returns null for a nonexistent id', () => {
      expect(toggleFavorite('no-such-id')).toBeNull();
    });
  });

  // ── updatePlaytime ────────────────────────────────────────────────────────

  describe('updatePlaytime', () => {
    it('increments playtime by the given minutes', () => {
      const game = insertGame({ title: 'Timer Game', platform: 'steam', playtimeMinutes: 10 });
      const updated = updatePlaytime(game.id, 25);
      expect(updated?.playtimeMinutes).toBe(35);
    });

    it('accepts zero additional minutes without changing playtime', () => {
      const game = insertGame({ title: 'Idle', platform: 'steam', playtimeMinutes: 5 });
      const updated = updatePlaytime(game.id, 0);
      expect(updated?.playtimeMinutes).toBe(5);
    });

    it('sets lastPlayed to a non-null ISO string after update', () => {
      const game = insertGame({ title: 'Logged', platform: 'steam' });
      const updated = updatePlaytime(game.id, 1);
      expect(updated?.lastPlayed).toBeTruthy();
      expect(() => new Date(updated!.lastPlayed!)).not.toThrow();
    });

    it('throws RangeError for negative additionalMinutes', () => {
      const game = insertGame({ title: 'Bad Input', platform: 'steam' });
      expect(() => updatePlaytime(game.id, -1)).toThrow(RangeError);
    });
  });

  // ── bulkInsertGames ───────────────────────────────────────────────────────

  describe('bulkInsertGames', () => {
    it('inserts multiple games in one transaction and returns insert count', () => {
      const inputs: InsertGameInput[] = [
        { title: 'Bulk A', platform: 'steam', platformId: 'sid-1' },
        { title: 'Bulk B', platform: 'steam', platformId: 'sid-2' },
        { title: 'Bulk C', platform: 'epic', platformId: 'eid-1' },
      ];
      const count = bulkInsertGames(inputs);
      expect(count).toBe(3);
      expect(listGames()).toHaveLength(3);
    });

    it('inserts all items when platform_id values are distinct', () => {
      const count = bulkInsertGames([
        { title: 'Dup Title A', platform: 'gog', platformId: 'gog-1' },
        { title: 'Dup Title B', platform: 'gog', platformId: 'gog-2' },
      ]);
      expect(count).toBe(2);
      expect(listGames()).toHaveLength(2);
    });

    it('skips duplicate (platform, platform_id) pairs on re-insert via INSERT OR IGNORE', () => {
      bulkInsertGames([{ title: 'Original', platform: 'steam', platformId: 'dup-id' }]);
      const count = bulkInsertGames([{ title: 'Duplicate', platform: 'steam', platformId: 'dup-id' }]);
      expect(count).toBe(0);
      expect(listGames()).toHaveLength(1);
      expect(listGames()[0]?.title).toBe('Original');
    });

    it('returns the correct count matching the number of rows inserted', () => {
      const count = bulkInsertGames([
        { title: 'A', platform: 'steam' },
        { title: 'B', platform: 'epic' },
        { title: 'C', platform: 'gog' },
        { title: 'D', platform: 'origin' },
      ]);
      expect(count).toBe(4);
    });

    it('inserts entries without platformId', () => {
      const count = bulkInsertGames([
        { title: 'No ID A', platform: 'custom' },
        { title: 'No ID B', platform: 'custom' },
      ]);
      expect(count).toBe(2);
    });

    it('each inserted game is retrievable by its title', () => {
      bulkInsertGames([
        { title: 'Lookup Me', platform: 'steam', platformId: 'lm-1' },
      ]);
      const found = listGames({ search: 'Lookup Me' });
      expect(found).toHaveLength(1);
      expect(found[0]?.title).toBe('Lookup Me');
    });

    it('returns 0 for an empty input array', () => {
      expect(bulkInsertGames([])).toBe(0);
    });
  });
});
