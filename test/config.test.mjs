import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, finalize, fingerprint, loadConfig, validateConfig } from '../skills/motion-audit/scripts/lib/config.mjs';

const raw = (over = {}) => ({ kind: 'duration', element: 'button "Save"', detail: 'hover: 450 ms', key: 'hover background-color', ...over });

test('an ignore entry without a reason is a config error', () => {
  assert.throws(() => validateConfig({ ignore: [{ kind: 'duration' }] }), ConfigError);
  assert.throws(() => validateConfig({ ignore: [{ kind: 'duration', reason: '  ' }] }), /reason/);
});

test('unknown keys, kinds, levels and malformed bands are rejected', () => {
  assert.throws(() => validateConfig({ colour: 1 }), /unknown key/);
  assert.throws(() => validateConfig({ severity: { nope: 'error' } }), /unknown kind/);
  assert.throws(() => validateConfig({ severity: { duration: 'fatal' } }), /not one of/);
  assert.throws(() => validateConfig({ bands: { hover: [300, 80] } }), /\[min, max\]/);
  assert.throws(() => validateConfig({ bands: { swipe: [1, 2] } }), /unknown gesture/);
});

test('bands override the defaults per gesture and keep the others', () => {
  const c = validateConfig({ bands: { hover: [50, 400] } });
  assert.deepEqual(c.bands.hover, [50, 400]);
  assert.deepEqual(c.bands.press, [50, 200]);
});

test('the default severity of a kind applies, and the config can change or silence it', () => {
  const base = validateConfig({});
  assert.equal(finalize([raw()], base).findings[0].level, 'warning');
  assert.equal(finalize([raw()], validateConfig({ severity: { duration: 'error' } })).findings[0].level, 'error');
  assert.equal(finalize([raw()], validateConfig({ severity: { duration: 'off' } })).findings.length, 0);
});

test('an ignore rule removes the finding, keeps its reason, and matches by kind and element glob or by id', () => {
  const byGlob = validateConfig({ ignore: [{ kind: 'duration', element: 'button "S*"', reason: 'brand motion' }] });
  const a = finalize([raw()], byGlob);
  assert.equal(a.findings.length, 0);
  assert.equal(a.suppressed[0].reason, 'brand motion');
  const id = fingerprint(raw());
  const byId = validateConfig({ ignore: [{ id, reason: 'tracked in TICKET-1' }] });
  assert.equal(finalize([raw()], byId).suppressed.length, 1);
  assert.equal(finalize([raw({ element: 'button "Other"' })], byId).findings.length, 1);
});

test('a fingerprint survives changed measurements but not a different element or moment', () => {
  assert.equal(fingerprint(raw()), fingerprint(raw({ detail: 'hover: 500 ms' })));
  assert.notEqual(fingerprint(raw()), fingerprint(raw({ element: 'button "Cancel"' })));
  assert.notEqual(fingerprint(raw()), fingerprint(raw({ key: 'press width' })));
});

test('long frames on a development build are warnings', () => {
  const f = finalize([{ kind: 'long-frame', element: 'a', detail: 'x', key: 'hover' }], validateConfig({}), { devServer: true });
  assert.equal(f.findings[0].level, 'warning');
});

test('loadConfig reads the default file from the working directory and fails on a missing explicit file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ma-config-'));
  assert.deepEqual(loadConfig(undefined, dir).ignore, []);
  writeFileSync(join(dir, 'motion-audit.config.json'), JSON.stringify({ tokens: { durations: [70, 120] } }));
  assert.deepEqual(loadConfig(undefined, dir).tokens.durations, [70, 120]);
  assert.throws(() => loadConfig('missing.json', dir), /not found/);
  writeFileSync(join(dir, 'bad.json'), '{oops');
  assert.throws(() => loadConfig('bad.json', dir), /invalid JSON/);
});
