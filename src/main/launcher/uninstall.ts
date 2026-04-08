import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { shell } from 'electron';
import type { Game } from '../db/games';

interface UninstallResult {
  ok: boolean;
  method?: 'steam' | 'registry' | 'folder-delete';
  error?: string;
}

/**
 * Uninstall a Steam game via the steam:// protocol.
 */
function uninstallSteamGame(game: Game): UninstallResult {
  if (!game.platformId) {
    return { ok: false, error: 'No Steam app ID available.' };
  }
  shell.openExternal(`steam://uninstall/${game.platformId}`);
  return { ok: true, method: 'steam' };
}

/**
 * Try to find a registry uninstall command for a game.
 */
function findUninstallCommand(game: Game): string | null {
  const title = game.title;
  const installPath = game.installPath?.replace(/\//g, '\\');

  const regPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  // Search by title, then by install path
  const searchTerms = [title];
  if (installPath) searchTerms.push(installPath);

  for (const term of searchTerms) {
    for (const regPath of regPaths) {
      try {
        const output = execSync(
          `reg query "${regPath}" /s /f "${term}" /d`,
          { encoding: 'utf-8', timeout: 10000, windowsHide: true },
        );

        const lines = output.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.includes('UninstallString')) {
            const match = trimmed.match(/UninstallString\s+REG_SZ\s+(.+)/i);
            if (match?.[1]) return match[1].trim();
          }
        }
      } catch {
        // Key not found or access denied
      }
    }
  }

  return null;
}

export async function uninstallGame(game: Game): Promise<UninstallResult> {
  // Platform-specific uninstall
  if (game.platform === 'steam' && game.platformId) {
    return uninstallSteamGame(game);
  }

  // Try registry uninstaller
  const uninstallCmd = findUninstallCommand(game);

  if (uninstallCmd) {
    try {
      // Pass the entire command as a single string to cmd /c
      // This handles paths with spaces like:
      //   "C:\Program Files\Game\uninstall.exe" --silent
      //   MsiExec.exe /X{GUID}
      const child = spawn('cmd', ['/c', uninstallCmd], {
        detached: true,
        stdio: 'ignore',
        shell: true,
        windowsHide: false,
      });
      child.unref();
      return { ok: true, method: 'registry' };
    } catch (err) {
      return { ok: false, error: `Failed to run uninstaller: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Fallback: delete the game folder
  const installPath = game.installPath?.replace(/\//g, '\\');
  if (installPath && existsSync(installPath)) {
    try {
      rmSync(installPath, { recursive: true, force: true });
      return { ok: true, method: 'folder-delete' };
    } catch (err) {
      return { ok: false, error: `Failed to delete folder: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return { ok: false, error: 'No uninstaller found and install folder does not exist.' };
}
