import test from 'node:test';
import assert from 'node:assert/strict';
import { inconsistencies, judgeElement } from '../skills/motion-audit/scripts/lib/judge.mjs';
import { KINDS } from '../skills/motion-audit/scripts/lib/kinds.mjs';
import { finalize, validateConfig } from '../skills/motion-audit/scripts/lib/config.mjs';

const transition = (props, ms, easing = 'cubic-bezier(0.23, 1, 0.32, 1)') => ({ properties: props, durations: props.map(() => ms), easings: props.map(() => easing) });
const moment = (over = {}) => ({ changed: [], pixels: false, motion: [], ...over });
const element = (over = {}) => ({ label: 'button "Save"', kind: 'button', selected: false, transition: transition(['background-color'], 150), moments: {}, long: [], ...over });
const levels = (raw) => finalize(raw, validateConfig({})).findings.map((f) => `${f.level} ${f.kind}`);

test('a shadcn-style button (transition: all, no :active) has no errors in the default profile', () => {
  const el = element({ transition: transition(['all'], 150, 'cubic-bezier(0.4, 0, 0.2, 1)'), moments: { hover: moment({ changed: ['background-color'] }), press: moment(), focus: moment({ changed: ['box-shadow'] }) } });
  const out = levels(judgeElement(el));
  assert.ok(!out.some((l) => l.startsWith('error')), out.join(', '));
  assert.deepEqual(out.sort(), ['warning no-press-feedback', 'warning transition-all']);
});

test('a Tailwind-preflight link with no hover or press is a warning at most, and an input is never reported', () => {
  const link = element({ label: 'a "Docs"', kind: 'a', moments: { hover: moment(), press: moment(), focus: moment({ changed: ['outline-style'] }) } });
  assert.deepEqual(levels(judgeElement(link)), ['warning no-feedback']);
  const input = element({ label: 'input "Email"', kind: 'input', moments: { hover: moment(), focus: moment({ changed: ['box-shadow'] }) } });
  assert.deepEqual(levels(judgeElement(input)), []);
});

test('a button that ignores keyboard focus is an error', () => {
  const el = element({ moments: { hover: moment({ changed: ['background-color'] }), focus: moment() } });
  assert.ok(levels(judgeElement(el)).includes('error no-focus-feedback'));
});

test('a control revealed only on hover is reported for its focus state instead of as missing feedback', () => {
  const el = element({ moments: { focus: moment({ hiddenUntilHover: true }) } });
  assert.deepEqual(levels(judgeElement(el)), ['warning hover-only-control']);
});

test('instant layout changes are snaps, not layout-animated; an animated layout property is', () => {
  const instant = element({ transition: transition(['color'], 100), moments: { hover: moment({ changed: ['font-weight'] }) } });
  assert.deepEqual(levels(judgeElement(instant)), ['warning snaps']);
  const animated = element({ transition: transition(['width'], 200), moments: { press: moment({ changed: ['width'] }) } });
  assert.ok(levels(judgeElement(animated)).includes('error layout-animated'));
});

test('duration tokens exempt declared durations from the band and from inconsistency', () => {
  const slow = element({ transition: transition(['background-color'], 70), moments: { hover: moment({ changed: ['background-color'] }) } });
  assert.ok(judgeElement(slow).some((f) => f.kind === 'duration'));
  assert.ok(!judgeElement(slow, { tokens: { durations: [70] } }).some((f) => f.kind === 'duration'));
  const a = element({ label: 'a', transition: transition(['background-color'], 70), moments: { hover: moment({ changed: ['background-color'] }) } });
  const b = element({ label: 'b', transition: transition(['background-color'], 200), moments: { hover: moment({ changed: ['background-color'] }) } });
  assert.equal(inconsistencies([a, b]).length, 1);
  assert.equal(inconsistencies([a, b], { tokens: { durations: [70, 200] } }).length, 0);
});

test('every kind the judge can emit is in the registry', () => {
  const el = element({ moments: { hover: moment(), press: moment(), focus: moment() }, interrupt: [{ label: 'x', prop: 'ty' }], reduced: { moves: 'translate 10 px', residue: 'translate 4 px' } });
  for (const f of judgeElement(el)) assert.ok(KINDS[f.kind], f.kind);
});
