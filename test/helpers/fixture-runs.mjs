// Runs every fixture N times through the CLI and checks that the fingerprints are identical across
// runs and equal to the golden file. MA_SHARD=<index>/<total> keeps one slice of the matrix.
// CLI: node test/helpers/fixture-runs.mjs [runs=3] [name-filter]
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLI_MATRIX } from '../fixture-matrix.mjs';
import { FIXTURES, kindsOf, removeScratch, runCli } from './cli.mjs';
import { GOLDEN_PATH, againstGolden, signature } from './golden.mjs';
import { inShard } from './shard.mjs';
import { serve } from './serve.mjs';

export const runMatrix = async ({ runs = 3, filter = '', log = console.log } = {}) => {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  const srv = await serve(FIXTURES);
  const results = [];
  try {
    for (const [position, entry] of CLI_MATRIX.entries()) {
      if (!entry.name.includes(filter) || !inShard(entry.name, position)) continue;
      const seen = [];
      for (let i = 0; i < runs; i++) {
        const started = Date.now();
        const r = await runCli([`${srv.url}/${entry.fixture}`, ...entry.args, '--json']);
        const seconds = Math.round((Date.now() - started) / 1000);
        const got = r.report ? againstGolden(signature(r.report), golden[entry.name].findings, golden[entry.name].exit) : null;
        const sig = got ? got.findings.join(',') : `no-report:${r.stderr.slice(0, 80)}`;
        const matchesGolden = Boolean(got) && JSON.stringify(got.findings) === JSON.stringify(golden[entry.name].findings) && r.code === got.exit;
        seen.push({ code: r.code, sig, seconds, matchesGolden, kinds: r.report ? kindsOf(r.report) : [] });
      }
      const stable = seen.every((s) => s.sig === seen[0].sig && s.code === seen[0].code);
      const allGolden = seen.every((s) => s.matchesGolden);
      results.push({ entry, seen, stable, golden: allGolden });
      if (!stable) {
        const base = new Set(seen[0].sig.split(','));
        for (const s of seen.slice(1)) {
          const now = new Set(s.sig.split(','));
          log(`  differs from run 1: +[${[...now].filter((x) => !base.has(x)).join(' ')}] -[${[...base].filter((x) => !now.has(x)).join(' ')}]`);
        }
      }
      log(`${stable ? (allGolden ? 'STABLE' : 'GOLDEN') : 'FLAKY '} ${entry.name} exit=${seen.map((s) => s.code).join('/')} t=${seen.map((s) => `${s.seconds}s`).join('/')} kinds=${seen[0].kinds.join(', ') || '-'}${allGolden ? '' : ' (differs from the golden file)'}`);
    }
  } finally {
    await srv.close();
    removeScratch();
  }
  return results;
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await runMatrix({ runs: Number(process.argv[2] ?? 3), filter: process.argv[3] ?? '' });
  process.exitCode = results.length && results.every((r) => r.stable && r.golden) ? 0 : 1;
}
