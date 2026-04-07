import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { GameScanner, ScanResult } from '../types';

const BATTLENET_CONFIG_PATH = path.join(
  process.env['APPDATA'] ?? 'C:/Users/Default/AppData/Roaming',
  'Battle.net',
  'Battle.net.config',
);

/** Human-readable names for Blizzard product codes. */
const PRODUCT_NAMES: Record<string, string> = {
  wow:        'World of Warcraft',
  wow_classic: 'World of Warcraft Classic',
  wow_classic_era: 'World of Warcraft Classic (Era)',
  d3:         'Diablo III',
  d4:         'Diablo IV',
  hs_beta:    'Hearthstone',
  hs:         'Hearthstone',
  heroes:     'Heroes of the Storm',
  s1:         'StarCraft',
  s2:         'StarCraft II',
  pro:        'Overwatch',
  owce:       'Overwatch 2',
  viper:      'Call of Duty: Black Ops Cold War',
  rtro:       'Blizzard Arcade Collection',
  lazr:       'Call of Duty: Modern Warfare',
  fore:       'Call of Duty: Warzone',
  diablo_iv:  'Diablo IV',
  fenris:     'Diablo IV',
  w3:         'Warcraft III: Reforged',
};

interface BattleNetConfig {
  Games?: Record<string, BattleNetGame>;
}

interface BattleNetGame {
  LastActed?: string;
  ServerUid?: string;
  Resumable?: Record<string, unknown>;
  Played?: string;
  Installed?: Record<string, BattleNetInstallation>;
}

interface BattleNetInstallation {
  LastPlayed?: string;
  PlayRegion?: string;
  ServerUid?: string;
  Resumable?: string;
  InstallPath?: string;
}

export class BattleNetScanner implements GameScanner {
  readonly platform = 'battlenet' as const;

  async isAvailable(): Promise<boolean> {
    return existsSync(BATTLENET_CONFIG_PATH);
  }

  async *scan(): AsyncGenerator<ScanResult> {
    if (!existsSync(BATTLENET_CONFIG_PATH)) return;

    let configText: string;
    try {
      configText = await fs.readFile(BATTLENET_CONFIG_PATH, 'utf-8');
    } catch {
      return;
    }

    let config: BattleNetConfig;
    try {
      config = JSON.parse(configText) as BattleNetConfig;
    } catch {
      return;
    }

    const games = config.Games;
    if (!games) return;

    for (const [productCode, gameData] of Object.entries(games)) {
      const title = PRODUCT_NAMES[productCode.toLowerCase()] ??
                    this.formatProductCode(productCode);

      // Extract the first install path from the Installed map.
      let installPath: string | null = null;
      const installed = gameData.Installed;
      if (installed) {
        const firstInstall = Object.values(installed)[0];
        if (firstInstall?.InstallPath) {
          installPath = firstInstall.InstallPath.replace(/\\/g, '/');
        }
      }

      if (!installPath || !existsSync(installPath)) continue;

      yield {
        title,
        platform: 'battlenet',
        platformId: productCode,
        exePath: null,
        installPath,
        launchUri: `battlenet://${productCode}`,
      };
    }
  }

  private formatProductCode(code: string): string {
    return code
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
