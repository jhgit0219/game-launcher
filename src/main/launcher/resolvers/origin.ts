import type { Game } from '../../db/games';
import type { LaunchResult } from '../index';
import { shell } from 'electron';

const ALLOWED_PROTOCOLS = new Set(['origin:', 'origin2:']);

export async function launchOrigin(game: Game): Promise<LaunchResult> {
  const uri =
    game.launchUri ??
    (game.platformId
      ? `origin://launchgame/${encodeURIComponent(game.platformId)}`
      : null);

  if (!uri) {
    return { ok: false, error: 'No launch URI available for this Origin/EA game.' };
  }

  let protocol: string;
  try {
    protocol = new URL(uri).protocol;
  } catch {
    console.warn('[launcher] Rejected malformed Origin URI');
    return { ok: false, error: 'Malformed launch URI.' };
  }

  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    console.warn(`[launcher] Rejected Origin URI with disallowed protocol: ${protocol}`);
    return { ok: false, error: 'Launch URI uses a disallowed protocol.' };
  }

  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}
