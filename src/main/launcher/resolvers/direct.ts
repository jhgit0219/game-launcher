import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import type { Game } from '../../db/games';
import type { LaunchResult, ActiveSession } from '../index';

/**
 * Launch a game directly via its executable path.
 * Uses child_process.spawn (never shell: true) for security.
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

  if (!isAbsolute(exePath) || exePath.includes('..')) {
    return {
      ok: false,
      error: 'Executable path must be absolute and must not contain traversal components.',
    };
  }

  if (!existsSync(exePath)) {
    return {
      ok: false,
      missingPath: true,
      error: `Executable not found at: ${exePath}`,
      expectedPath: exePath,
    };
  }

  // Resolve symlinks to ensure the real target path is used.
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(exePath);
  } catch {
    return {
      ok: false,
      error: 'Could not resolve executable path.',
    };
  }

  const workingDir = game.installPath ?? undefined;
  const startedAt = Date.now();

  const child = spawn(resolvedPath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: workingDir,
    // shell: false is the default and must NOT be changed.
  });

  child.unref();

  const session: ActiveSession = {
    gameId: game.id,
    pid: child.pid ?? null,
    startedAt,
  };

  child.on('close', () => {
    onExit(session);
  });

  return { ok: true, session };
}
