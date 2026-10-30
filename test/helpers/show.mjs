// Prints the CLI text output for one fixture: node test/helpers/show.mjs <fixture.html> [cli args]
import { FIXTURES, runCli } from './cli.mjs';
import { serve } from './serve.mjs';

const srv = await serve(FIXTURES);
try {
  const r = await runCli([`${srv.url}/${process.argv[2]}`, ...process.argv.slice(3)]);
  console.log(r.stdout, r.stderr, `exit=${r.code}`);
} finally {
  await srv.close();
}
