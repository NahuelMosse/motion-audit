import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageError, parseArgs } from '../skills/motion-audit/scripts/lib/args.mjs';

test('repeatable flags collect, booleans toggle, --flag=value works', () => {
  const { opts, positional } = parseArgs(['http://x', '--only', 'nav a', '--only=main button', '--max', '12', '--cpu=4', '--interact', '--min-coverage', '0.5', '--storage-state', 's.json', '--wait-for', '#app']);
  assert.deepEqual(positional, ['http://x']);
  assert.deepEqual(opts.only, ['nav a', 'main button']);
  assert.equal(opts.max, 12);
  assert.equal(opts.cpu, 4);
  assert.equal(opts.interact, true);
  assert.equal(opts.minCoverage, 0.5);
  assert.equal(opts.storageState, 's.json');
  assert.equal(opts.waitFor, '#app');
});

test('unknown flags and invalid numbers are usage errors', () => {
  assert.throws(() => parseArgs(['x', '--bogus']), UsageError);
  assert.throws(() => parseArgs(['x', '--max', 'abc']), /must be a number/);
  assert.throws(() => parseArgs(['x', '--max', '0']), /at least 1/);
  assert.throws(() => parseArgs(['x', '--max', '2.5']), /integer/);
  assert.throws(() => parseArgs(['x', '--cpu', 'fast']), UsageError);
  assert.throws(() => parseArgs(['x', '--min-coverage', '1.5']), /between 0 and 1/);
  assert.throws(() => parseArgs(['x', '--out']), /needs a value/);
  assert.throws(() => parseArgs(['x', '--out', '--json']), /needs a value/);
  assert.throws(() => parseArgs(['x', '--json=1']), /takes no value/);
});

test('--interrupt without --click is a usage error', () => {
  assert.throws(() => parseArgs(['x', '--interrupt']), /needs --click/);
  assert.equal(parseArgs(['x', '--click', '#a', '--interrupt']).opts.interrupt, true);
});
