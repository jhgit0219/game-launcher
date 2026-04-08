import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

const MAX_DEPTH = 5;

// Directories that should never be treated as a game folder
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.cache',
  '$recycle.bin', 'system volume information',
  '_commonredist', 'commonredist', 'directx', 'redist',
  'vcredist', 'dotnetfx', 'support', 'installers',
]);

// Known non-game exe patterns
const NON_GAME_EXE = /^(unins\d*|setup|install|update|crash|ue4prereq|dxsetup|vcredist|dotnet|bootstrapper|prereq|redist)\.exe$/i;

// Files that strongly indicate a game engine or game content
const GAME_INDICATOR_FILES = [
  'gameassembly.dll',
  'steam_api.dll', 'steam_api64.dll', 'steam_appid.txt',
  'eossdk-win64-shipping.dll', 'galaxy64.dll',
  'bink2w64.dll', 'bink2w32.dll',
  'fmod.dll', 'fmodex64.dll', 'wwisec.dll',
  'openvr_api.dll', 'cream_api.ini', 'dxvk.conf',
];
const GAME_CONTENT_EXTS = ['.pck', '.wad', '.bsp', '.vpk', '.gcf', '.bdt', '.bhd', '.forge', '.arc', '.cpk'];

export class CustomScanner implements GameScanner {
  readonly platform = 'custom' as const;

  private directories: string[] = [];

  setDirectories(dirs: string[]): void {
    this.directories = dirs;
  }

  async isAvailable(): Promise<boolean> {
    return this.directories.length > 0;
  }

  async *scan(): AsyncGenerator<ScanResult> {
    for (const dir of this.directories) {
      if (!existsSync(dir)) continue;
      yield* this.scanDirectory(dir, 0);
    }
  }

  private async *scanDirectory(
    dir: string,
    depth: number,
  ): AsyncGenerator<ScanResult> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // At the top-level configured directory (depth 0), just recurse into subdirs.
    // Each subfolder is a potential game folder.
    if (depth === 0) {
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        const subPath = path.join(dir, entry.name);
        const result = this.analyzeAsGame(subPath, entry.name);
        if (result) {
          yield result;
        } else if (depth < MAX_DEPTH) {
          // Not a game at this level — recurse deeper
          yield* this.scanDirectory(subPath, depth + 1);
        }
      }
      return;
    }

    // At deeper levels, first check if THIS directory is a game
    const folderName = path.basename(dir);
    const result = this.analyzeAsGame(dir, folderName);
    if (result) {
      yield result;
      return; // Don't recurse into a detected game
    }

    // Not a game — recurse into subdirs if not too deep
    if (depth < MAX_DEPTH) {
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        yield* this.scanDirectory(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  /**
   * Check if a directory looks like a game. A directory is a game if it
   * contains at least one .exe file that isn't an installer/utility.
   */
  private analyzeAsGame(dir: string, folderName: string): ScanResult | null {
    const exe = this.findBestExe(dir);
    if (!exe) return null;

    // Check for game engine indicators
    let hasGameIndicators = false;
    try {
      const files = require('node:fs').readdirSync(dir) as string[];
      const filesLower = files.map((f: string) => f.toLowerCase());
      hasGameIndicators = GAME_INDICATOR_FILES.some(ind => filesLower.includes(ind))
        || filesLower.some((f: string) => GAME_CONTENT_EXTS.some(ext => f.endsWith(ext)));
    } catch { /* skip */ }

    // Prefer the exe name if it looks like a proper game name, otherwise use folder
    const exeBaseName = path.basename(exe).replace(/\.exe$/i, '');
    const cleanExeName = exeBaseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanFolderName = folderName
      .replace(/[-_]+/g, ' ')
      .replace(/\s*Build\s*\d+/i, '')
      .replace(/\s*v[\d.]+\w*$/i, '')
      .replace(/\s*\([^)]*\)$/g, '')
      // Strip common non-title suffixes from folder names
      .replace(/\s+(game|games|install|installed|client|launcher|files|data|folder|dir|app)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Use exe name if it's a real name (3+ chars, not generic like "game.exe")
    const genericExes = new Set(['game', 'launcher', 'start', 'play', 'run', 'app', 'main', 'client']);
    const title = (cleanExeName.length >= 3 && !genericExes.has(cleanExeName.toLowerCase()))
      ? cleanExeName
      : cleanFolderName;

    if (!title || title.length < 2) return null;

    return {
      title,
      platform: 'custom',
      platformId: null,
      exePath: exe.replace(/\\/g, '/'),
      installPath: dir.replace(/\\/g, '/'),
      launchUri: null,
      hasGameIndicators,
    };
  }

  /**
   * Find the best game exe in a directory, checking root and common subdirs.
   */
  private findBestExe(dir: string): string | null {
    const candidates: { path: string; score: number }[] = [];
    const folderLower = path.basename(dir).toLowerCase().replace(/[-_\s]+/g, '');

    // Check root directory
    this.collectExes(dir, folderLower, candidates);

    // Check common game exe subdirectories
    const subDirs = ['bin', 'bin64', 'Binaries', 'Game', 'x64', 'Win64', 'Bin/Win64'];
    for (const sub of subDirs) {
      const subPath = path.join(dir, sub);
      if (existsSync(subPath)) {
        this.collectExes(subPath, folderLower, candidates);
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].path;
  }

  private collectExes(
    dir: string,
    folderLower: string,
    candidates: { path: string; score: number }[],
  ): void {
    let files: string[];
    try {
      files = require('node:fs').readdirSync(dir);
    } catch {
      return;
    }

    for (const f of files) {
      if (!f.toLowerCase().endsWith('.exe')) continue;
      if (NON_GAME_EXE.test(f)) continue;

      const fullPath = path.join(dir, f);
      let score = 0;

      // Name similarity to folder
      const nameLower = f.toLowerCase().replace('.exe', '').replace(/[-_\s]+/g, '');
      if (nameLower.includes(folderLower) || folderLower.includes(nameLower)) score += 10;

      // Prefer larger executables
      try {
        const size = statSync(fullPath).size;
        if (size > 50_000_000) score += 5;
        else if (size > 5_000_000) score += 3;
        else if (size > 500_000) score += 1;
        else if (size < 100_000) score -= 3;
      } catch { /* skip */ }

      candidates.push({ path: fullPath, score });
    }
  }
}
