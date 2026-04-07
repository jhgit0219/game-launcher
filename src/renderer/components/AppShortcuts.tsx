import { useState, useEffect, useCallback } from 'react';
import type { AppShortcut } from '../types/game';
import { ipc } from '../lib/ipc';
import styles from './AppShortcuts.module.css';

export function AppShortcuts() {
  const [shortcuts, setShortcuts] = useState<AppShortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const fetchShortcuts = useCallback(async () => {
    try {
      const result = await ipc.shortcuts.list();
      setShortcuts(result);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts]);

  const handleRemove = useCallback(
    async (id: string) => {
      await ipc.shortcuts.remove(id);
      fetchShortcuts();
    },
    [fetchShortcuts],
  );

  const handleLaunch = useCallback((_shortcut: AppShortcut) => {
    // Shortcut launching will be wired via a dedicated IPC channel
    // once the main process launcher module supports it.
  }, []);

  if (loading) return null;

  return (
    <section className={styles.section} aria-label="App shortcuts">
      <div className={styles.header}>
        <h3 className={styles.heading}>App Shortcuts</h3>
        <button
          className={styles.addBtn}
          onClick={() => setShowAddDialog(true)}
          aria-label="Add app shortcut"
        >
          + Add
        </button>
      </div>

      <div className={styles.grid}>
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className={styles.card}
            role="button"
            tabIndex={0}
            onClick={() => handleLaunch(shortcut)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLaunch(shortcut);
            }}
            aria-label={shortcut.name}
          >
            {shortcut.iconPath ? (
              <img
                className={styles.icon}
                src={shortcut.iconPath}
                alt=""
              />
            ) : (
              <div className={styles.iconPlaceholder}>
                {shortcut.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={styles.name}>{shortcut.name}</span>
            <button
              className={styles.removeBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(shortcut.id);
              }}
              aria-label={`Remove ${shortcut.name}`}
            >
              &#10005;
            </button>
          </div>
        ))}
      </div>

      {showAddDialog && (
        <AddShortcutDialog
          onClose={() => setShowAddDialog(false)}
          onAdded={fetchShortcuts}
        />
      )}
    </section>
  );
}

interface AddShortcutDialogProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddShortcutDialog({ onClose, onAdded }: AddShortcutDialogProps) {
  const [name, setName] = useState('');
  const [executablePath, setExePath] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBrowse = useCallback(async () => {
    const path = await ipc.dialog.selectExecutable();
    if (path) setExePath(path);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !executablePath.trim()) return;
    setSaving(true);
    try {
      await ipc.shortcuts.add({
        name: name.trim(),
        executablePath: executablePath.trim(),
        iconPath: null,
        category: null,
      });
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [name, executablePath, onAdded, onClose]);

  return (
    <div className={styles.dialogBackdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add app shortcut"
      >
        <h3 className={styles.dialogTitle}>Add App Shortcut</h3>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            type="text"
            className={styles.fieldInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Application name"
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Executable</span>
          <div className={styles.pathRow}>
            <input
              type="text"
              className={styles.fieldInput}
              value={executablePath}
              onChange={(e) => setExePath(e.target.value)}
              placeholder="Path to .exe"
            />
            <button className={styles.browseBtn} onClick={handleBrowse}>
              Browse
            </button>
          </div>
        </label>

        <div className={styles.dialogActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={!name.trim() || !executablePath.trim() || saving}
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
