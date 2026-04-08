// Launch Electron with ELECTRON_RUN_AS_NODE unset.
// VS Code sets this env var which breaks require('electron') in the main process.
delete process.env.ELECTRON_RUN_AS_NODE;
const { spawn } = require('child_process');
const electron = require('electron');
const child = spawn(electron, ['.'], { stdio: 'inherit' });
child.on('close', (code) => process.exit(code ?? 0));
