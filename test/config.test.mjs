import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, finalize, fingerprint, loadConfig, validateConfig } from '../skills/motion-audit/scripts/lib/config.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'ma-config-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const raw = (over = {}) => ({ kind: 'duration', element: 'button "Save"', detail: 'hover: 450 ms', key: 'hover background-color', ...over });

test('an ignore entry without a reason is a config error', () => {
  assert.throws(() => validateConfig({ ignore: [{ kind: 'duration', element: 'a' }] }), ConfigError);
  assert.throws(() => validateConfig({ ignore: [{ kind: 'duration', element: 'a', reason: '  ' }] }), /reason/);
});

test('ignore ids must be a known kind plus a hash, never a wildcard, and a kind rule must name an element', () => {
  assert.throws(() => validateConfig({ ignore: [{ id: '*', reason: 'x' }] }), /finding id/);
  assert.throws(() => validateConfig({ ignore: [{ id: 'duration:*', reason: 'x' }] }), /finding id/);
  assert.throws(() => validateConfig({ ignore: [{ id: 'bogus:0123456789', reason: 'x' }] }), /finding id/);
  assert.throws(() => validateConfig({ ignore: [{ id: '0123456789', reason: 'x' }] }), /finding id/);
  assert.throws(() => validateConfig({ ignore: [{ kind: 'duration', reason: 'x' }] }), /element/);
  assert.throws(() => validateConfig({ ignore: [{ kind: 'duration', element: '*', reason: 'x' }] }), /bare wildcard/);
  assert.doesNotThrow(() => validateConfig({ ignore: [{ id: 'duration:0123456789', reason: 'x' }] }));
});

test('settings that loosen the audit (bands, tokens, a lowered severity) need a reason; raising a severity does not', () => {
  assert.throws(() => validateConfig({ bands: { hover: [60, 300] } }), /bands needs/);
  assert.throws(() => validateConfig({ tokens: { durations: [70] } }), /tokens needs/);
  assert.throws(() => validateConfig({ severity: { duration: 'off' } }), /lowering/);
  assert.throws(() => validateConfig({ severity: { 'no-feedback': 'info' } }), /lowering/);
  assert.throws(() => validateConfig({ severity: { 'no-feedback': { level: 'off' } } }), /lowering/);
  assert.doesNotThrow(() => validateConfig({ severity: { duration: 'error' } }));
  assert.doesNotThrow(() => validateConfig({ severity: { duration: { level: 'off', reason: 'brand tokens' } } }));
  assert.doesNotThrow(() => validateConfig({ bands: { reason: 'Carbon micro-interactions', hover: [60, 300] }, tokens: { reason: 'design tokens', durations: [70] } }));
});

test('unknown keys, kinds, levels and malformed bands are rejected', () => {
  assert.throws(() => validateConfig({ colour: 1 }), /unknown key/);
  assert.throws(() => validateConfig({ severity: { nope: 'error' } }), /unknown kind/);
  assert.throws(() => validateConfig({ severity: { duration: 'fatal' } }), /level must be one of/);
  assert.throws(() => validateConfig({ bands: { reason: 'r', hover: [300, 80] } }), /\[min, max\]/);
  assert.throws(() => validateConfig({ bands: { reason: 'r', swipe: [1, 2] } }), /unknown gesture/);
});

test('bands override the defaults per gesture and keep the others', () => {
  const c = validateConfig({ bands: { reason: 'r', hover: [50, 400] } });
  assert.deepEqual(c.bands.hover, [50, 400]);
  assert.deepEqual(c.bands.press, [50, 200]);
});

test('the default severity of a kind applies, and the config can raise or (with a reason) silence it', () => {
  assert.equal(finalize([raw()], validateConfig({})).findings[0].level, 'warning');
  assert.equal(finalize([raw()], validateConfig({ severity: { duration: 'error' } })).findings[0].level, 'error');
  assert.equal(finalize([raw()], validateConfig({ severity: { duration: { level: 'off', reason: 'tokens' } } })).findings.length, 0);
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

test('a fingerprint starts with its kind and survives changed measurements but not a different element or moment', () => {
  assert.match(fingerprint(raw()), /^duration:[0-9a-f]{10}$/);
  assert.equal(fingerprint(raw()), fingerprint(raw({ detail: 'hover: 500 ms' })));
  assert.notEqual(fingerprint(raw()), fingerprint(raw({ element: 'button "Cancel"' })));
  assert.notEqual(fingerprint(raw()), fingerprint(raw({ key: 'press width' })));
});

test('long frames on a development build are warnings', () => {
  const f = finalize([{ kind: 'long-frame', element: 'a', detail: 'x', key: 'hover' }], validateConfig({}), { devServer: true });
  assert.equal(f.findings[0].level, 'warning');
});

test('loadConfig reads the default file, fails on a missing explicit file, and never echoes a malformed file', () => {
  assert.deepEqual(loadConfig(undefined, scratch).ignore, []);
  writeFileSync(join(scratch, 'motion-audit.config.json'), JSON.stringify({ tokens: { reason: 'tokens', durations: [70, 120] } }));
  assert.deepEqual(loadConfig(undefined, scratch).tokens.durations, [70, 120]);
  assert.throws(() => loadConfig('missing.json', scratch), /not found/);
  writeFileSync(join(scratch, 'bad.json'), 'super-secret-token {oops');
  assert.throws(() => loadConfig('bad.json', scratch), (e) => e instanceof ConfigError && /not valid JSON/.test(e.message) && !/secret/.test(e.message));
});
