import { useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useScanProgress } from '../hooks/useScanProgress';
import { ipc } from '../lib/ipc';
import styles from './Settings.module.css';

export function Settings() {
  const { settings, loading, updateSettings } = useSettings();
  const { scanning, startScan } = useScanProgress();

  const handleAddDirectory = useCallback(async () => {
    const path = await ipc.dialog.selectDirectory();
    if (path && !settings.scanDirectories.includes(path)) {
      await updateSettings({
        scanDirectories: [...settings.scanDirectories, path],
      });
    }
  }, [settings.scanDirectories, updateSettings]);

  const handleRemoveDirectory = useCallback(
    async (path: string) => {
      await updateSettings({
        scanDirectories: settings.scanDirectories.filter((d) => d !== path),
      });
    },
    [settings.scanDirectories, updateSettings],
  );

  if (loading) {
    return <div className={styles.loading}>Loading settings...</div>;
  }

  return (
    <div className={styles.page} role="region" aria-label="Settings">
      <h2 className={styles.pageTitle}>Settings</h2>

      {/* Scan Directories */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Scan Directories</h3>
        <p className={styles.sectionDesc}>
          Add custom directories to scan for games and applications.
        </p>

        <div className={styles.dirList}>
          {settings.scanDirectories.length === 0 && (
            <p className={styles.emptyText}>No custom directories added.</p>
          )}
          {settings.scanDirectories.map((dir) => (
            <div key={dir} className={styles.dirItem}>
              <span className={styles.dirPath}>{dir}</span>
              <button
                className={styles.dirRemove}
                onClick={() => handleRemoveDirectory(dir)}
                aria-label={`Remove ${dir}`}
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>

        <button className={styles.addDirBtn} onClick={handleAddDirectory}>
          + Add Directory
        </button>
      </section>

      {/* General */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>General</h3>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.scanOnStartup}
            onChange={(e) =>
              updateSettings({ scanOnStartup: e.target.checked })
            }
          />
          <span>Scan for games on startup</span>
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.minimizeToTray}
            onChange={(e) =>
              updateSettings({ minimizeToTray: e.target.checked })
            }
          />
          <span>Minimize to system tray on close</span>
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.launchOnStartup}
            onChange={(e) =>
              updateSettings({ launchOnStartup: e.target.checked })
            }
          />
          <span>Launch on Windows startup</span>
        </label>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="refresh-interval">
            Scan interval (minutes, 0 = manual only)
          </label>
          <input
            id="refresh-interval"
            type="number"
            className={styles.numberInput}
            min={0}
            max={1440}
            value={settings.scanIntervalMinutes}
            onChange={(e) =>
              updateSettings({
                scanIntervalMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
              })
            }
          />
        </div>
      </section>

      {/* API Keys */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>API Keys</h3>
        <p className={styles.sectionDesc}>
          Provide API keys for enhanced cover art fetching.
        </p>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="steamgrid-key">
            SteamGridDB API Key
          </label>
          <input
            id="steamgrid-key"
            type="password"
            className={styles.textInput}
            value={settings.steamGridDbApiKey}
            onChange={(e) =>
              updateSettings({ steamGridDbApiKey: e.target.value })
            }
            placeholder="Enter your SteamGridDB API key"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="art-quality">
            Art Quality
          </label>
          <select
            id="art-quality"
            className={styles.selectInput}
            value={settings.artQuality}
            onChange={(e) =>
              updateSettings({
                artQuality: e.target.value as 'standard' | 'high',
              })
            }
          >
            <option value="standard">Standard (300x450)</option>
            <option value="high">High (600x900)</option>
          </select>
        </div>
      </section>

      {/* Actions */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Library</h3>
        <button
          className={styles.actionBtn}
          onClick={startScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Scan for Games Now'}
        </button>
      </section>
    </div>
  );
}
