# Game Launcher

A desktop application for organizing and launching games on Windows. Scans configured directories for installed games, tracks play sessions, and provides a clean interface for managing your library — including custom shortcuts for non-Steam titles.

## Setup

```bash
npm install
npm run dev
```

The app starts a Vite dev server for the renderer and launches Electron pointing at it. Hot module replacement is active for the renderer process.

## Building

```bash
# Type-check all source
npm run lint

# Run the test suite
npm test

# Compile renderer + main process
npm run build

# Package a distributable Windows installer
npm run package
```

The packaged installer is written to `release/`. electron-builder produces an NSIS installer that supports per-user installation and a custom install directory.

## Project Structure

```
src/
  main/          Electron main process (Node.js)
    db/          SQLite database layer (better-sqlite3)
    ipc/         IPC handlers exposed to the renderer
    launcher/    Game launch and process management
    scanner/     Directory scanning and game detection
  renderer/      React UI (Vite + TypeScript)
    components/  Shared UI components
    context/     React context providers
    hooks/       Custom hooks
  shared/        Types and utilities shared between processes
assets/          Application icons and static resources
dist/            Compiled output (generated)
release/         Packaged installer output (generated)
```

## Icon

Place `assets/icon.ico` (256x256 minimum) before running `npm run package`. A reference SVG is provided at `assets/icon.svg`. See the comments inside that file for conversion instructions.
