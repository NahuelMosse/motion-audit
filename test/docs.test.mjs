import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { USAGE } from '../skills/motion-audit/scripts/lib/args.mjs';
import { ROOT } from './helpers/cli.mjs';

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const skill = read('skills', 'motion-audit', 'SKILL.md');
const readme = read('README.md');
const [, front] = /^---\n([\s\S]*?)\n---/.exec(skill);

const commandLines = (text) => text.split('\n').filter((l) => /^\s*(`?node|`?npx|Or the CLI: `npx) /.test(l) && /--min-coverage \d/.test(l));

test('every example that sets --min-coverage also raises --max, since coverage counts the controls beyond --max', () => {
  const lines = [...commandLines(skill), ...commandLines(readme)];
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.match(l, /--max \d+/, l);
});

test('the skill description starts with when to use it and stays short', () => {
  const description = /^description: (.*)$/m.exec(front)[1];
  assert.match(description, /^Use when /);
  assert.ok(description.length <= 480, `${description.length} chars`);
});

test('every command in the skill is allowed by allowed-tools in either shell', () => {
  assert.doesNotMatch(skill, /```powershell/i);
  const allowed = [...front.matchAll(/- (\w+)\((.*)\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(allowed)], ['Bash']);
  const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap((m) => m[1].split('\n').filter((l) => l.trim()));
  for (const l of blocks.filter((x) => /^node /.test(x))) assert.match(l, /^node "\$\{CLAUDE_SKILL_DIR\}\/scripts\/motion-audit\.mjs" /, l);
  assert.match(skill, /same command works in[^.]*PowerShell/i);
});

test('the docs say what the default mode and --click do to the page', () => {
  for (const [name, text] of [['README', readme], ['SKILL.md', skill]]) {
    assert.match(text, /hover/i, name);
    assert.match(text, /mouseenter|hover-bound|bound to hover/i, name);
    assert.match(text, /IntersectionObserver|scroll-bound/i, name);
    assert.match(text, /beforeunload/, name);
    assert.match(text, /throwaway|disposable/i, name);
  }
  assert.match(skill, /twice[\s\S]*four times|2 .*4 /i);
  assert.match(readme, /twice|two clicks|2 clicks/i);
});

test('--allow-redirect is documented and in the usage text', () => {
  assert.match(USAGE, /--allow-redirect/);
  assert.match(readme, /--allow-redirect/);
  assert.match(skill, /--allow-redirect/);
});

test('long frames are documented as over 50 ms, with or without an attributed script', () => {
  assert.doesNotMatch(skill + readme, /150 ms/);
  assert.match(skill, /over 50 ms/);
});
