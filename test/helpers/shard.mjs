// Splits the slow browser tests over parallel CI jobs: MA_SHARD=<index>/<total> (1-based) keeps
// every test whose key falls into that shard. Without it everything runs.
import test from 'node:test';

const spec = /^(\d+)\/(\d+)$/.exec(process.env.MA_SHARD ?? '');
export const shard = spec ? { index: Number(spec[1]), total: Number(spec[2]) } : null;

const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// `position`: a stable number (the index in a list) for an even split; otherwise a hash of `key`.
export const inShard = (key, position) => !shard || ((position ?? hash(key)) % shard.total) + 1 === shard.index;

// node:test's `test`, skipped when the test belongs to another shard.
export const sharded = (name, ...rest) => {
  const fn = rest.pop();
  const options = rest[0] ?? {};
  // An explicit `skip` decides (the golden loop shards by position itself).
  return test(name, { ...options, skip: 'skip' in options ? options.skip : (inShard(name) ? false : 'other shard') }, fn);
};

// MA_SMOKE_ONLY (the macOS and Windows jobs): the tool runs, exits with the right code, presses within its contract and leaves nothing
// behind. Checks that need dense 60 Hz frames (exact goldens, a measured jump or layout) are exact-only and run on ubuntu.
export const SMOKE_ONLY = Boolean(process.env.MA_SMOKE_ONLY);
export const EXACT_ONLY_REASON = 'exact goldens need dense 60 Hz frames; macOS/Windows runners drop frames irregularly; covered by the ubuntu jobs with MOTION_REQUIRE_DENSE=1; the smoke checks run here';
export const exact = (name, ...rest) => {
  const fn = rest.pop();
  return test(name, { skip: SMOKE_ONLY ? EXACT_ONLY_REASON : (inShard(name) ? false : 'other shard') }, fn);
};
