import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

// ─── VDF parser (minimal — only handles key-value pairs we need) ─────────────

/**
 * Parse a Valve Data Format (VDF/ACF) text file into a nested plain object.
 * Handles the subset of VDF used by Steam manifest files.
 */
function parseVdf(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/);
  const stack: Array<Record<string, unknown>> = [{}];
  let current = stack[0]!;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '{') {
      // The opening brace follows a key that was pushed as a string —
      // replace it with an object reference.
      const keys = Object.keys(current);
      const lastKey = keys[keys.length - 1];
      if (lastKey !== undefined) {
        const child: Record<string, unknown> = {};
        current[lastKey] = child;
        stack.push(current);
        current = child;
      }
      continue;
    }
    if (line === '}') {
      const parent = stack.pop();
      if (parent !== undefined) {
        current = parent;
      }
      continue;
    }

    // Match key-value pairs: "key"   "value"  or just  "key"
    const kvMatch = line.match(/^"([^"]+)"\s+"([^"]*)"$/);
    if (kvMatch) {
      current[kvMatch[1]!] = kvMatch[2]!;
      continue;
    }
    const keyOnlyMatch = line.match(/^"([^"]+)"\s*$/);
    if (keyOnlyMatch) {
      // A lone key signals an upcoming object block.
      current[keyOnlyMatch[1]!] = '';
    }
  }

  return stack[0]!;
}

// ─── Registry access (Windows-only, graceful fallback on other OSes) ─────────

async function readRegistryString(
  hive: string,
  key: string,
  valueName: string,
): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  try {
    // Use the built-in `reg` command-line tool — no native addon required.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('reg', [
      'query',
      `${hive}\\${key}`,
      '/v',
      valueName,
    ]);

    const match = stdout.match(/REG_SZ\s+(.+)/);
    return match ? match[1]!.trim() : null;
  } catch {
    return null;
  }
}

// ─── Steam scanner ────────────────────────────────────────────────────────────

export class SteamScanner implements GameScanner {
  readonly platform = 'steam' as const;

  async isAvailable(): Promise<boolean> {
    const steamPath = await this.getSteamPath();
    return steamPath !== null && existsSync(steamPath);
  }

  async *scan(): AsyncGenerator<ScanResult> {
    const steamPath = await this.getSteamPath();
    if (!steamPath) return;

    const libraryPaths = await this.getLibraryPaths(steamPath);

    for (const libPath of libraryPaths) {
      const steamappsDir = path.join(libPath, 'steamapps');
      if (!existsSync(steamappsDir)) continue;

      let entries: string[];
      try {
        entries = await fs.readdir(steamappsDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue;

        const manifestPath = path.join(steamappsDir, entry);
        const result = await this.parseManifest(manifestPath, steamappsDir);
        if (result) yield result;
      }
    }
  }

  private async getSteamPath(): Promise<string | null> {
    // Try registry first on Windows.
    const regPath = await readRegistryString(
      'HKCU',
      'Software\\Valve\\Steam',
      'SteamPath',
    );
    if (regPath && existsSync(regPath)) return regPath;

    // Common fallback locations.
    const candidates = [
      'C:/Program Files (x86)/Steam',
      'C:/Program Files/Steam',
      path.join(process.env['HOME'] ?? '', '.steam/steam'),
    ];
    return candidates.find(existsSync) ?? null;
  }

  private async getLibraryPaths(steamPath: string): Promise<string[]> {
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    const paths: string[] = [steamPath];

    let text: string;
    try {
      text = await fs.readFile(vdfPath, 'utf-8');
    } catch {
      return paths;
    }

    const parsed = parseVdf(text);

    // Steam's libraryfolders.vdf uses "LibraryFolders" or "libraryfolders" as root.
    const root =
      (parsed['LibraryFolders'] as Record<string, unknown>) ??
      (parsed['libraryfolders'] as Record<string, unknown>) ??
      {};

    for (const [key, value] of Object.entries(root)) {
      // Numeric keys represent additional library entries.
      // Each value may be a string (old format) or an object with a "path" field (new format).
      if (!/^\d+$/.test(key)) continue;

      if (typeof value === 'string') {
        if (existsSync(value)) paths.push(value);
      } else if (typeof value === 'object' && value !== null) {
        const entry = value as Record<string, unknown>;
        const entryPath = entry['path'] as string | undefined;
        if (entryPath && existsSync(entryPath)) paths.push(entryPath);
      }
    }

    return paths;
  }

  private async parseManifest(
    manifestPath: string,
    steamappsDir: string,
  ): Promise<ScanResult | null> {
    let text: string;
    try {
      text = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      return null;
    }

    const parsed = parseVdf(text);
    const appState = (parsed['AppState'] as Record<string, unknown>) ?? {};

    const appid = appState['appid'] as string | undefined;
    const name = appState['name'] as string | undefined;
    const installdir = appState['installdir'] as string | undefined;

    if (!appid || !name || !installdir) return null;

    // Skip games that aren't fully installed (StateFlags & 4 === 0 means not installed).
    const stateFlags = parseInt((appState['StateFlags'] as string) ?? '0', 10);
    if ((stateFlags & 4) === 0) return null;

    const installPath = path.join(steamappsDir, 'common', installdir).replace(/\\/g, '/');

    return {
      title: name,
      platform: 'steam',
      platformId: appid,
      exePath: null, // Steam games launch via URI; exe path not required.
      installPath,
      launchUri: `steam://rungameid/${appid}`,
    };
  }
}
