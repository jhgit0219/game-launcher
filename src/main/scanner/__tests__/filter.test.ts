/**
 * Adversarial tests for the scanner pre-filter.
 *
 * The filter operates in two modes:
 *   - Trusted platforms (steam, epic, gog, origin, battlenet) always pass.
 *   - Untrusted platforms (registry, custom, drive-scan) go through the
 *     fast pre-filter before hitting the Steam API validator.
 *
 * These tests verify that real games are not accidentally blocked, that known
 * non-games are correctly discarded, and that edge-case inputs do not crash.
 */
import { describe, it, expect } from 'vitest';
import { isLikelyGame, passesPreFilter } from '../filter';
import type { ScanResultWithPublisher } from '../filter';
import type { Platform } from '../../db/games';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const REAL_GAMES = [
  'Dota 2', 'Counter-Strike 2', 'Elden Ring', 'Cyberpunk 2077',
  'The Witcher 3', 'Hades', 'Stardew Valley', 'Terraria',
  'Among Us', 'Fall Guys', 'Valorant', 'League of Legends',
  'Minecraft', 'Fortnite', 'Apex Legends', 'Overwatch 2',
  'Dead by Daylight', 'Phasmophobia', 'Lethal Company',
  'Balatro', 'Palworld', 'REANIMAL',
];

const NOT_GAMES = [
  'Microsoft Edge', '7-Zip', 'Adobe Photoshop 2024', 'Visual Studio Code',
  'Python 3.12', 'Node.js', 'Git', 'Chrome 146.0.3856.84',
  '0.296.0.23', 'Windows Defender', 'NVIDIA GeForce Experience',
  'Discord', 'Slack', 'Zoom', 'VLC Media Player', 'OBS Studio',
  'Audacity', 'BlueStacks X', 'x360ce', 'Android Studio',
  'HP Support Assistant', 'Dell SupportAssist', 'Realtek Audio Console',
  'Intel Graphics Command Center', 'AMD Adrenalin',
];

const EDGE_CASES = [
  '', 'A', '64bit', 'Bin64', 'Application', 'ACC',
  '日本語ゲーム', 'Game™', 'GAME (Early Access)', 'My Game v1.2.3',
];

const NEAR_MISSES = [
  'Artix Game Launcher', 'Steam', 'Epic Games Launcher', 'GOG Galaxy',
  'BlueStacks', 'DS4Windows', 'MSI Afterburner', 'Parsec',
  'GeForce NOW', 'Xbox Game Bar',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  title: string,
  platform: Platform = 'custom',
  overrides: Partial<ScanResultWithPublisher> = {},
): ScanResultWithPublisher {
  return {
    title,
    platform,
    platformId: null,
    exePath: null,
    installPath: null,
    launchUri: null,
    publisher: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — Trusted platforms always pass
// ---------------------------------------------------------------------------

describe('isLikelyGame — trusted platforms', () => {
  const trustedPlatforms: Platform[] = ['steam', 'epic', 'gog', 'origin', 'battlenet'];

  for (const title of REAL_GAMES) {
    it(`passes "${title}" from steam`, () => {
      expect(isLikelyGame(makeResult(title, 'steam'))).toBe(true);
    });
  }

  it('passes every trusted platform regardless of title content', () => {
    for (const platform of trustedPlatforms) {
      // Even a title that looks like system junk should pass on a trusted platform.
      expect(isLikelyGame(makeResult('Visual Studio Code', platform))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Real games pass the pre-filter from an untrusted source
// ---------------------------------------------------------------------------

describe('passesPreFilter — real games should not be blocked', () => {
  for (const title of REAL_GAMES) {
    it(`keeps "${title}" from custom source`, () => {
      expect(passesPreFilter(makeResult(title))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 3 — Non-games are blocked by the pre-filter
// ---------------------------------------------------------------------------

describe('passesPreFilter — non-games must be blocked', () => {
  for (const title of NOT_GAMES) {
    it(`blocks "${title}"`, () => {
      expect(passesPreFilter(makeResult(title))).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 4 — Edge cases must not crash
// ---------------------------------------------------------------------------

describe('passesPreFilter — edge cases do not crash', () => {
  for (const title of EDGE_CASES) {
    it(`handles "${title}" without throwing`, () => {
      expect(() => passesPreFilter(makeResult(title))).not.toThrow();
    });
  }

  it('blocks an empty string', () => {
    expect(passesPreFilter(makeResult(''))).toBe(false);
  });

  it('blocks a single character', () => {
    expect(passesPreFilter(makeResult('A'))).toBe(false);
  });

  it('blocks "64bit"', () => {
    expect(passesPreFilter(makeResult('64bit'))).toBe(false);
  });

  it('blocks "Bin64"', () => {
    expect(passesPreFilter(makeResult('Bin64'))).toBe(false);
  });

  it('blocks "Application"', () => {
    expect(passesPreFilter(makeResult('Application'))).toBe(false);
  });

  it('blocks "ACC"', () => {
    expect(passesPreFilter(makeResult('ACC'))).toBe(false);
  });

  it('keeps a title with Japanese characters — cannot rule it out locally', () => {
    expect(passesPreFilter(makeResult('日本語ゲーム'))).toBe(true);
  });

  it('keeps "Game™" — trademark symbol alone is not disqualifying', () => {
    expect(passesPreFilter(makeResult('Game™'))).toBe(true);
  });

  it('keeps "GAME (Early Access)" — early access note is not disqualifying', () => {
    expect(passesPreFilter(makeResult('GAME (Early Access)'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Near-misses that look like games but are not
// ---------------------------------------------------------------------------

describe('passesPreFilter — near-misses must be blocked', () => {
  for (const title of NEAR_MISSES) {
    it(`blocks "${title}"`, () => {
      expect(passesPreFilter(makeResult(title))).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 6 — Publisher-based blocking (untrusted source)
// ---------------------------------------------------------------------------

describe('passesPreFilter — known system publisher blocks result', () => {
  it('blocks a result whose publisher is "Microsoft Corporation"', () => {
    expect(
      passesPreFilter(makeResult('SomeApp', 'registry', { publisher: 'Microsoft Corporation' })),
    ).toBe(false);
  });

  it('blocks a result whose publisher is "Intel Corporation"', () => {
    expect(
      passesPreFilter(makeResult('SomeApp', 'registry', { publisher: 'Intel Corporation' })),
    ).toBe(false);
  });

  it('keeps a result with an unknown publisher', () => {
    // An unknown publisher should not be grounds for rejection.
    expect(
      passesPreFilter(makeResult('Elden Ring', 'registry', { publisher: 'FromSoftware' })),
    ).toBe(true);
  });

  it('keeps a result with no publisher', () => {
    expect(
      passesPreFilter(makeResult('Hades', 'registry', { publisher: null })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Path-based blocking (untrusted source)
// ---------------------------------------------------------------------------

describe('passesPreFilter — system paths are blocked', () => {
  it('blocks a result installed under C:/Windows/', () => {
    expect(
      passesPreFilter(makeResult('SomeTool', 'registry', { installPath: 'C:/Windows/System32/SomeTool' })),
    ).toBe(false);
  });

  it('blocks a result installed under Common Files', () => {
    expect(
      passesPreFilter(makeResult('SomeTool', 'registry', {
        installPath: 'C:/Program Files/Common Files/SomeTool',
      })),
    ).toBe(false);
  });

  it('blocks a result installed under AppData', () => {
    expect(
      passesPreFilter(makeResult('SomeTool', 'custom', {
        installPath: 'C:/Users/User/AppData/Local/SomeTool',
      })),
    ).toBe(false);
  });

  it('keeps a result in a normal game directory', () => {
    expect(
      passesPreFilter(makeResult('Elden Ring', 'registry', {
        installPath: 'D:/Games/EldenRing',
      })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — isLikelyGame delegates correctly for untrusted platforms
// ---------------------------------------------------------------------------

describe('isLikelyGame — untrusted platform applies pre-filter', () => {
  it('blocks a known non-game from registry', () => {
    expect(isLikelyGame(makeResult('Discord', 'registry'))).toBe(false);
  });

  it('keeps a real game from registry', () => {
    expect(isLikelyGame(makeResult('Elden Ring', 'registry'))).toBe(true);
  });

  it('blocks a known non-game from custom', () => {
    expect(isLikelyGame(makeResult('7-Zip', 'custom'))).toBe(false);
  });

  it('keeps a real game from custom', () => {
    expect(isLikelyGame(makeResult('Hades', 'custom'))).toBe(true);
  });
});
