import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../lib/ipc';
import type { AppSettings } from '../types/game';

const DEFAULT_SETTINGS: AppSettings = {
  scanDirectories: [],
  scanOnStartup: true,
  scanIntervalMinutes: 0,
  minimizeToTray: true,
  launchOnStartup: false,
  steamGridDbApiKey: '',
  artQuality: 'standard',
  sidebarAutoHide: false,
  thumbnailSize: 'medium',
};

interface UseSettingsResult {
  settings: AppSettings;
  loading: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await ipc.settings.get();
        if (!cancelled) setSettings(result);
      } catch {
        // Use defaults on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync settings across all useSettings() instances via custom event
  useEffect(() => {
    function onSettingsChanged(e: Event) {
      setSettings((e as CustomEvent<AppSettings>).detail);
    }
    window.addEventListener('settings-changed', onSettingsChanged);
    return () => window.removeEventListener('settings-changed', onSettingsChanged);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await ipc.settings.update(patch);
      window.dispatchEvent(new CustomEvent('settings-changed', { detail: next }));
    },
    [settings],
  );

  return { settings, loading, updateSettings };
}
