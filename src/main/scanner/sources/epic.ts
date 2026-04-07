import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

const MANIFESTS_DIR = 'C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests';

interface EpicManifest {
  DisplayName?: string;
  AppName?: string;
  InstallLocation?: string;
  LaunchExecutable?: string;
  bIsApplication?: boolean;
  bIsIncompleteInstall?: boolean;
  AppCategories?: string[];
  MandatoryAppFolderName?: string;
  CatalogNamespace?: string;
}

export class EpicScanner implements GameScanner {
  readonly platform = 'epic' as const;

  async isAvailable(): Promise<boolean> {
    return existsSync(MANIFESTS_DIR);
  }

  async *scan(): AsyncGenerator<ScanResult> {
    if (!existsSync(MANIFESTS_DIR)) return;

    let entries: string[];
    try {
      entries = await fs.readdir(MANIFESTS_DIR);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.item')) continue;

      const manifestPath = path.join(MANIFESTS_DIR, entry);
      const result = await this.parseManifest(manifestPath);
      if (result) yield result;
    }
  }

  private async parseManifest(filePath: string): Promise<ScanResult | null> {
    let text: string;
    try {
      text = await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }

    let manifest: EpicManifest;
    try {
      manifest = JSON.parse(text) as EpicManifest;
    } catch {
      return null;
    }

    // Skip incomplete installations.
    if (manifest.bIsIncompleteInstall) return null;

    // Skip non-game entries (DLC, extras, plugins).
    const categories = manifest.AppCategories ?? [];
    const hasGameCategory = categories.some(
      (c) => c === 'games' || c.startsWith('games/'),
    );
    // Some manifests don't have categories — allow them through.
    if (categories.length > 0 && !hasGameCategory) return null;

    const title = manifest.DisplayName;
    const appName = manifest.AppName;
    const installLocation = manifest.InstallLocation;

    if (!title || !appName || !installLocation) return null;

    const installPath = installLocation.replace(/\\/g, '/');
    const exePath = manifest.LaunchExecutable
      ? path.join(installLocation, manifest.LaunchExecutable).replace(/\\/g, '/')
      : null;

    const launchUri = `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch`;

    return {
      title,
      platform: 'epic',
      platformId: appName,
      exePath,
      installPath,
      launchUri,
    };
  }
}
