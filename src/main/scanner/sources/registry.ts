import { existsSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/**
 * Keywords in executable paths that indicate system components, not games.
 * Entries whose DisplayIcon path contains any of these are excluded.
 */
const EXCLUDED_EXE_PATTERNS = [
  /\\windows\\/i,
  /\\system32\\/i,
  /\\syswow64\\/i,
  /msiexec/i,
  /uninst/i,
  /uninstall/i,
  /setup\.exe/i,
  /installer\.exe/i,
  /update\.exe/i,
  /crashreporter/i,
  /dxsetup/i,
  /vcredist/i,
  /directx/i,
  /\.net/i,
  /netframework/i,
  /windowsdesktop/i,
  /aspnetcore/i,
];

/**
 * Publisher names that indicate non-game system software.
 */
const EXCLUDED_PUBLISHERS = [
  /microsoft/i,
  /nvidia/i,
  /amd/i,
  /intel/i,
  /realtek/i,
  /logitech/i,
  /razer/i,
  /google/i,
  /apple/i,
  /adobe/i,
  /autodesk/i,
];

/**
 * Display names that match system runtimes and drivers.
 */
const EXCLUDED_NAME_PATTERNS = [
  /microsoft (visual c\+\+|\.net|edge|office|teams|onedrive|xbox)/i,
  /nvidia (physx|hd audio|geforce experience)/i,
  /directx/i,
  /vcredist/i,
  /steam/i,
  /epic games/i,
  /gog galaxy/i,
  /origin/i,
  /battle\.net/i,
  /blizzard/i,
];

interface UninstallEntry {
  name: string;
  installPath: string | null;
  exePath: string | null;
  publisher: string | null;
  subKey: string;
}

export class RegistryScanner implements GameScanner {
  readonly platform = 'registry' as const;

  /** Install paths already found by platform-specific scanners. */
  private knownPaths = new Set<string>();

  setKnownPaths(paths: Iterable<string>): void {
    this.knownPaths = new Set(
      [...paths].map((p) => p.toLowerCase().replace(/\\/g, '/')),
    );
  }

  async isAvailable(): Promise<boolean> {
    return process.platform === 'win32';
  }

  async *scan(): AsyncGenerator<ScanResult> {
    if (process.platform !== 'win32') return;

    for (const baseKey of UNINSTALL_KEYS) {
      yield* this.scanUninstallKey(baseKey);
    }
  }

  private async *scanUninstallKey(baseKey: string): AsyncGenerator<ScanResult> {
    let subKeys: string[];
    try {
      subKeys = await this.querySubKeys(baseKey);
    } catch {
      return;
    }

    for (const subKey of subKeys) {
      const entry = await this.readEntry(baseKey, subKey);
      if (!entry) continue;

      if (!this.looksLikeGame(entry)) continue;

      const installPath = entry.installPath?.replace(/\\/g, '/') ?? null;

      // Skip if this path was already found by a dedicated scanner.
      if (installPath) {
        const normPath = installPath.toLowerCase();
        if (this.knownPaths.has(normPath)) continue;
      }

      yield {
        title: entry.name,
        platform: 'registry',
        platformId: entry.subKey,
        exePath: entry.exePath?.replace(/\\/g, '/') ?? null,
        installPath,
        launchUri: null,
      };
    }
  }

  private looksLikeGame(entry: UninstallEntry): boolean {
    if (!entry.exePath && !entry.installPath) return false;

    if (EXCLUDED_NAME_PATTERNS.some((p) => p.test(entry.name))) return false;

    if (entry.publisher) {
      if (EXCLUDED_PUBLISHERS.some((p) => p.test(entry.publisher!))) return false;
    }

    if (entry.exePath) {
      if (EXCLUDED_EXE_PATTERNS.some((p) => p.test(entry.exePath!))) return false;
      if (!existsSync(entry.exePath)) return false;
    }

    return true;
  }

  private async readEntry(baseKey: string, subKey: string): Promise<UninstallEntry | null> {
    const fullKey = `${baseKey}\\${subKey}`;

    try {
      const [displayName, installLocation, displayIcon, publisher] = await Promise.all([
        this.queryValue(fullKey, 'DisplayName'),
        this.queryValue(fullKey, 'InstallLocation'),
        this.queryValue(fullKey, 'DisplayIcon'),
        this.queryValue(fullKey, 'Publisher'),
      ]);

      if (!displayName) return null;

      // DisplayIcon may be "C:\path\to\app.exe,0" — strip the icon index.
      const iconPath = displayIcon?.split(',')[0]?.trim() ?? null;
      const exePath = iconPath?.endsWith('.exe') ? iconPath : null;

      return {
        name: displayName,
        installPath: installLocation ?? null,
        exePath,
        publisher: publisher ?? null,
        subKey,
      };
    } catch {
      return null;
    }
  }

  private async querySubKeys(key: string): Promise<string[]> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('reg', ['query', key]);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith(key + '\\'));

      return lines.map((l) => l.slice(key.length + 1).trim()).filter(Boolean);
    } catch (err: unknown) {
      // ERROR: Access is denied is returned as exit code 1 — just skip the key.
      const error = err as NodeJS.ErrnoException;
      if (error.code === '1' || (error.message ?? '').includes('Access is denied')) {
        return [];
      }
      throw err;
    }
  }

  private async queryValue(key: string, valueName: string): Promise<string | null> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/v', valueName]);
      const match = stdout.match(/REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+(.+)/);
      return match ? match[1]!.trim() : null;
    } catch {
      return null;
    }
  }
}
