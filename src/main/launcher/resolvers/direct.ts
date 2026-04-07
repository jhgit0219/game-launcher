import { existsSync } from 'node:fs';
import { isAbsolute, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import type { Game } from '../../db/games';
import type { LaunchResult, ActiveSession } from '../index';

/** Check if a path is a UNC network path (\\server\share\...) */
function isUncPath(p: string): boolean {
  const normalized = p.replace(/\//g, '\\');
  return normalized.startsWith('\\\\');
}

/**
 * Launch a game directly via its executable path.
 * Supports both local paths and UNC network paths.
 */
export async function launchDirect(
  game: Game,
  onExit: (session: ActiveSession) => void,
): Promise<LaunchResult> {
  const exePath = game.executablePath;

  if (!exePath) {
    return {
      ok: false,
      missingPath: true,
      error: `No executable path configured for "${game.title}".`,
    };
  }

  // Normalize to OS path separators for validation
  const osPath = exePath.replace(/\//g, '\\');

  if (!isAbsolute(osPath) && !isUncPath(osPath)) {
    return {
      ok: false,
      error: 'Executable path must be absolute.',
    };
  }

  if (osPath.includes('..')) {
    return {
      ok: false,
      error: 'Executable path must not contain traversal components.',
    };
  }

  if (!existsSync(osPath)) {
    return {
      ok: false,
      missingPath: true,
      error: `Executable not found at: ${exePath}`,
      expectedPath: exePath,
    };
  }

  const workingDir = game.installPath
    ? game.installPath.replace(/\//g, '\\')
    : dirname(osPath);

  const startedAt = Date.now();

  try {
    // Use cmd /c start for all custom/registry games. This handles:
    // - UAC elevation prompts (anti-cheat games like Genshin Impact)
    // - UNC network paths
    // - Protected directories
    // - Exe files that need to run from their own directory
    const child = spawn('cmd', ['/c', 'start', '/d', workingDir, '', osPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.unref();

    const session: ActiveSession = {
      gameId: game.id,
      pid: child.pid ?? null,
      startedAt,
    };

    child.on('error', (err) => {
      console.error(`[launcher] Failed to start ${game.title}:`, err.message);
    });

    child.on('close', () => {
      onExit(session);
    });

    return { ok: true, session };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to launch: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
