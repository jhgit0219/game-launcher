import type { Game } from '../../db/games';

/**
 * Returns the Steam CDN URL for a game's cover art (600x900 portrait).
 * Only applicable to Steam platform games with a numeric appid.
 */
export function getSteamCdnUrl(game: Game): string | null {
  if (game.platform !== 'steam' || !game.platformId) return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${game.platformId}/library_600x900_2x.jpg`;
}
