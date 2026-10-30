// Runs every fixture N times through the CLI and checks the fingerprints are identical across runs.
// CLI: node test/helpers/fixture-runs.mjs [runs=3] [name-filter]
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { CLI_MATRIX } from '../fixture-matrix.mjs';
import { FIXTURES, idsOf, kindsOf, removeScratch, runCli } from './cli.mjs';
import { serve } from './serve.mjs';

export const runMatrix = async ({ runs = 3, filter = '', log = console.log } = {}) => {
  const srv = await serve(FIXTURES);
  const results = [];
  try {
    for (const entry of CLI_MATRIX.filter((e) => e.name.includes(filter))) {
      const seen = [];
      for (let i = 0; i < runs; i++) {
        const started = Date.now();
        const r = await runCli([`${srv.url}/${entry.fixture}`, ...entry.args, '--json']);
        const seconds = Math.round((Date.now() - started) / 1000);
        const sig = r.report ? idsOf(r.report).join(',') : `no-report:${r.stderr.slice(0, 80)}`;
        seen.push({ code: r.code, sig, seconds, kinds: r.report ? kindsOf(r.report) : [] });
      }
      const stable = seen.every((s) => s.sig === seen[0].sig && s.code === seen[0].code);
      results.push({ entry, seen, stable });
      if (!stable) {
        const base = new Set(seen[0].sig.split(','));
        for (const s of seen.slice(1)) {
          const now = new Set(s.sig.split(','));
          log(`  differs from run 1: +[${[...now].filter((x) => !base.has(x)).join(' ')}] -[${[...base].filter((x) => !now.has(x)).join(' ')}]`);
        }
      }
      log(`${stable ? 'STABLE' : 'FLAKY '} ${entry.name} exit=${seen.map((s) => s.code).join('/')} t=${seen.map((s) => `${s.seconds}s`).join('/')} kinds=${seen[0].kinds.join(', ') || '-'}`);
    }
  } finally {
    await srv.close();
    removeScratch();
  }
  return results;
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await runMatrix({ runs: Number(process.argv[2] ?? 3), filter: process.argv[3] ?? '' });
  process.exitCode = results.every((r) => r.stable) ? 0 : 1;
}
