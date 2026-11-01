import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tagTarget } from '../.github/scripts/release-plan.mjs';

const sha = 'a'.repeat(40);
const gitHead = 'b'.repeat(40);
const shasum = 'c'.repeat(40);

test('a version this run publishes is tagged with this run\'s commit', () => {
  assert.deepEqual(tagTarget({ publishedHere: true, sha, gitHead: '', commitExists: false }), { sha });
});

test('a version published by hand is tagged with the commit npm recorded, never the current one', () => {
  assert.deepEqual(tagTarget({ publishedHere: false, sha, gitHead, commitExists: true, packedShasum: shasum, publishedShasum: shasum }), { sha: gitHead });
});

test('a version published by hand without a gitHead, or with one this repository lacks, is not tagged and says why', () => {
  const without = tagTarget({ publishedHere: false, sha, gitHead: '', commitExists: false });
  assert.equal(without.sha, undefined);
  assert.match(without.warning, /no gitHead/);
  const unknown = tagTarget({ publishedHere: false, sha, gitHead, commitExists: false });
  assert.equal(unknown.sha, undefined);
  assert.match(unknown.warning, new RegExp(`${gitHead}.*not in this repository`));
});

test('a hand-published version is tagged only if its commit packs to the tarball npm has', () => {
  const base = { publishedHere: false, sha, gitHead, commitExists: true };
  // the tree it was published from differed (a dirty tree): do not tag, and say so
  const dirty = tagTarget({ ...base, packedShasum: 'd'.repeat(40), publishedShasum: shasum });
  assert.equal(dirty.sha, undefined);
  assert.match(dirty.warning, /differs from that commit/);
  // the comparison could not be made: do not guess
  for (const missing of [{ packedShasum: null, publishedShasum: shasum }, { packedShasum: shasum, publishedShasum: null }, {}]) {
    const result = tagTarget({ ...base, ...missing });
    assert.equal(result.sha, undefined);
    assert.match(result.warning, /could not compare/);
  }
  // a version this run publishes needs no comparison
  assert.deepEqual(tagTarget({ publishedHere: true, sha, gitHead: '', commitExists: false }), { sha });
});

// (e) the publishing job reads the plan the test job made: it cannot publish what the tests did not cover.
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const jobs = workflow.slice(workflow.indexOf('\njobs:'));
const testJob = jobs.slice(jobs.indexOf('\n  test:'), jobs.indexOf('\n  publish:'));
const publishJob = jobs.slice(jobs.indexOf('\n  publish:'));

test('the release test job exposes the plan as outputs and runs whatever the mode', () => {
  for (const name of ['mode', 'version', 'dist-tag', 'tag-sha']) assert.match(testJob, new RegExp(`\\n      ${name}: \\$\\{\\{ steps\\.plan\\.outputs\\.${name} \\}\\}`), `test exposes ${name}`);
  // the plan step runs in test; nothing in the job's own `if` skips it for mode none
  assert.doesNotMatch(testJob.slice(0, testJob.indexOf('steps:')), /\n    if:/);
});

test('the release publish job reads only the test job\'s plan, and is skipped when there is nothing to publish or tag', () => {
  assert.doesNotMatch(publishJob, /release-plan\.mjs/, 'publish does not recompute the plan');
  assert.doesNotMatch(publishJob, /steps\.plan\./, 'publish reads no plan of its own');
  assert.match(publishJob, /needs\.test\.outputs\.mode/);
  assert.match(publishJob, /\n    if: needs\.test\.outputs\.mode != 'none' \|\| needs\.test\.outputs\.tag-sha != ''/);
  for (const name of ['version', 'dist-tag', 'tag-sha']) assert.match(publishJob, new RegExp(`needs\\.test\\.outputs\\.${name}`));
  assert.match(publishJob, /npm install --global npm@11\.21\.1/, 'the npm version is pinned, not the one bundled with Node');
});
