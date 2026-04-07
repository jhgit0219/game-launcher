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

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await ipc.settings.update(patch);
    },
    [settings],
  );

  return { settings, loading, updateSettings };
}
