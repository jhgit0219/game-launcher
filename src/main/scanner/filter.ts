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

// Exact known-bad titles (lower-cased).
const BLOCKED_TITLES = new Set([
  // Windows / system
  'windows photos', 'windows media player', 'paint', 'calculator', 'notepad',
  'windows terminal', 'powershell', 'command prompt', 'task manager',
  'windows security', 'windows defender', 'device manager',
  // Browsers
  'microsoft edge', 'google chrome', 'mozilla firefox', 'opera', 'brave',
  'vivaldi', 'chromium', 'safari', 'tor browser',
  // GPU / hardware tools
  'nvidia geforce experience', 'nvidia app', 'amd adrenalin',
  'amd software: adrenalin edition', 'intel graphics command center',
  'intel arc control', 'msi afterburner', 'hwmonitor', 'cpu-z', 'gpu-z',
  // Dev tools
  'visual studio', 'visual studio code', 'git', 'node.js', 'python',
  'java', 'ruby', 'perl', 'php', 'android studio', 'intellij idea',
  'webstorm', 'pycharm', 'rider', 'clion', 'datagrip', 'goland',
  'sublime text', 'atom', 'brackets', 'notepad++', 'vim', 'emacs',
  // Chat / comms
  'discord', 'slack', 'microsoft teams', 'zoom', 'skype', 'telegram',
  'whatsapp', 'signal', 'line',
  // Launchers (not games)
  'steam', 'epic games launcher', 'gog galaxy', 'origin', 'ea app',
  'battle.net', 'ubisoft connect', 'xbox', 'xbox game bar',
  'artix game launcher', 'playnite', 'launchbox',
  // Utilities / tools
  '7-zip', '7zip', 'winrar', 'winzip', 'vlc media player', 'vlc',
  'obs studio', 'obs', 'audacity', 'handbrake', 'ffmpeg',
  'gimp', 'inkscape', 'blender', 'krita',
  'anydesk', 'teamviewer', 'parsec', 'moonlight',
  'x360ce', 'ds4windows', 'inputmapper', 'antimicro',
  'autohotkey', 'auto keyboard by murgee.com', 'auto typer by murgee',
  'everything', 'wiztree', 'treesize', 'windirstat',
  'putty', 'winscp', 'filezilla', 'cyberduck',
  'ccleaner', 'revo uninstaller', 'iobit uninstaller',
  'bluestacks', 'bluestacks x', 'bluestacks_nxt', 'nox player', 'ldplayer', 'memu',
  'qbittorrent', 'deluge', 'utorrent', 'bittorrent',
  'spotify', 'itunes', 'foobar2000', 'musicbee',
  'acrobat', 'foxit reader', 'sumatra pdf',
  'libre office', 'libreoffice', 'openoffice',
  // Adobe (apps, not games)
  'acrobat elements', 'adobe creative cloud experience',
  'adobe dreamweaver 2021', 'adobe media encoder 2024',
  'adobe photoshop 2024', 'adobe premiere pro 2024',
  'adobenotificationmanager', 'adoberedeemlauncher',
  // Misc junk that appeared in real scans
  'acc', 'advguide', 'application', 'artbookost', 'azureocr',
  'bin64', '64bit', 'app certification kit',
  // Remote / streaming tools
  'geforce now', 'xbox game bar',
]);

// Title prefixes that reliably signal a non-game.
const SYSTEM_TITLE_PREFIXES = [
  'microsoft ', 'intel ', 'amd ', 'nvidia ', 'realtek ', 'broadcom ',
  'windows ', 'adobe ', 'java ', 'python ', 'node.js', 'google ',
  'mozilla ', 'opera ', 'brave ', 'vivaldi ', 'chromium',
  'chrome ', // catches "Chrome 146.0.x" etc.
  'autodesk ', 'vmware ', 'oracle ', 'ibm ', 'dell ', 'hp ',
  'lenovo ', 'asus ', 'acer ', 'razer ', 'logitech ', 'corsair ',
  'steelseries ', 'hyperx ',
];

// Substrings that indicate runtimes, SDKs, or infrastructure.
const SYSTEM_TITLE_SUBSTRINGS = [
  'visual c++', 'vc redist', '.net ', 'directx',
  'redistributable', 'runtime', 'sdk', 'toolkit',
  'x86', 'x64', '(x86)', '(x64)', '(64-bit)', '(32-bit)',
  'build ', 'version ', 'update ',
];

// Patterns that catch installers, services, and other process-level junk.
const SYSTEM_NAME_PATTERNS: RegExp[] = [
  /setup/i, /install/i, /unins/i, /\bupdat(e|er)\b/i, /patcher/i,
  /\bservice\b/i, /\bhelper\b/i, /\bdaemon\b/i, /\bagent\b/i, /\bhost\b/i,
  /redistribut(able)?/i, /\bruntime\b/i, /dotnet/i, /vcredist/i,
  /crash(handler|reporter|pad)?/i, /\breport(er)?\b/i, /\bdiag\b/i,
  /\btoolkit\b/i, /\bsdk\b/i, /\bframework\b/i, /\bcomponent\b/i,
  /\bmodule\b/i, /\bpackage\b/i, /\bextension\b/i, /\bplugin\b/i,
  /\badd-in\b/i, /\bcodec\b/i, /\blibrary\b/i,
  /\bdriver\b/i, /\bmanager\b/i, /\bnotification\b/i,
  /\bredeem\b/i, /\bcertificat/i, /\bverif/i,
];

/** Pure version strings like "0.296.0.23" or "3.12". */
const VERSION_ONLY_PATTERN = /^\d[\d.]+$/;

/** Titles with fewer than 3 characters after trimming. */
const TOO_SHORT_PATTERN = /^.{0,2}$/;

const MIN_EXE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
  const name = filename.replace(/\.exe$/i, '');
  for (const pattern of SYSTEM_NAME_PATTERNS) {
    if (pattern.test(name)) return true;
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

  // Drop titles matching installer / service name patterns.
  for (const pattern of SYSTEM_NAME_PATTERNS) {
    if (pattern.test(title)) return false;
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

  // Drop executables whose filename looks like a system process.
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
