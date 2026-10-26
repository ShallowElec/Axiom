import { spawn } from 'node:child_process';
import electron from 'electron';

// A terminal launched by some automation environments inherits
// ELECTRON_RUN_AS_NODE=1, which makes Electron behave like plain Node.
// Strip it so the desktop window always opens.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = ['.'];
if (process.env.MATRIX_NO_SANDBOX === '1') {
  args.push('--no-sandbox', '--disable-gpu');
}

const child = spawn(electron, args, { stdio: 'inherit', env });
child.on('error', (error) => {
  console.error('Could not launch Electron:', error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
