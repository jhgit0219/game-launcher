import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync, mkdirSync, statSync } from 'node:fs';

const MIN_VALID_SIZE = 5 * 1024;  // 5 KB — anything smaller is likely an error page or placeholder
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF];
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47];

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

/**
 * Check if a cached cover is valid:
 * 1. File exists
 * 2. File is at least 5 KB (not empty, not an error page)
 * 3. File starts with JPEG or PNG magic bytes (not HTML error, not truncated)
 */
export function hasCachedCover(gameId: string): boolean {
  const coverPath = getCoverPath(gameId);
  if (!existsSync(coverPath)) return false;

  try {
    const stat = statSync(coverPath);
    if (stat.size < MIN_VALID_SIZE) return false;

    // Read first 4 bytes to verify it's actually an image
    const fd = require('node:fs').openSync(coverPath, 'r');
    const header = Buffer.alloc(4);
    require('node:fs').readSync(fd, header, 0, 4, 0);
    require('node:fs').closeSync(fd);

    const isJpeg = JPEG_MAGIC.every((b, i) => header[i] === b);
    const isPng = PNG_MAGIC.every((b, i) => header[i] === b);
    return isJpeg || isPng;
  } catch {
    return false;
  }
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
