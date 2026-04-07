import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

function getCoversDir(): string {
  const appData = process.env['APPDATA'];
  if (!appData) throw new Error('APPDATA environment variable is not set');
  const dir = path.join(appData, 'game-launcher', 'covers');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCoverPath(gameId: string): string {
  return path.join(getCoversDir(), `${gameId}.jpg`);
}

export function hasCachedCover(gameId: string): boolean {
  return existsSync(getCoverPath(gameId));
}

export async function saveCoverBuffer(gameId: string, buffer: Buffer): Promise<string> {
  // Resize to 300x450 using sharp if available, otherwise save as-is.
  let finalBuffer: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    finalBuffer = await sharp(buffer)
      .resize(300, 450, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch {
    // sharp not available or image processing failed — save original.
    finalBuffer = buffer;
  }

  const coverPath = getCoverPath(gameId);
  await fs.writeFile(coverPath, finalBuffer);
  return coverPath;
}

export async function deleteCover(gameId: string): Promise<void> {
  const coverPath = getCoverPath(gameId);
  try {
    await fs.unlink(coverPath);
  } catch {
    // File may not exist.
  }
}
