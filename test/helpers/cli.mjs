// Runs the CLI as a child process and parses its JSON report.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = join(ROOT, 'skills', 'motion-audit', 'fixtures');
export const CLI = join(ROOT, 'skills', 'motion-audit', 'scripts', 'motion-audit.mjs');

// Child processes (and the browsers they start) write their temp files here, removed by removeScratch().
let scratch = null;
export const removeScratch = () => { if (scratch) rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }); scratch = null; };
const scratchDir = () => (scratch ??= mkdtempSync(join(tmpdir(), 'ma-run-')));

export const runCli = (args, { cli = CLI, cwd = ROOT, env = {}, timeoutMs = 600000 } = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...process.env, TEMP: scratchDir(), TMP: scratchDir(), TMPDIR: scratchDir(), ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => { child.kill(); reject(new Error(`cli timed out: ${args.join(' ')}`)); }, timeoutMs);
  child.on('error', (e) => { clearTimeout(timer); reject(e); });
  child.on('close', (code) => {
    clearTimeout(timer);
    let report = null;
    if (args.includes('--json')) { try { report = JSON.parse(stdout); } catch (e) { report = null; } }
    resolve({ code, stdout, stderr, report });
  });
});

// Runs a Node script with the same scratch temp directory and returns { code, stdout, stderr }.
export const runNode = (args, { cwd = ROOT, env = {}, timeoutMs = 600000 } = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, TEMP: scratchDir(), TMP: scratchDir(), TMPDIR: scratchDir(), ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => { child.kill(); reject(new Error(`timed out after ${timeoutMs} ms: ${args.join(' ')}\n${stdout}\n${stderr}`)); }, timeoutMs);
  child.on('error', (e) => { clearTimeout(timer); reject(e); });
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
});

// The set of finding fingerprints as readable "level kind element" strings, sorted.
export const kindsOf = (report) => [...new Set(report.findings.map((f) => `${f.level} ${f.kind}`))].sort();
export const idsOf = (report) => report.findings.map((f) => f.id).sort();
