import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reducedMoves, reducedResidue, transformState } from '../skills/motion-audit/scripts/lib/reduced.mjs';
import { baselineIds, compareReports, readReport } from '../skills/motion-audit/scripts/lib/compare.mjs';

const T = (transform = 'none', extra = {}) => ({ transform, translate: 'none', scale: 'none', rotate: 'none', ...extra });

test('a press scale of 0.97 under reduced motion is gentle; a translate, a rotation or a big scale is not', () => {
  assert.equal(reducedMoves(T(), T('matrix(0.97, 0, 0, 0.97, 0, 0)')), '');
  assert.match(reducedMoves(T(), T('matrix(1, 0, 0, 1, 0, -12)')), /translate 12/);
  assert.match(reducedMoves(T(), T('matrix(0.8, 0, 0, 0.8, 0, 0)')), /scale/);
  assert.match(reducedMoves(T(), T('none', { rotate: '45deg' })), /rotate 45/);
  assert.match(reducedMoves(T(), T('none', { translate: '10px 0px' })), /translate 10/);
});

test('any transform left after release is residue', () => {
  assert.equal(reducedResidue(T(), T()), '');
  assert.match(reducedResidue(T(), T('matrix(1, 0, 0, 1, 0, 10)')), /translate 10/);
  assert.equal(transformState(T('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 5,6,0,1)')).tx, 5);
});

const report = (findings, elements = []) => ({ schemaVersion: 1, findings, elements, baselined: [] });
const hoverEl = (label, ms, shape) => ({ label, transition: { properties: ['all'], durations: [ms], easings: ['ease'] }, moments: { hover: { changed: ['opacity'], pixels: true, motion: [{ label, moves: [{ prop: 'opacity', durationMs: ms, shape, overshootPct: 0 }] }] } } });

test('compare lists controls whose measured duration or curve differs and the findings that are new or gone', () => {
  const ref = report([{ id: 'a', kind: 'duration', element: 'x' }, { id: 'b', kind: 'jump', element: 'y' }], [hoverEl('button "Save"', 200, 'ease-out'), hoverEl('a "Docs"', 150, 'ease-out')]);
  const mine = report([{ id: 'b', kind: 'jump', element: 'y' }, { id: 'c', kind: 'snaps', element: 'z' }], [hoverEl('button "Save"', 400, 'linear'), hoverEl('a "Docs"', 150, 'ease-out')]);
  const c = compareReports(ref, mine);
  assert.equal(c.total, 2);
  assert.equal(c.differ, 1);
  assert.match(c.lines[0], /duration \+200 ms, curve ease-out -> linear/);
  assert.deepEqual(c.added.map((f) => f.id), ['c']);
  assert.deepEqual(c.gone.map((f) => f.id), ['a']);
});

test('readReport rejects other schema versions and baselineIds includes earlier baselined findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ma-report-'));
  writeFileSync(join(dir, 'old.json'), JSON.stringify({ schemaVersion: 2, findings: [] }));
  assert.throws(() => readReport(join(dir, 'old.json')), /schemaVersion/);
  assert.throws(() => readReport(join(dir, 'missing.json')), /cannot read/);
  const ids = baselineIds({ findings: [{ id: 'a' }], baselined: [{ id: 'b' }] });
  assert.deepEqual([...ids].sort(), ['a', 'b']);
});
