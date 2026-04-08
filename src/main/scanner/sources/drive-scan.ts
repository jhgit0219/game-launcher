import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { GameScanner, ScanResult } from '../types';

const GAME_ROOT_DIRS = [
  'Games', 'Game', 'SteamLibrary',
  'Program Files', 'Program Files (x86)',
];

// Files/patterns that strongly indicate a directory is a game.
// Files that STRONGLY indicate a game. Must be specific enough to not match
// dev tools (Unity Hub), overlays (Overwolf), or other non-game software.
const GAME_INDICATORS = [
  // Unity engine — GameAssembly.dll is the compiled game code (Unity Hub doesn't have this)
  'GameAssembly.dll',
  // Steam DRM / SDK — only games ship these
  'steam_api.dll',
  'steam_api64.dll',
  'steam_appid.txt',
  // Epic Online Services — only games use these
  'eossdk-win64-shipping.dll',
  'eossdk-win32-shipping.dll',
  // GOG Galaxy SDK
  'Galaxy64.dll',
  'goggame-*.info',
  // Anti-cheat (only games have anti-cheat)
  'EasyAntiCheat',            // directory
  'BattlEye',                 // directory
  // Video codecs only bundled with games
  'bink2w64.dll',
  'bink2w32.dll',
  // Audio engines bundled with games
  'fmod.dll',
  'fmodex64.dll',
  'wwisec.dll',
  // Crack indicators (only games get cracked)
  'cream_api.ini',
  'dxvk.conf',
  // Game redistributable directories
  '_CommonRedist',            // directory
  'CommonRedist',             // directory
  // VR game SDK
  'openvr_api.dll',
  // FromSoft games
  'regulation.bin',
];

// File extensions that suggest game content.
// Excluded .pak — Chromium/Electron apps (Discord, LGHub, VS Code) use .pak for locale files.
const GAME_CONTENT_EXTENSIONS = [
  '.pck',                      // Godot engine
  '.wad', '.bsp', '.vpk',     // Valve / id Tech engines
  '.gcf',                      // Steam cache format
  '.bdt', '.bhd',             // FromSoft data archives
  '.forge',                   // Ubisoft Anvil engine
  '.arc', '.cpk',             // Capcom / CRI Middleware
];

export class DriveScanScanner implements GameScanner {
  readonly platform = 'custom' as const;
  private drives: string[] = [];

  async isAvailable(): Promise<boolean> {
    this.drives = this.discoverDrives();
    return this.drives.length > 0;
  }

  async *scan(): AsyncGenerator<ScanResult> {
    for (const drive of this.drives) {
      for (const dir of GAME_ROOT_DIRS) {
        const gamesRoot = join(drive, dir);
        if (!existsSync(gamesRoot)) continue;

        let entries: import('node:fs').Dirent[];
        try {
          entries = readdirSync(gamesRoot, { withFileTypes: true });
        } catch { continue; }

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const gameDir = join(gamesRoot, entry.name);
          const result = this.analyzeGameDirectory(gameDir, entry.name);
          if (result) yield result;
        }
      }
    }
  }

  /**
   * Analyze a directory to determine if it's a game, using metadata signals
   * rather than blindly looking for any .exe file.
   */
  private analyzeGameDirectory(gameDir: string, folderName: string): ScanResult | null {
    let files: string[];
    try {
      files = readdirSync(gameDir);
    } catch { return null; }

    const filesLower = files.map(f => f.toLowerCase());

    // Check for game indicator files
    const hasGameIndicator = GAME_INDICATORS.some(indicator => {
      if (indicator.includes('*')) {
        // Glob pattern
        const prefix = indicator.split('*')[0].toLowerCase();
        return filesLower.some(f => f.startsWith(prefix));
      }
      return filesLower.includes(indicator.toLowerCase());
    });

    // Check for game content files (pak, wad, etc.)
    const hasGameContent = filesLower.some(f =>
      GAME_CONTENT_EXTENSIONS.some(ext => f.endsWith(ext))
    );

    // Check subdirectories for indicators too (one level)
    let subDirHasIndicator = false;
    const subDirs = files.filter(f => {
      try { return statSync(join(gameDir, f)).isDirectory(); } catch { return false; }
    });

    for (const sub of subDirs) {
      try {
        const subFiles = readdirSync(join(gameDir, sub)).map(f => f.toLowerCase());
        if (GAME_INDICATORS.some(ind => {
          if (ind.includes('*')) {
            const prefix = ind.split('*')[0].toLowerCase();
            return subFiles.some(f => f.startsWith(prefix));
          }
          return subFiles.includes(ind.toLowerCase());
        })) {
          subDirHasIndicator = true;
          break;
        }
        if (subFiles.some(f => GAME_CONTENT_EXTENSIONS.some(ext => f.endsWith(ext)))) {
          subDirHasIndicator = true;
          break;
        }
      } catch { /* skip */ }
    }

    // Must have at least one game signal
    if (!hasGameIndicator && !hasGameContent && !subDirHasIndicator) {
      // Fallback: accept if the folder has any non-system .exe file.
      // The pre-filter will catch actual non-games later.
      const hasAnyGameExe = filesLower.some(f => {
        if (!f.endsWith('.exe')) return false;
        // Skip obvious non-game executables
        if (/^(unins|setup|install|dxsetup|vcredist|dotnet|ue4prereq|crashhandler|bootstrapper|prereq|redist)/i.test(f)) return false;
        return true;
      });
      if (!hasAnyGameExe) return null;
    }

    // Find the best exe
    const exe = this.findGameExe(gameDir, folderName, files);
    if (!exe) return null;

    const title = this.cleanTitle(folderName);
    if (!title || title.length < 2) return null;

    return {
      title,
      platform: 'custom',
      platformId: null,
      exePath: exe.replace(/\\/g, '/'),
      installPath: gameDir.replace(/\\/g, '/'),
      launchUri: null,
      hasGameIndicators: hasGameIndicator || hasGameContent || subDirHasIndicator,
    };
  }

  private findGameExe(gameDir: string, folderName: string, files: string[]): string | null {
    const candidates: { path: string; score: number }[] = [];
    const folderLower = folderName.toLowerCase().split(/[\s_-]/)[0];

    // Collect exes from root
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.exe')) continue;
      const score = this.scoreExe(join(gameDir, f), f, folderLower);
      if (score > -10) candidates.push({ path: join(gameDir, f), score });
    }

    // Check subdirs (bin, Game, Binaries, etc.)
    const exeSubdirs = ['bin', 'bin64', 'Binaries', 'Game', 'x64', 'Win64', 'Bin/Win64', 'runtime', 'app'];
    for (const sub of exeSubdirs) {
      const subPath = join(gameDir, sub);
      try {
        const subFiles = readdirSync(subPath);
        for (const f of subFiles) {
          if (!f.toLowerCase().endsWith('.exe')) continue;
          const score = this.scoreExe(join(subPath, f), f, folderLower);
          if (score > -10) candidates.push({ path: join(subPath, f), score });
        }
      } catch { /* skip */ }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].path;
  }

  private scoreExe(fullPath: string, filename: string, folderLower: string): number {
    const name = filename.toLowerCase().replace('.exe', '');
    let score = 0;

    // Name matches folder name
    if (name.includes(folderLower)) score += 10;

    // Larger files more likely to be the game
    try {
      const size = statSync(fullPath).size;
      if (size > 100_000_000) score += 5;
      else if (size > 10_000_000) score += 3;
      else if (size < 1_000_000) score -= 5;
    } catch { /* skip */ }

    // Penalize non-game exes
    if (/^(unins|setup|install|update|crash|ue4prereq)/i.test(name)) score -= 20;
    if (/^(launcher|bootstrapper|prereq|redist|dxsetup|vcredist)/i.test(name)) score -= 20;
    if (/^(dotnet|aspnet|windowsdesktop)/i.test(name)) score -= 20;
    if (name.includes('crashhandler') || name.includes('reporter')) score -= 20;

    return score;
  }

  private cleanTitle(folderName: string): string {
    return folderName
      .replace(/\s*Build\s*\d+/i, '')
      .replace(/\s*v[\d.]+\w*$/i, '')
      .replace(/\s*\([^)]*\)$/g, '')
      .replace(/\s*-\s*Copy$/i, '')
      .replace(/\s+(game|games|install|installed|client|launcher|files|data|folder|dir|app)\s*$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private discoverDrives(): string[] {
    try {
      const output = execSync('wmic logicaldisk where "DriveType=3" get Caption', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^[A-Z]:$/.test(line))
        .map(letter => letter + '\\');
    } catch {
      const letters = 'CDEFGHIJ'.split('');
      return letters.map(l => l + ':\\').filter(d => existsSync(d));
    }
  }
}
