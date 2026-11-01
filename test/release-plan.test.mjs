import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PACK_ARGS, PlanError, planRelease, tagTarget } from '../.github/scripts/release-plan.mjs';

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

// The plan, decided from injected npm, git and pack: what each ref and registry state leads to.
const NAME = 'motion-audit';
const VERSION = '1.2.3';
const plan = ({ ref = 'main', refType = 'branch', npm = {}, packed = shasum, tagged = false, inRepo = true, pluginVersion = VERSION } = {}) => {
  const calls = { pack: [], view: [] };
  const registry = { name: NAME, version: VERSION, gitHead, 'dist.shasum': shasum, ...npm };
  const view = (spec, field) => {
    calls.view.push([spec, field]);
    if (registry.name === null) return null;
    if (spec === NAME) return field === 'name' ? NAME : null;
    return registry[field] ?? '';
  };
  const result = planRelease({
    env: { GITHUB_REF_TYPE: refType, GITHUB_REF_NAME: ref, GITHUB_SHA: sha },
    name: NAME, version: VERSION, pluginVersion, view,
    pack: (at) => { calls.pack.push(at); return packed; },
    tagExists: () => tagged,
    commitInRepo: () => inRepo,
  });
  return { ...result, calls };
};
const warnings = (result) => result.log.filter((line) => line.startsWith('::warning::'));

test('main with a version npm does not have publishes it and tags the run\'s own commit', () => {
  const { output } = plan({ npm: { version: '' } });
  assert.deepEqual([output.mode, output['tag-sha'], output['dist-tag']], ['publish', sha, 'latest']);
});

test('a package that is not on npm yet, or any ref other than main or a tag, publishes nothing and tags nothing', () => {
  assert.deepEqual([plan({ npm: { name: null } }).output.mode, plan({ npm: { name: null } }).output['tag-sha']], ['none', '']);
  // a branch only shows what would be published, whatever npm has: no publish, no tag
  for (const npm of [{ version: '' }, {}]) {
    const { output, calls } = plan({ ref: 'feature', npm });
    assert.deepEqual([output.mode, output['tag-sha']], ['pack', '']);
    assert.deepEqual(calls.view, [], 'a branch asks npm nothing');
  }
});

test('a version published by hand is tagged at its gitHead when that commit packs to the tarball npm has', () => {
  const result = plan({});
  assert.deepEqual([result.output.mode, result.output['on-npm'], result.output['tag-sha']], ['none', 'true', gitHead]);
  assert.deepEqual(result.calls.pack, [gitHead], 'the tarball of that commit is packed');
});

test('the tarball of the commit comes from pack, never from npm: a differing one is not tagged, with both shasums in the warning', () => {
  const packed = 'e'.repeat(40);
  const result = plan({ packed });
  assert.equal(result.output['tag-sha'], '');
  assert.equal(warnings(result).length, 1);
  assert.match(warnings(result)[0], new RegExp(`${packed}.*${shasum}`));
  // a registry that answers nothing for dist.shasum, or a pack that fails: not tagged either
  assert.equal(plan({ npm: { 'dist.shasum': '' } }).output['tag-sha'], '');
  assert.equal(plan({ packed: null }).output['tag-sha'], '');
});

test('nothing is tagged when the tag exists, when npm records no gitHead, when the commit is not in the repository, or on a tag push', () => {
  assert.equal(plan({ tagged: true }).output['tag-sha'], '');
  assert.equal(plan({ npm: { gitHead: '' } }).output['tag-sha'], '');
  assert.equal(plan({ inRepo: false }).output['tag-sha'], '');
  const onTag = plan({ refType: 'tag', ref: `v${VERSION}`, npm: { version: '' } });
  assert.deepEqual([onTag.output.mode, onTag.output['tag-sha']], ['publish', '']);
});

test('the plan refuses a package.json and plugin.json that differ, and a tag that is not the version', () => {
  assert.throws(() => plan({ pluginVersion: '9.9.9' }), PlanError);
  assert.throws(() => plan({ refType: 'tag', ref: 'v0.0.1' }), PlanError);
});

test('a prerelease goes to the next dist-tag', () => {
  const view = (spec, field) => (spec === NAME ? NAME : '');
  const { output } = planRelease({ env: { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main', GITHUB_SHA: sha }, name: NAME, version: '1.3.0-rc.0', pluginVersion: '1.3.0-rc.0', view, pack: () => null, tagExists: () => false, commitInRepo: () => false });
  assert.equal(output['dist-tag'], 'next');
});

test('every npm pack of the release runs no scripts', () => {
  assert.ok(PACK_ARGS.includes('--ignore-scripts') && PACK_ARGS.includes('--dry-run') && PACK_ARGS.includes('--json'));
});

// The workflow: the test job makes the plan and runs the tests whatever the mode; the privileged job needs it, reads only its outputs
// and does exactly what each step's condition says.
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const jobs = workflow.slice(workflow.indexOf('\njobs:'));
const testJob = jobs.slice(jobs.indexOf('\n  test:'), jobs.indexOf('\n  publish:'));
const publishJob = jobs.slice(jobs.indexOf('\n  publish:'));
const stepsOf = (job) => job.slice(job.indexOf('steps:')).split('\n      - ').slice(1);
const stepWith = (job, text) => {
  const found = stepsOf(job).filter((step) => step.includes(text));
  assert.equal(found.length, 1, `one step with ${text}`);
  return found[0];
};
const NOT_NONE = "if: steps.plan.outputs.mode != 'none'";

test('the release test job exposes the plan as outputs, has no condition of its own and runs install, browser and tests unless the mode is none', () => {
  for (const name of ['mode', 'version', 'dist-tag', 'tag-sha']) assert.match(testJob, new RegExp(`\\n      ${name}: \\$\\{\\{ steps\\.plan\\.outputs\\.${name} \\}\\}`), `test exposes ${name}`);
  const header = testJob.slice(0, testJob.indexOf('steps:'));
  assert.doesNotMatch(header, /\n    if:/);
  assert.doesNotMatch(header, /\n    needs:/);
  assert.match(stepWith(testJob, 'release-plan.mjs'), /id: plan/);
  assert.ok(!stepWith(testJob, 'release-plan.mjs').includes('if:'), 'the plan always runs');
  for (const text of ['npm ci', 'playwright install', 'npm run test:unit']) assert.ok(stepWith(testJob, text).includes(NOT_NONE), `${text} runs unless the mode is none`);
  assert.ok(stepWith(testJob, 'npm run test:unit').includes('test/package-install.test.mjs'));
  assert.ok(!/mode == 'pack'|mode == 'publish'/.test(testJob), 'the tests are not limited to one mode');
});

test('the release publish job needs the test job, reads only its outputs, and each step runs for exactly its mode', () => {
  assert.match(publishJob, /\n    needs: test\n/);
  assert.match(publishJob, /\n    if: needs\.test\.outputs\.mode != 'none' \|\| needs\.test\.outputs\.tag-sha != ''\n/);
  assert.doesNotMatch(publishJob, /release-plan\.mjs/, 'publish does not recompute the plan');
  assert.doesNotMatch(publishJob, /steps\.plan\./, 'publish reads no plan of its own');
  const publish = stepWith(publishJob, 'npm publish');
  assert.ok(publish.includes("if: needs.test.outputs.mode == 'publish'") && publish.includes('needs.test.outputs.dist-tag'));
  const pack = stepWith(publishJob, 'npm pack');
  assert.ok(pack.includes("if: needs.test.outputs.mode == 'pack'"));
  const upgrade = stepWith(publishJob, 'npm install --global npm@11.21.1');
  assert.ok(upgrade.includes("if: needs.test.outputs.mode == 'publish'"), 'the npm version is pinned, not the one bundled with Node');
  // the tag step depends on the plan's tag-sha only: a hand-published version is tagged without a publish of this run
  const tag = stepWith(publishJob, 'git tag');
  assert.ok(tag.includes("if: needs.test.outputs.tag-sha != ''") && !/mode/.test(tag.slice(0, tag.indexOf('run:'))));
  assert.ok(tag.includes('needs.test.outputs.version') && tag.includes('needs.test.outputs.tag-sha'));
});

test('no npm pack of the release workflow runs scripts', () => {
  const packs = workflow.split('\n').filter((line) => /npm pack/.test(line));
  assert.ok(packs.length > 0);
  for (const line of packs) assert.match(line, /--ignore-scripts/, line);
});
