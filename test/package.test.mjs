import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, removeScratch, runCli } from './helpers/cli.mjs';
import { npm } from './helpers/npm.mjs';

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('the Playwright dev dependency is a caret range and the lockfile is past 1.43.x, whose browser dependencies miss current Ubuntu', () => {
  assert.match(pkg.devDependencies.playwright, /^\^1\.\d+/);
  const lock = JSON.parse(read('package-lock.json'));
  const [major, minor] = lock.packages['node_modules/playwright'].version.split('.').map(Number);
  assert.ok(major > 1 || minor > 43, `locked playwright ${lock.packages['node_modules/playwright'].version}`);
});

test('the Playwright peer range starts at the minimum the code enforces (1.59: addInitScript returns a Disposable)', async () => {
  const { MIN_PLAYWRIGHT } = await import('../skills/motion-audit/scripts/lib/constants.mjs');
  assert.equal(pkg.peerDependencies.playwright, `>=${MIN_PLAYWRIGHT.join('.')}`);
  assert.deepEqual(MIN_PLAYWRIGHT, [1, 59]);
});

test('every test file is in exactly one of test:unit and test:browser, so no CI job silently drops it', () => {
  const files = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => `test/${f}`).sort();
  const listed = (script) => pkg.scripts[script].split(' ').filter((x) => x.endsWith('.test.mjs')).sort();
  assert.deepEqual([...listed('test:unit'), ...listed('test:browser')].sort(), files);
});

test('engines require a Node that can require() ES modules without a flag', () => {
  assert.equal(pkg.engines.node, '>=22.12');
});

test('the workflow uses current checkout and setup-node majors', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  assert.ok(!/actions\/(checkout|setup-node)@v[1-4]\b/.test(ci));
  assert.match(ci, /actions\/checkout@v5/);
  assert.match(ci, /actions\/setup-node@v5/);
});

// A stray file at the root (a mis-quoted shell command can create one) must not be committed.
test('the tracked files at the repository root are all on the list of expected ones', () => {
  let tracked;
  try { tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return; } // not a git checkout
  const root = tracked.filter((f) => !f.includes('/')).sort();
  const allowed = ['.gitattributes', '.gitignore', 'CHANGELOG.md', 'LICENSE', 'NOTICES.md', 'README.md', 'SECURITY.md', 'package-lock.json', 'package.json'];
  assert.deepEqual(root.filter((f) => !allowed.includes(f)), [], 'a file at the root that is not on the list');
});

const json = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const SKILL = join(ROOT, 'skills', 'motion-audit');
const made = [];
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), 'ma-pkg-')); made.push(dir); return dir; };
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); removeScratch(); });

test('package.json is publishable, points inside the skill directory and matches the plugin manifest', () => {
  assert.equal(pkg.name, 'motion-audit');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.version, json('.claude-plugin', 'plugin.json').version);
  assert.deepEqual(pkg.bin, { 'motion-audit': 'skills/motion-audit/scripts/motion-audit.mjs' });
  assert.deepEqual(pkg.exports, { '.': './skills/motion-audit/scripts/lib/index.mjs', './package.json': './package.json' });
  assert.deepEqual(pkg.publishConfig, { access: 'public', provenance: true });
  assert.equal(pkg.dependencies, undefined, 'zero runtime dependencies');
  assert.match(pkg.repository.url, /^git\+https:\/\/github\.com\/NahuelMosse\/motion-audit\.git$/);
  assert.ok(existsSync(join(ROOT, pkg.bin['motion-audit'])) && existsSync(join(ROOT, pkg.exports['.'])));
});

test('the tarball holds exactly the expected files, and no fixture', async () => {
  const dest = tempDir();
  const { stdout } = await npm(['pack', '--json', '--ignore-scripts', '--pack-destination', dest], ROOT);
  const [packed] = JSON.parse(stdout.slice(stdout.indexOf('[')));
  assert.ok(existsSync(join(dest, packed.filename)), `npm reported ${packed.filename}`);
  const files = packed.files.map((f) => f.path).sort();
  assert.deepEqual(files, json('test', 'expected-package-files.json'));
  assert.ok(!files.some((f) => f.includes('fixtures') || f.startsWith('test/')));
});

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []);

test('the skill directory alone is self-contained: it runs and every import stays inside it', async () => {
  const parent = tempDir();
  const copy = join(parent, 'motion-audit');
  mkdirSync(copy);
  cpSync(SKILL, copy, { recursive: true });
  const help = await runCli(['--help'], { cli: join(copy, 'scripts', 'motion-audit.mjs'), cwd: tempDir() });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^motion-audit <url\|file> \[options\]/);

  const files = sourceFiles(copy);
  assert.ok(files.length > 10);
  let checked = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"\n]*?\bfrom\s+(['"])([^'"\n]+)\1|^\s*import\s+(['"])([^'"\n]+)\3|\bimport\(\s*(['"])([^'"\n]+)\5/gm)) {
      const spec = m[2] ?? m[4] ?? m[6];
      checked++;
      if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('.'), `${relative(copy, file)} imports ${spec}: only node: builtins and relative files are allowed`);
      const target = resolve(dirname(file), spec);
      assert.ok(!relative(copy, target).startsWith('..'), `${relative(copy, file)} imports ${spec}, outside the skill directory`);
      assert.ok(existsSync(target), `${relative(copy, file)} imports ${spec}, which does not exist in the skill directory`);
    }
  }
  assert.ok(checked > 20, `found only ${checked} imports: the pattern no longer matches the sources`);
});
