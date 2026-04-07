/**
 * Unit tests for SteamScanner output format.
 *
 * The file system is fully mocked so tests run on all platforms without
 * requiring an actual Steam installation.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ── Mock node:fs and node:fs/promises before importing the scanner ─────────

vi.mock('node:fs', () => {
  const existsSync = vi.fn();
  return { existsSync, default: { existsSync } };
});

vi.mock('node:fs/promises', () => {
  const readdir = vi.fn();
  const readFile = vi.fn();
  // Expose both as named exports and as properties of the default export
  // so that `import fs from 'node:fs/promises'; fs.readdir(...)` works.
  const ns = { readdir, readFile };
  return { ...ns, default: ns };
});

// Prevent any native registry queries.
vi.mock('node:child_process', () => {
  const execFile = vi.fn(
    (
      _cmd: string,
      _args: string[],
      cb: (err: null, result: { stdout: string }) => void,
    ) => {
      cb(null, { stdout: '' });
    },
  );
  return { execFile, default: { execFile } };
});

vi.mock('node:util', () => {
  const promisify =
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      new Promise<unknown>((resolve, reject) => {
        fn(...args, (err: unknown, result: unknown) => {
          if (err) reject(err as Error);
          else resolve(result);
        });
      });
  return { promisify, default: { promisify } };
});

import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { SteamScanner } from '../sources/steam';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddir = vi.mocked(fsp.readdir);
const mockReadFile = vi.mocked(fsp.readFile);

// ── Constants ─────────────────────────────────────────────────────────────

// Use the exact same path form as the scanner's fallback candidate list.
const STEAM_ROOT = 'C:/Program Files (x86)/Steam';

// path.join uses OS-native separators; normalise for mock comparisons.
const STEAMAPPS_DIR = path.join(STEAM_ROOT, 'steamapps').replace(/\\/g, '/');

// ── VDF fixtures ──────────────────────────────────────────────────────────

const EMPTY_LIBRARY_VDF = `"LibraryFolders"\n{\n}`;

function makeManifest(
  appid: string,
  name: string,
  installdir: string,
  stateFlags = '4',
): string {
  return [
    '"AppState"',
    '{',
    `  "appid"       "${appid}"`,
    `  "name"        "${name}"`,
    `  "installdir"  "${installdir}"`,
    `  "StateFlags"  "${stateFlags}"`,
    '}',
  ].join('\n');
}

// ── Common mock helpers ───────────────────────────────────────────────────

/**
 * Configure the fs mocks for a typical scan scenario:
 * - existsSync: accepts STEAM_ROOT and STEAMAPPS_DIR
 * - readdir: returns the supplied file-name list (string[])
 * - readFile: returns EMPTY_LIBRARY_VDF for the metadata file,
 *             manifestContent for everything else
 */
function setupScanMocks(fileNames: string[], manifestContent: string): void {
  mockExistsSync.mockImplementation((p) => {
    const s = String(p).replace(/\\/g, '/');
    return s === STEAM_ROOT || s === STEAMAPPS_DIR;
  });

  // The scanner calls readdir without withFileTypes → expects string[]
  // @ts-expect-error — vitest mock; real overload requires string | Buffer | URL
  mockReaddir.mockResolvedValue(fileNames);

  mockReadFile.mockImplementation(async (p) => {
    if (String(p).replace(/\\/g, '/').endsWith('libraryfolders.vdf')) {
      return EMPTY_LIBRARY_VDF;
    }
    return manifestContent;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('SteamScanner', () => {
  const scanner = new SteamScanner();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('platform identifier', () => {
    it('exposes "steam" as the platform name', () => {
      expect(scanner.platform).toBe('steam');
    });
  });

  describe('isAvailable', () => {
    it('returns false when no Steam path is found on disk', async () => {
      mockExistsSync.mockReturnValue(false);
      expect(await scanner.isAvailable()).toBe(false);
    });

    it('returns true when a known Steam installation path exists', async () => {
      mockExistsSync.mockImplementation(
        (p) => String(p).replace(/\\/g, '/') === STEAM_ROOT,
      );
      expect(await scanner.isAvailable()).toBe(true);
    });
  });

  describe('scan', () => {
    it('yields a correctly shaped ScanResult for a fully-installed game', async () => {
      setupScanMocks(
        ['appmanifest_570.acf'],
        makeManifest('570', 'Dota 2', 'dota 2'),
      );

      const results: import('../types').ScanResult[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      const [game] = results;
      expect(game?.platform).toBe('steam');
      expect(game?.platformId).toBe('570');
      expect(game?.title).toBe('Dota 2');
      expect(game?.launchUri).toBe('steam://rungameid/570');
      expect(game?.exePath).toBeNull();
      expect(typeof game?.installPath).toBe('string');
    });

    it('skips manifests where StateFlags does not include the installed bit', async () => {
      // StateFlags = 2 → installed bit (0x04) not set
      setupScanMocks(
        ['appmanifest_730.acf'],
        makeManifest('730', 'CS2', 'Counter-Strike 2', '2'),
      );

      const results: unknown[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
      }
      expect(results).toHaveLength(0);
    });

    it('skips files that are not .acf manifests', async () => {
      setupScanMocks(['readme.txt', 'package.json'], '');

      const results: unknown[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
      }
      expect(results).toHaveLength(0);
    });

    it('yields nothing when Steam directory is not available', async () => {
      mockExistsSync.mockReturnValue(false);

      const results: unknown[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
      }
      expect(results).toHaveLength(0);
    });

    it('uses forward slashes in installPath', async () => {
      setupScanMocks(
        ['appmanifest_440.acf'],
        makeManifest('440', 'Team Fortress 2', 'Team Fortress 2'),
      );

      const results: import('../types').ScanResult[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
        expect(result.installPath).not.toContain('\\');
      }
      // Ensure the assertion above ran at least once.
      expect(results.length).toBeGreaterThan(0);
    });

    it('skips manifest files that cannot be read', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p).replace(/\\/g, '/');
        return s === STEAM_ROOT || s === STEAMAPPS_DIR;
      });

      // @ts-expect-error — mock
      mockReaddir.mockResolvedValue(['appmanifest_1.acf']);

      mockReadFile.mockImplementation(async (p) => {
        if (String(p).replace(/\\/g, '/').endsWith('libraryfolders.vdf')) {
          return EMPTY_LIBRARY_VDF;
        }
        throw new Error('ENOENT: file not found');
      });

      const results: unknown[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
      }
      expect(results).toHaveLength(0);
    });

    it('yields multiple results when multiple manifests are present', async () => {
      setupScanMocks(
        ['appmanifest_1.acf', 'appmanifest_2.acf', 'appmanifest_3.acf'],
        makeManifest('1', 'Game', 'game'),
      );

      const results: unknown[] = [];
      for await (const result of scanner.scan()) {
        results.push(result);
      }
      expect(results).toHaveLength(3);
    });
  });
});
