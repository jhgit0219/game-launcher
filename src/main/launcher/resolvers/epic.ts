import type { Game } from '../../db/games';
import type { LaunchResult } from '../index';
import { shell } from 'electron';

const ALLOWED_PROTOCOLS = new Set(['com.epicgames.launcher:']);

export async function launchEpic(game: Game): Promise<LaunchResult> {
  const uri =
    game.launchUri ??
    (game.platformId
      ? `com.epicgames.launcher://apps/${encodeURIComponent(game.platformId)}?action=launch`
      : null);

  if (!uri) {
    return { ok: false, error: 'No launch URI available for this Epic game.' };
  }

  let protocol: string;
  try {
    protocol = new URL(uri).protocol;
  } catch {
    console.warn('[launcher] Rejected malformed Epic URI');
    return { ok: false, error: 'Malformed launch URI.' };
  }

  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    console.warn(`[launcher] Rejected Epic URI with disallowed protocol: ${protocol}`);
    return { ok: false, error: 'Launch URI uses a disallowed protocol.' };
  }

  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}
