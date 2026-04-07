import type { Platform } from '../db/games';

export interface ScanResult {
  title: string;
  platform: Platform;
  platformId: string | null;
  exePath: string | null;
  installPath: string | null;
  launchUri: string | null;
}

export interface GameScanner {
  readonly platform: Platform;
  isAvailable(): Promise<boolean>;
  scan(): AsyncGenerator<ScanResult>;
}

export interface ScanOptions {
  abortSignal?: AbortSignal;
}
