import test from 'node:test';
import assert from 'node:assert/strict';
import { tagTarget } from '../.github/scripts/release-plan.mjs';

const sha = 'a'.repeat(40);
const gitHead = 'b'.repeat(40);

test('a version this run publishes is tagged with this run\'s commit', () => {
  assert.deepEqual(tagTarget({ publishedHere: true, sha, gitHead: '', commitExists: false }), { sha });
});

test('a version published by hand is tagged with the commit npm recorded, never the current one', () => {
  assert.deepEqual(tagTarget({ publishedHere: false, sha, gitHead, commitExists: true }), { sha: gitHead });
});

test('a version published by hand without a gitHead, or with one this repository lacks, is not tagged and says why', () => {
  const without = tagTarget({ publishedHere: false, sha, gitHead: '', commitExists: false });
  assert.equal(without.sha, undefined);
  assert.match(without.warning, /no gitHead/);
  const unknown = tagTarget({ publishedHere: false, sha, gitHead, commitExists: false });
  assert.equal(unknown.sha, undefined);
  assert.match(unknown.warning, new RegExp(`${gitHead}.*not in this repository`));
});
