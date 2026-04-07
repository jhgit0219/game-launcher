import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { Game } from '../db/games';

interface UninstallResult {
  ok: boolean;
  method?: 'registry' | 'folder-delete';
  error?: string;
}

/**
 * Try to find a registry uninstall command for a game.
 * Searches both 32-bit and 64-bit uninstall registry hives.
 */
function findUninstallCommand(game: Game): string | null {
  const title = game.title;
  const installPath = game.installPath?.replace(/\//g, '\\');

  const regPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  for (const regPath of regPaths) {
    try {
      const output = execSync(
        `reg query "${regPath}" /s /f "${title}" /d`,
        { encoding: 'utf-8', timeout: 10000, windowsHide: true },
      );

      // Look for UninstallString in the output
      const lines = output.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim() ?? '';
        if (line.includes('UninstallString')) {
          const match = line.match(/UninstallString\s+REG_SZ\s+(.+)/i);
          if (match?.[1]) return match[1].trim();
        }
      }
    } catch {
      // Key not found or access denied — continue
    }
  }

  // Fallback: search by install path
  if (installPath) {
    for (const regPath of regPaths) {
      try {
        const output = execSync(
          `reg query "${regPath}" /s /f "${installPath}" /d`,
          { encoding: 'utf-8', timeout: 10000, windowsHide: true },
        );

        const lines = output.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]?.trim() ?? '';
          if (line.includes('UninstallString')) {
            const match = line.match(/UninstallString\s+REG_SZ\s+(.+)/i);
            if (match?.[1]) return match[1].trim();
          }
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}

export async function uninstallGame(game: Game): Promise<UninstallResult> {
  // Try registry uninstaller first
  const uninstallCmd = findUninstallCommand(game);

  if (uninstallCmd) {
    try {
      // Run the uninstaller — use cmd /c start for UAC elevation
      const child = spawn('cmd', ['/c', 'start', '', ...uninstallCmd.split(' ')], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      return { ok: true, method: 'registry' };
    } catch (err) {
      return { ok: false, error: `Failed to run uninstaller: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Fallback: delete the game folder if it exists
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
