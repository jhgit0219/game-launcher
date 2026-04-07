/**
 * Tests for ScanOrchestrator.deduplicate — the deduplication logic that runs
 * between raw scanner output and database persistence.
 *
 * The orchestrator is tested in isolation by subclassing it and exposing the
 * private method under a protected proxy, without touching the real db or
 * file system.
 */
import { describe, it, expect } from 'vitest';
import type { ScanResult } from '../types';

// ── Expose the private deduplicate method for testing ─────────────────────
// We import the class but instantiate a thin wrapper so we can call the
// private method without TypeScript errors.
import { ScanOrchestrator } from '../index';

class TestableScanOrchestrator extends ScanOrchestrator {
  public dedup(results: ScanResult[]): ScanResult[] {
    // @ts-expect-error — accessing private method for unit testing
    return this.deduplicate(results);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSteamResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    title: 'Game',
    platform: 'steam',
    platformId: 'steam-1',
    exePath: null,
    installPath: 'C:/Steam/common/game',
    launchUri: 'steam://rungameid/1',
    ...overrides,
  };
}

function makeRegistryResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    title: 'Game',
    platform: 'registry',
    platformId: null,
    exePath: 'C:/Games/game.exe',
    installPath: 'C:/Games',
    launchUri: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ScanOrchestrator', () => {
  const orchestrator = new TestableScanOrchestrator();

  describe('deduplicate', () => {
    it('returns an empty array when given an empty array', () => {
      expect(orchestrator.dedup([])).toEqual([]);
    });

    it('returns a single result unchanged', () => {
      const result = makeSteamResult();
      expect(orchestrator.dedup([result])).toHaveLength(1);
    });

    it('deduplicates identical (platform, platformId) pairs', () => {
      const a = makeSteamResult({ title: 'First' });
      const b = makeSteamResult({ title: 'Second' }); // same platform + platformId
      const deduped = orchestrator.dedup([a, b]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0]?.title).toBe('First');
    });

    it('keeps results with different platformIds as distinct entries', () => {
      const a = makeSteamResult({ platformId: 'steam-1', title: 'Game A' });
      const b = makeSteamResult({ platformId: 'steam-2', title: 'Game B' });
      expect(orchestrator.dedup([a, b])).toHaveLength(2);
    });

    it('keeps results from different platforms with the same platformId as distinct', () => {
      const a: ScanResult = { ...makeSteamResult(), platform: 'steam', platformId: 'id-1' };
      const b: ScanResult = { ...makeSteamResult(), platform: 'epic', platformId: 'id-1' };
      expect(orchestrator.dedup([a, b])).toHaveLength(2);
    });

    it('deduplicates registry results without platformId by normalised title + installPath', () => {
      const a = makeRegistryResult({ title: 'My Game', installPath: 'C:/Games/MyGame' });
      const b = makeRegistryResult({ title: 'My Game', installPath: 'C:/Games/MyGame' });
      expect(orchestrator.dedup([a, b])).toHaveLength(1);
    });

    it('treats registry results with different install paths as distinct', () => {
      const a = makeRegistryResult({ title: 'Game', installPath: 'C:/Games/A' });
      const b = makeRegistryResult({ title: 'Game', installPath: 'C:/Games/B' });
      expect(orchestrator.dedup([a, b])).toHaveLength(2);
    });

    it('prefers a platform-specific scanner result over a registry duplicate', () => {
      // Steam result wins over registry result for the same game.
      const steam = makeSteamResult({
        title: 'Half-Life 2',
        platformId: null,
        installPath: 'C:/Steam/common/hl2',
        platform: 'steam',
      });
      const registry = makeRegistryResult({
        title: 'Half-Life 2',
        installPath: 'C:/Steam/common/hl2',
      });
      // Registry entry comes first — steam should still win.
      const deduped = orchestrator.dedup([registry, steam]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0]?.platform).toBe('steam');
    });

    it('is case-insensitive when deduplicating by title and path', () => {
      const a = makeRegistryResult({ title: 'Diablo', installPath: 'C:\\Games\\Diablo' });
      const b = makeRegistryResult({ title: 'diablo', installPath: 'C:/Games/Diablo' });
      expect(orchestrator.dedup([a, b])).toHaveLength(1);
    });

    it('normalises backslashes to forward slashes for path comparison', () => {
      const a = makeRegistryResult({ title: 'Fallout', installPath: 'D:\\Games\\Fallout' });
      const b = makeRegistryResult({ title: 'Fallout', installPath: 'D:/Games/Fallout' });
      expect(orchestrator.dedup([a, b])).toHaveLength(1);
    });

    it('does not deduplicate results with no installPath when titles differ', () => {
      const a = makeRegistryResult({ title: 'Alpha', installPath: null });
      const b = makeRegistryResult({ title: 'Beta', installPath: null });
      expect(orchestrator.dedup([a, b])).toHaveLength(2);
    });

    it('handles a large mixed set correctly', () => {
      const results: ScanResult[] = [
        makeSteamResult({ platformId: 'sid-1', title: 'Steam Game 1' }),
        makeSteamResult({ platformId: 'sid-1', title: 'Steam Game 1 Dup' }), // dup
        makeSteamResult({ platformId: 'sid-2', title: 'Steam Game 2' }),
        { title: 'Epic A', platform: 'epic', platformId: 'eid-1', exePath: null, installPath: null, launchUri: null },
        makeRegistryResult({ title: 'Registry Game', installPath: 'C:/reg/game' }),
        makeRegistryResult({ title: 'Registry Game', installPath: 'C:/reg/game' }), // dup
      ];
      const deduped = orchestrator.dedup(results);
      expect(deduped).toHaveLength(4);
    });
  });
});
