import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronAPI,
  GamesListFilter,
  AppShortcut,
  AppSettings,
  ScanProgress,
  ScanSummary,
} from '../shared/ipc-types';

const api: ElectronAPI = {
  scanStart: () => ipcRenderer.invoke('scan:start'),
  scanCancel: () => ipcRenderer.invoke('scan:cancel'),
  gamesList: (filter: GamesListFilter) =>
    ipcRenderer.invoke('games:list', filter),
  gamesLaunch: (gameId: string) =>
    ipcRenderer.invoke('games:launch', gameId),
  gamesFavorite: (gameId: string) =>
    ipcRenderer.invoke('games:favorite', gameId),
  gamesHide: (gameId: string) =>
    ipcRenderer.invoke('games:hide', gameId),
  shortcutsAdd: (data: Omit<AppShortcut, 'id' | 'createdAt'>) =>
    ipcRenderer.invoke('shortcuts:add', data),
  shortcutsRemove: (id: string) =>
    ipcRenderer.invoke('shortcuts:remove', id),
  shortcutsList: () => ipcRenderer.invoke('shortcuts:list'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsUpdate: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:update', patch),
  artFetch: (gameId: string) =>
    ipcRenderer.invoke('art:fetch', gameId),
  openInstallFolder: (gameId: string) =>
    ipcRenderer.invoke('games:openFolder', gameId),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectExecutable: () => ipcRenderer.invoke('dialog:selectExecutable'),

  onScanProgress: (callback: (data: ScanProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ScanProgress) =>
      callback(data);
    ipcRenderer.on('scan:progress', handler);
    return () => {
      ipcRenderer.removeListener('scan:progress', handler);
    };
  },

  onScanComplete: (callback: (data: ScanSummary) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ScanSummary) =>
      callback(data);
    ipcRenderer.on('scan:complete', handler);
    return () => {
      ipcRenderer.removeListener('scan:complete', handler);
    };
  },

  onScanError: (callback: (err: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, err: string) =>
      callback(err);
    ipcRenderer.on('scan:error', handler);
    return () => {
      ipcRenderer.removeListener('scan:error', handler);
    };
  },

  onArtUpdated: (callback: (data: { gameId: string; coverPath: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { gameId: string; coverPath: string }) =>
      callback(data);
    ipcRenderer.on('art:updated', handler);
    return () => {
      ipcRenderer.removeListener('art:updated', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
