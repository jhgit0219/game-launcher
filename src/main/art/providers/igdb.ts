/**
 * IGDB cover art provider (third-tier fallback).
 * Requires Twitch API client credentials.
 * API docs: https://api-docs.igdb.com/
 */

const IGDB_API_BASE = 'https://api.igdb.com/v4';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface IgdbGame {
  id: number;
  name: string;
  cover?: IgdbCover;
}

interface IgdbCover {
  id: number;
  url: string;
}

/** Cached access token (process-lifetime). */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getTwitchToken(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(
      `${TWITCH_TOKEN_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    if (!res.ok) return null;

    const body = (await res.json()) as TwitchTokenResponse;
    cachedToken = {
      token: body.access_token,
      expiresAt: now + body.expires_in * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export async function fetchIgdbCover(
  title: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  if (!clientId || !clientSecret) return null;

  const token = await getTwitchToken(clientId, clientSecret);
  if (!token) return null;

  try {
    const body = `search "${title.replace(/"/g, '')}"; fields id,name,cover.url; limit 5;`;
    const res = await fetch(`${IGDB_API_BASE}/games`, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
    });

    if (!res.ok) return null;

    const games = (await res.json()) as IgdbGame[];
    if (!games.length) return null;

    // Take the first result that has cover art.
    const gameWithCover = games.find((g) => g.cover?.url);
    if (!gameWithCover?.cover) return null;

    // Convert IGDB thumbnail URL to high-res: replace "t_thumb" with "t_cover_big".
    const url = gameWithCover.cover.url
      .replace('t_thumb', 't_cover_big')
      .replace(/^\/\//, 'https://');

    return url;
  } catch {
    return null;
  }
}
