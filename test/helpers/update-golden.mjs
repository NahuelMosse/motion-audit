// Rewrites test/expected-findings.json from the current behaviour: review the diff before committing.
// node test/helpers/update-golden.mjs [name-filter]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CLI_MATRIX } from '../fixture-matrix.mjs';
import { FIXTURES, removeScratch, runCli } from './cli.mjs';
import { GOLDEN_PATH, signature } from './golden.mjs';
import { serve } from './serve.mjs';

const filter = process.argv[2] ?? '';
const golden = existsSync(GOLDEN_PATH) ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) : {};
const srv = await serve(FIXTURES);
try {
  for (const entry of CLI_MATRIX.filter((e) => e.name.includes(filter))) {
    const r = await runCli([`${srv.url}/${entry.fixture}`, ...entry.args, '--json']);
    golden[entry.name] = { exit: r.code, findings: signature(r.report) };
    console.log(`${entry.name}: exit ${r.code}, ${golden[entry.name].findings.length} findings`);
  }
} finally {
  await srv.close();
  removeScratch();
}
writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
