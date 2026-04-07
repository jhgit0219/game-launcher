import '@testing-library/jest-dom';

// Stub the Electron preload API so renderer modules can import ipc without
// throwing "electronAPI is not available".
const mockElectronAPI = {
  scanStart: vi.fn().mockResolvedValue(undefined),
  scanCancel: vi.fn().mockResolvedValue(undefined),
  gamesList: vi.fn().mockResolvedValue([]),
  gamesLaunch: vi.fn().mockResolvedValue(undefined),
  gamesFavorite: vi.fn().mockResolvedValue(undefined),
  gamesHide: vi.fn().mockResolvedValue(undefined),
  shortcutsAdd: vi.fn().mockResolvedValue({}),
  shortcutsRemove: vi.fn().mockResolvedValue(undefined),
  shortcutsList: vi.fn().mockResolvedValue([]),
  settingsGet: vi.fn().mockResolvedValue({}),
  settingsUpdate: vi.fn().mockResolvedValue(undefined),
  artFetch: vi.fn().mockResolvedValue(null),
  openInstallFolder: vi.fn().mockResolvedValue(undefined),
  selectDirectory: vi.fn().mockResolvedValue(null),
  selectExecutable: vi.fn().mockResolvedValue(null),
  onScanProgress: vi.fn().mockReturnValue(() => undefined),
  onScanComplete: vi.fn().mockReturnValue(() => undefined),
  onScanError: vi.fn().mockReturnValue(() => undefined),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Silence CSS module imports (jsdom does not handle them).
// Vitest's default CSS handling makes class references undefined;
// map all CSS module lookups to the property name so className logic still works.
// This is handled by vitest's built-in css: false option below; no action needed here.
