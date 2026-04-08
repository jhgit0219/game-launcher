import { statSync } from 'node:fs';
import type { ScanResult } from './types';

// ---------------------------------------------------------------------------
// Trusted platforms — results from these scanners are always accepted.
// They come from real game stores so no further filtering is needed.
// ---------------------------------------------------------------------------

const TRUSTED_PLATFORMS = new Set<string>([
  'steam', 'epic', 'gog', 'origin', 'battlenet',
]);

// ---------------------------------------------------------------------------
// Pre-filter: fast path to drop obvious non-games from registry / custom /
// drive-scan results before they hit the Steam API.
// ---------------------------------------------------------------------------

// System-owned or infrastructure paths that should never contain games.
const SYSTEM_PATH_FRAGMENTS = [
  'c:/windows/',
  '/program files/common files/',
  '/program files (x86)/common files/',
  '/programdata/',
  '/appdata/',
  '/windowsapps/',
  '/program files/microsoft',
  '/program files (x86)/microsoft',
  '/android studio/',
  '/jetbrains/',
  '/visual studio/',
  '/adobe/',
  '/autodesk/',
  '/bluestacks/',
  '/anydesk/',
  '/teamviewer/',
];

// Paths that match a system fragment but should still be accepted.
const PATH_EXCEPTIONS = [
  '/microsoft games/',
];

function hasSystemPath(normPath: string): boolean {
  for (const exc of PATH_EXCEPTIONS) {
    if (normPath.includes(exc)) return false;
  }
  for (const frag of SYSTEM_PATH_FRAGMENTS) {
    if (normPath.includes(frag)) return true;
  }
  return false;
}

// Known system / utility publisher names.
const SYSTEM_PUBLISHERS = new Set([
  'microsoft corporation', 'intel corporation', 'nvidia corporation',
  'amd', 'advanced micro devices', 'google llc', 'google inc.',
  'mozilla', 'realtek semiconductor corp.', 'realtek',
  'adobe inc.', 'adobe systems', 'autodesk', 'oracle',
  'vmware', 'ibm', 'dell', 'hewlett-packard', 'hp inc.',
]);

// Minimal blocklist — just game store launchers (these match their own platform
// names which would cause confusion). Everything else is filtered programmatically
// via Steam Store + game indicator checks.
const BLOCKED_TITLES = new Set([
  'steam', 'epic games launcher', 'gog galaxy', 'origin', 'ea app',
  'battle.net', 'ubisoft connect',
]);

// Title prefixes that reliably signal a non-game — avoids wasting API lookups.
const SYSTEM_TITLE_PREFIXES = [
  'microsoft ', 'windows ', 'intel ', 'amd ', 'nvidia ', 'realtek ',
  'adobe ', 'autodesk ', 'vmware ', 'oracle ',
];

// Substrings that indicate runtimes, SDKs, or infrastructure.
// Keep this list tight — many real games contain words like "update" or "version".
const SYSTEM_TITLE_SUBSTRINGS = [
  'visual c++', 'vc redist', 'directx redistributable',
  'redistributable', ' runtime', ' sdk',
  'vcredist', '.net framework', '.net runtime',
];

// Patterns for exe filenames that are clearly not game executables.
// These are ONLY checked against exe filenames, NOT against game titles.
const SYSTEM_EXE_PATTERNS: RegExp[] = [
  /^setup/i, /^install/i, /^unins/i, /^vcredist/i, /^dotnet/i,
  /^dxsetup/i, /^ue4prereq/i, /^bootstrapper/i, /^prereq/i,
  /^redist/i, /^crashhandler/i, /^crashreporter/i,
];

/** Pure version strings like "0.296.0.23" or "3.12". */
const VERSION_ONLY_PATTERN = /^\d[\d.]+$/;

/** Titles with fewer than 3 characters after trimming. */
const TOO_SHORT_PATTERN = /^.{0,2}$/;

const MIN_EXE_SIZE_BYTES = 500 * 1024; // 500 KB — many indie games are small

function exeIsTooSmall(exePath: string): boolean {
  try {
    return statSync(exePath).size < MIN_EXE_SIZE_BYTES;
  } catch {
    return false;
  }
}

function exeNameIsSystemProcess(exePath: string): boolean {
  const parts = exePath.replace(/\\/g, '/').split('/');
  const filename = parts[parts.length - 1] ?? exePath;
  for (const pattern of SYSTEM_EXE_PATTERNS) {
    if (pattern.test(filename)) return true;
  }
  return false;
}

/**
 * Fast pre-filter for registry / custom / drive-scan results.
 *
 * Returns true when the result should be *kept* for further validation,
 * false when it can be confidently discarded as a non-game.
 *
 * This is intentionally conservative: it only blocks titles it is very
 * confident are not games. Anything ambiguous is kept and handed off to the
 * Steam Store validator.
 */
export function passesPreFilter(result: ScanResultWithPublisher): boolean {
  const title = result.title.trim();

  // Drop empty or suspiciously short titles.
  if (TOO_SHORT_PATTERN.test(title)) return false;

  // Drop bare version strings.
  if (VERSION_ONLY_PATTERN.test(title)) return false;

  const lower = title.toLowerCase();

  // Drop known-bad exact titles.
  if (BLOCKED_TITLES.has(lower)) return false;

  // Drop titles that start with a system-vendor prefix.
  for (const prefix of SYSTEM_TITLE_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }

  // Drop titles containing runtime / infrastructure substrings.
  for (const sub of SYSTEM_TITLE_SUBSTRINGS) {
    if (lower.includes(sub)) return false;
  }

  // Drop results installed under known system paths.
  const checkPath = result.installPath ?? result.exePath;
  if (checkPath) {
    const normPath = checkPath.toLowerCase().replace(/\\/g, '/');
    if (hasSystemPath(normPath)) return false;
  }

  // Drop results published by known system vendors.
  if (result.publisher) {
    const pub = result.publisher.toLowerCase().trim();
    if (SYSTEM_PUBLISHERS.has(pub)) return false;
  }

  // Drop executables that are too small to be a game.
  if (result.exePath && exeIsTooSmall(result.exePath)) return false;

  // Drop executables whose filename looks like an installer/system process.
  if (result.exePath && exeNameIsSystemProcess(result.exePath)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScanResultWithPublisher extends ScanResult {
  publisher?: string | null;
}

/**
 * Determine whether a scan result should be kept for further processing.
 *
 * Gate 1 — Trusted platforms: Steam, Epic, GOG, Origin, and Battle.net results
 *           always pass — they originate from real game stores.
 *
 * Gate 2 — Fast pre-filter: registry / custom / drive-scan results go through
 *           a local heuristic check that drops obvious system tools, version
 *           strings, tiny executables, and known-bad publishers.
 *
 * Anything that survives Gate 2 is kept in a potentially-a-game state. The
 * Steam Store validator (validator.ts) then either confirms or marks it
 * "unverified". Unverified results are still shown in the library with a
 * visual badge — they are never silently discarded at this stage.
 */
export function isLikelyGame(result: ScanResultWithPublisher): boolean {
  // Gate 1: trusted platform — always accept.
  if (TRUSTED_PLATFORMS.has(result.platform)) return true;

  // Gate 2: pre-filter for untrusted sources.
  return passesPreFilter(result);
}
