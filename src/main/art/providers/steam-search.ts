/**
 * Search the Steam store for a game by title and return a cover art URL.
 * Tries portrait first, falls back to landscape/capsule formats.
 * No API key required.
 */
export async function searchSteamForCover(title: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(title.trim());
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${query}&l=english&cc=US`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      total: number;
      items?: Array<{ id: number; name: string; tiny_image?: string; platforms?: { windows?: boolean } }>;
    };

    if (!data.items || data.items.length === 0) return null;

    const titleNorm = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Find the best match — prefer exact title + Windows platform
    let match = data.items[0];
    let bestScore = -1;

    for (const item of data.items) {
      let score = 0;
      const itemNorm = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (itemNorm === titleNorm) {
        score += 50;
      } else if (itemNorm.includes(titleNorm) || titleNorm.includes(itemNorm)) {
        const ratio = Math.min(itemNorm.length, titleNorm.length) / Math.max(itemNorm.length, titleNorm.length);
        score += ratio * 30;
      } else {
        continue;
      }

      // Prefer Windows-available titles (PC covers, not console)
      if (item.platforms?.windows) score += 20;

      if (score > bestScore) {
        bestScore = score;
        match = item;
      }
    }

    if (!match) return null;

    // Try portrait cover first (old CDN)
    const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${match.id}/library_600x900_2x.jpg`;
    const portraitRes = await fetch(portraitUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (portraitRes.ok) return portraitUrl;

    // Try header image (landscape, will be cropped by CSS object-fit)
    const headerUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${match.id}/header.jpg`;
    const headerRes = await fetch(headerUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (headerRes.ok) return headerUrl;

    // Try capsule (larger landscape)
    const capsuleUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${match.id}/capsule_616x353.jpg`;
    const capsuleRes = await fetch(capsuleUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (capsuleRes.ok) return capsuleUrl;

    // Last resort: use the tiny_image URL from search results and swap to a larger format
    if (match.tiny_image) {
      // tiny_image format: .../store_item_assets/steam/apps/ID/HASH/capsule_231x87.jpg
      // Replace with larger capsule
      const largerUrl = match.tiny_image.replace('capsule_231x87', 'capsule_616x353');
      const largerRes = await fetch(largerUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (largerRes.ok) return largerUrl;

      // Even the tiny one is better than nothing
      return match.tiny_image;
    }

    return null;
  } catch {
    return null;
  }
}
