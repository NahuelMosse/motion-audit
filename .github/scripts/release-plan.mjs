// Decides what the release workflow does and writes it to $GITHUB_OUTPUT: version, dist-tag, mode, on-npm and tag-sha.
//   mode=pack     a ref that is neither main nor a tag: only shows what would be published
//   mode=none     nothing to publish: the package is not on npm yet (its first version is published by hand) or this
//                 version already is
//   mode=publish  main or a tag holds a version npm does not have
//   tag-sha       the commit to tag v<version> with, empty for none: this run's commit when it publishes, otherwise the
//                 commit npm recorded for the version (a hand publish can come from any commit)
// It needs no installed dependencies, so the publishing job can run it without `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

// Which commit gets the tag. `publishedHere`: this run publishes it, so its own commit is right. Otherwise the version
// was published elsewhere and only the gitHead npm recorded names its commit; without one that is in this repository,
// tagging the current commit would be a guess. A hand publish can come from a dirty tree, so that commit is tagged only when
// packing it gives the tarball npm has (`packedShasum`, from `npm pack --dry-run --json` at that commit, against
// `publishedShasum`, npm's `dist.shasum`).
export function tagTarget({ publishedHere, sha, gitHead, commitExists, packedShasum, publishedShasum }) {
  if (publishedHere) return { sha };
  if (!gitHead) return { warning: 'npm records no gitHead for this version: not tagging it, tag the commit it was published from by hand' };
  if (!commitExists) return { warning: `npm records gitHead ${gitHead} for this version, which is not in this repository: not tagging it` };
  if (!packedShasum || !publishedShasum) return { warning: `could not compare the tarball of ${gitHead} with the one on npm (packed ${packedShasum ?? 'nothing'}, npm ${publishedShasum ?? 'nothing'}): not tagging it` };
  if (packedShasum !== publishedShasum) return { warning: `packing ${gitHead} gives ${packedShasum} but npm has ${publishedShasum} for this version: it was published from a tree that differs from that commit (a dirty tree?), not tagging it` };
  return { sha: gitHead };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

function main() {
  const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const { name, version } = json('package.json');
  const plugin = json('.claude-plugin/plugin.json').version;
  const { GITHUB_REF_TYPE: refType, GITHUB_REF_NAME: refName, GITHUB_OUTPUT: outputFile } = process.env;

  if (version !== plugin) fail(`package.json (${version}) and plugin.json (${plugin}) differ`);
  if (refType === 'tag' && refName !== `v${version}`) fail(`tag ${refName} is not v${version}`);
  console.log(`package.json ${version}, plugin.json ${plugin}`);

  const output = {
    version,
    // A prerelease (1.3.0-rc.0) goes to the `next` dist-tag: `latest` only ever points at a stable version.
    'dist-tag': version.includes('-') ? 'next' : 'latest',
    mode: 'pack',
    'on-npm': 'false',
    'tag-sha': '',
  };
  if (refType === 'tag' || refName === 'main') {
    if (view(name, 'name') === null) {
      console.log(`::notice::${name} is not on npm yet: the first version is published by hand (trusted publishing needs an existing package)`);
      output.mode = 'none';
    } else if (view(`${name}@${version}`, 'version') === version) {
      console.log(`${name}@${version} is already on npm: nothing to publish`);
      output.mode = 'none';
      output['on-npm'] = 'true';
    } else {
      output.mode = 'publish';
    }
    // A tag push already has its tag. Otherwise tag the version unless the remote has the tag.
    if (refType !== 'tag' && (output.mode === 'publish' || output['on-npm'] === 'true')) {
      const tag = `v${version}`;
      if (tagExists(tag)) console.log(`${tag} already exists`);
      else {
        const publishedHere = output.mode === 'publish';
        const gitHead = publishedHere ? '' : view(`${name}@${version}`, 'gitHead') ?? '';
        const commitExists = Boolean(gitHead) && commitInRepo(gitHead);
        const target = tagTarget({
          publishedHere, sha: process.env.GITHUB_SHA, gitHead, commitExists,
          packedShasum: commitExists ? packShasumAt(gitHead) : null,
          publishedShasum: commitExists ? view(`${name}@${version}`, 'dist.shasum') || null : null,
        });
        if (target.warning) console.log(`::warning::${target.warning}`);
        else output['tag-sha'] = target.sha;
      }
    }
  }
  for (const [key, value] of Object.entries(output)) {
    console.log(`${key}=${value}`);
    if (outputFile) appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

// `npm view <spec> <field>`: the value, '' when the version does not exist, null when the package does not exist (E404).
// Any other failure (registry down) must not pass as "not published".
function view(spec, field) {
  try {
    return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['view', spec, field], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (String(error.stderr).includes('E404')) return null;
    throw error;
  }
}

function tagExists(tag) {
  return git(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`]) !== null;
}

// The commit is in the checkout, or can be fetched from the remote.
function commitInRepo(sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) return false;
  if (git(['cat-file', '-e', `${sha}^{commit}`]) !== null) return true;
  git(['fetch', '--no-tags', 'origin', sha]);
  return git(['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

// The shasum `npm pack --dry-run --json` reports for the tree at `sha` (no scripts run), null when it cannot be packed.
function packShasumAt(sha) {
  const dir = mkdtempSync(join(tmpdir(), 'release-pack-'));
  try {
    if (git(['worktree', 'add', '--detach', dir, sha]) === null) return null;
    const out = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out)[0]?.shasum ?? null;
  } catch {
    return null;
  } finally {
    git(['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
  }
}

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; }
}

function fail(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}
