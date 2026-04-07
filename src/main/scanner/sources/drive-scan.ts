import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { GameScanner, ScanResult } from '../types';

const GAME_ROOT_DIRS = ['Games', 'Game', 'SteamLibrary'];

// Files/patterns that strongly indicate a directory is a game.
const GAME_INDICATORS = [
  // Unity engine
  'UnityPlayer.dll',
  'UnityCrashHandler64.exe',
  'UnityCrashHandler32.exe',
  'GameAssembly.dll',
  // Unreal Engine
  'Engine',                   // directory
  // Steam DRM / SDK (present in cracked games too)
  'steam_api.dll',
  'steam_api64.dll',
  'steam_appid.txt',
  'InstallScript.vdf',
  // Epic Online Services
  'eossdk-win64-shipping.dll',
  'eossdk-win32-shipping.dll',
  // GOG Galaxy SDK
  'Galaxy64.dll',
  'GalaxyCSharp.dll',
  'goggame-*.info',
  // Anti-cheat (if it has anti-cheat, it's a game)
  'EasyAntiCheat',            // directory
  'BattlEye',                 // directory
  // Video / audio codecs common in games
  'bink2w64.dll',
  'bink2w32.dll',
  'fmod.dll',
  'fmodex64.dll',
  'wwisec.dll',
  // Crack / standalone indicators
  'cream_api.ini',
  'dinput8.dll',              // DLL hook, very common in cracks
  'dxvk.conf',
  // Game redistributable directories
  '_CommonRedist',            // directory
  'CommonRedist',             // directory
  // VR
  'actions.json',
  'openvr_api.dll',
  // FromSoft games
  'regulation.bin',
];

// File extensions that suggest game content
const GAME_CONTENT_EXTENSIONS = [
  '.pak', '.pck', '.wad', '.bsp', '.vpk', '.gcf',
  '.assets', '.bundle', '.resource',
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
      // Last resort: check if folder has an exe that matches the folder name
      const folderLower = folderName.toLowerCase().split(/[\s_-]/)[0];
      const matchingExe = filesLower.find(f =>
        f.endsWith('.exe') && f.replace('.exe', '').includes(folderLower)
      );
      if (!matchingExe) return null;
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
    const exeSubdirs = ['bin', 'bin64', 'Binaries', 'Game', 'x64'];
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
      .replace(/[-_]+/g, ' ')        // Replace dashes/underscores with spaces
      .replace(/\s+/g, ' ')          // Collapse multiple spaces
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
