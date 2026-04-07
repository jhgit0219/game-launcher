/**
 * IPC channel name constants. Keep in sync with preload.ts and ipc-types.ts.
 * Using string literals here avoids a circular dependency with the shared module.
 */

export const Channels = {
  // Renderer → Main (invoke)
  SCAN_START:            'scan:start',
  SCAN_CANCEL:           'scan:cancel',
  GAMES_LIST:            'games:list',
  GAMES_LAUNCH:          'games:launch',
  GAMES_FAVORITE:        'games:favorite',
  GAMES_HIDE:            'games:hide',
  SHORTCUTS_ADD:         'shortcuts:add',
  SHORTCUTS_REMOVE:      'shortcuts:remove',
  SHORTCUTS_LIST:        'shortcuts:list',
  SETTINGS_GET:          'settings:get',
  SETTINGS_UPDATE:       'settings:update',
  ART_FETCH:             'art:fetch',
  GAMES_OPEN_FOLDER:     'games:openFolder',
  DIALOG_SELECT_DIR:     'dialog:selectDirectory',
  DIALOG_SELECT_EXE:     'dialog:selectExecutable',
  WINDOW_MINIMIZE:       'window:minimize',
  WINDOW_MAXIMIZE:       'window:maximize',
  WINDOW_CLOSE:          'window:close',

  // Main → Renderer (send)
  SCAN_PROGRESS:         'scan:progress',
  SCAN_COMPLETE:         'scan:complete',
  SCAN_ERROR:            'scan:error',
  ART_UPDATED:           'art:updated',
} as const;
