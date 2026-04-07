import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

const ORIGIN_CONTENT_DIR = 'C:/ProgramData/Origin/LocalContent';
const EA_CONTENT_DIR = 'C:/ProgramData/EA/games';

const ORIGIN_REGISTRY_KEY = 'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts';
const EA_REGISTRY_KEY = 'HKLM\\SOFTWARE\\WOW6432Node\\EA Games';

interface OriginManifestXml {
  title: string | null;
  installDir: string | null;
  gameId: string | null;
}

export class OriginScanner implements GameScanner {
  readonly platform = 'origin' as const;

  async isAvailable(): Promise<boolean> {
    return (
      existsSync(ORIGIN_CONTENT_DIR) ||
      existsSync(EA_CONTENT_DIR) ||
      (await this.hasRegistryGames())
    );
  }

  async *scan(): AsyncGenerator<ScanResult> {
    const seen = new Set<string>();

    // Scan registry entries first (most reliable).
    yield* this.scanRegistry(ORIGIN_REGISTRY_KEY, 'origin', seen);
    yield* this.scanRegistry(EA_REGISTRY_KEY, 'origin', seen);

    // Scan manifest XML files.
    for (const contentDir of [ORIGIN_CONTENT_DIR, EA_CONTENT_DIR]) {
      if (existsSync(contentDir)) {
        yield* this.scanManifests(contentDir, seen);
      }
    }
  }

  private async *scanRegistry(
    baseKey: string,
    _platform: string,
    seen: Set<string>,
  ): AsyncGenerator<ScanResult> {
    if (process.platform !== 'win32') return;

    let subKeys: string[];
    try {
      subKeys = await this.listRegistrySubKeys(baseKey);
    } catch {
      return;
    }

    for (const subKey of subKeys) {
      try {
        const fullKey = `${baseKey}\\${subKey}`;
        const installDir = await this.readRegistryValue(fullKey, 'Install Dir');
        const displayName = await this.readRegistryValue(fullKey, 'Display Name') ?? subKey;

        if (!installDir || !existsSync(installDir)) continue;

        const dedupeKey = installDir.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const installPath = installDir.replace(/\\/g, '/');
        const result: ScanResult = {
          title: displayName,
          platform: 'origin',
          platformId: subKey,
          exePath: null,
          installPath,
          launchUri: `origin://launchgame/${encodeURIComponent(subKey)}`,
        };

        yield result;
      } catch {
        continue;
      }
    }
  }

  private async *scanManifests(
    contentDir: string,
    seen: Set<string>,
  ): AsyncGenerator<ScanResult> {
    let entries: string[];
    try {
      entries = await fs.readdir(contentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(contentDir, entry);

      let stat: import('node:fs').Stats;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        continue;
      }

      if (!stat.isDirectory()) continue;

      // Look for __Installer/installerdata.xml or similar manifest files.
      const manifestCandidates = [
        path.join(entryPath, '__Installer', 'installerdata.xml'),
        path.join(entryPath, 'installerdata.xml'),
      ];

      for (const manifestPath of manifestCandidates) {
        if (!existsSync(manifestPath)) continue;

        try {
          const xmlContent = await fs.readFile(manifestPath, 'utf-8');
          const parsed = this.parseInstallerXml(xmlContent);

          if (!parsed.title) continue;

          const installPath = (parsed.installDir ?? entryPath).replace(/\\/g, '/');
          const dedupeKey = installPath.toLowerCase();

          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          yield {
            title: parsed.title,
            platform: 'origin',
            platformId: parsed.gameId,
            exePath: null,
            installPath,
            launchUri: parsed.gameId
              ? `origin://launchgame/${parsed.gameId}`
              : null,
          };
        } catch {
          continue;
        }
        break;
      }
    }
  }

  private parseInstallerXml(xml: string): OriginManifestXml {
    const titleMatch = xml.match(/<gameTitle[^>]*>([^<]+)<\/gameTitle>/i) ??
                       xml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const installDirMatch = xml.match(/<installDir[^>]*>([^<]+)<\/installDir>/i);
    const gameIdMatch = xml.match(/contentID="([^"]+)"/i) ??
                        xml.match(/<contentID[^>]*>([^<]+)<\/contentID>/i);

    return {
      title: titleMatch?.[1]?.trim() ?? null,
      installDir: installDirMatch?.[1]?.trim() ?? null,
      gameId: gameIdMatch?.[1]?.trim() ?? null,
    };
  }

  private async hasRegistryGames(): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try {
      const keys = await this.listRegistrySubKeys(ORIGIN_REGISTRY_KEY);
      return keys.length > 0;
    } catch {
      return false;
    }
  }

  private async listRegistrySubKeys(key: string): Promise<string[]> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync('reg', ['query', key]);
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith(key));
    return lines.map((l) => l.trim().replace(`${key}\\`, '').trim()).filter(Boolean);
  }

  private async readRegistryValue(key: string, valueName: string): Promise<string | null> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/v', valueName]);
      const match = stdout.match(/REG_SZ\s+(.+)/);
      return match ? match[1]!.trim() : null;
    } catch {
      return null;
    }
  }
}
