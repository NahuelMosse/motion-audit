import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KINDS } from '../skills/motion-audit/scripts/lib/kinds.mjs';
import { ROOT } from './helpers/cli.mjs';

const skill = readFileSync(join(ROOT, 'skills', 'motion-audit', 'SKILL.md'), 'utf8');

const tableRows = () => skill.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l)).map((l) => l.split('|').map((c) => c.trim()).filter(Boolean)).filter((r) => r.length === 4);

test('the kinds table of SKILL.md lists exactly the kinds in the registry with their default level and source', () => {
  const rows = tableRows();
  assert.deepEqual(rows.map((r) => r[0].replaceAll('`', '')).sort(), Object.keys(KINDS).sort());
  for (const [kind, , level, source] of rows.map((r) => [r[0].replaceAll('`', ''), r[1], r[2], r[3]])) {
    assert.equal(level.split(' ')[0], KINDS[kind].level, `${kind} level`);
    assert.equal(source, KINDS[kind].source, `${kind} source`);
  }
});

test('SKILL.md stays small, names no other skill, and uses the skill-dir substitution in commands', () => {
  const [, front] = /^---\n([\s\S]*?)\n---/.exec(skill);
  const description = /^description: (.*)$/m.exec(front)[1];
  assert.ok(description.length <= 620, `description is ${description.length} chars`);
  assert.ok(skill.split('\n').length < 500);
  assert.doesNotMatch(description, /review-animations|find-animation|apple-design|emilkowalski/);
  assert.match(front, /- Bash\(node \$\{CLAUDE_SKILL_DIR\}\/scripts\/\*\)/);
  assert.match(front, /- Bash\(node "\$\{CLAUDE_SKILL_DIR\}\/scripts\/\*"\)/);
  assert.doesNotMatch(skill, /<skill-dir>|\$env:CLAUDE_SKILL_DIR/);
});
