// Runs npm. It is a .cmd shim on Windows, which only runs through a shell; every argument passed here is a plain word
// or a path without spaces.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const npm = (args, cwd) => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 });
