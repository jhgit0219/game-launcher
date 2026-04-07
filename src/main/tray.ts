import path from 'node:path';
import { Tray, Menu, app, nativeImage } from 'electron';
import type { BrowserWindow } from 'electron';
import { listGames } from './db/games';
import { scanOrchestrator } from './scanner/index';

let tray: Tray | null = null;

export function createTray(win: BrowserWindow): void {
  // Use a blank image if no icon asset exists yet.
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Game Launcher');

  tray.on('click', () => {
    toggleWindow(win);
  });

  updateTrayMenu(win);
}

export function updateTrayMenu(win: BrowserWindow): void {
  if (!tray) return;

  // Fetch the 5 most recently played games for the quick-launch submenu.
  let recentGames: Array<{ id: string; title: string }> = [];
  try {
    recentGames = listGames({ hidden: false })
      .filter((g) => g.lastPlayed !== null)
      .sort((a, b) => {
        const ta = a.lastPlayed ?? '';
        const tb = b.lastPlayed ?? '';
        return tb.localeCompare(ta);
      })
      .slice(0, 5)
      .map((g) => ({ id: g.id, title: g.title }));
  } catch {
    // DB not ready yet.
  }

  const recentItems: Electron.MenuItemConstructorOptions[] =
    recentGames.length > 0
      ? recentGames.map((g) => ({
          label: g.title,
          click: () => {
            import('./launcher/index').then(({ gameLauncher }) => {
              gameLauncher.launch(g.id).catch(console.error);
            }).catch(console.error);
          },
        }))
      : [{ label: 'No recent games', enabled: false }];

  const menu = Menu.buildFromTemplate([
    {
      label: win.isVisible() ? 'Hide Window' : 'Show Window',
      click: () => toggleWindow(win),
    },
    { type: 'separator' },
    {
      label: 'Recent Games',
      submenu: recentItems,
    },
    { type: 'separator' },
    {
      label: 'Scan Now',
      click: () => {
        scanOrchestrator.runScan(win).catch(console.error);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function toggleWindow(win: BrowserWindow): void {
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
