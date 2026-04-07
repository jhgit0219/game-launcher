import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

const MAX_DEPTH = 2;

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
      yield* this.scanDirectory(dir, 1);
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

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory() && depth < MAX_DEPTH) {
        // Recurse one level deeper.
        yield* this.scanDirectory(entryPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.exe')) continue;

      // Use the immediate parent folder name as the game title.
      const title = path.basename(path.dirname(entryPath));

      yield {
        title,
        platform: 'custom',
        platformId: null,
        exePath: entryPath.replace(/\\/g, '/'),
        installPath: path.dirname(entryPath).replace(/\\/g, '/'),
        launchUri: null,
      };
    }
  }
}
