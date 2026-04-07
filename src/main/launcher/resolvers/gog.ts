import type { Game } from '../../db/games';
import type { LaunchResult } from '../index';
import { shell } from 'electron';

const ALLOWED_PROTOCOLS = new Set(['goggalaxy:']);

export async function launchGog(game: Game): Promise<LaunchResult> {
  const uri =
    game.launchUri ??
    (game.platformId ? `goggalaxy://openGame/${game.platformId}` : null);

  if (!uri) {
    return { ok: false, error: 'No launch URI available for this GOG game.' };
  }

  let protocol: string;
  try {
    protocol = new URL(uri).protocol;
  } catch {
    console.warn('[launcher] Rejected malformed GOG URI');
    return { ok: false, error: 'Malformed launch URI.' };
  }

  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    console.warn(`[launcher] Rejected GOG URI with disallowed protocol: ${protocol}`);
    return { ok: false, error: 'Launch URI uses a disallowed protocol.' };
  }

  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}
