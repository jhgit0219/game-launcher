/**
 * Global vitest setup file.
 *
 * Runs in every test environment.  Renderer (jsdom) tests pick up the
 * window.electronAPI stub and @testing-library/jest-dom matchers via the
 * environment-specific block below.  Node-environment tests are unaffected.
 */

// Only execute browser-environment setup when jsdom is active.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
    configurable: true,
  });
}
