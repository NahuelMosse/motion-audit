import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLong, longFramesBetween } from '../skills/motion-audit/scripts/lib/browser.mjs';

const app = (duration, extra = {}) => ({ url: 'http://x/app.js', fn: 'handler', invoker: 'click', duration, forced: 0, ...extra });
const audit = (duration, forced = 0) => ({ url: '', fn: '', invoker: 'callback', duration, forced });

test('a frame over 50 ms with no script behind it is render jank and counts', () => {
  const found = longFramesBetween([[100, 93, []]], 0);
  assert.deepEqual(found, [{ duration: 93, scripts: [] }]);
  assert.equal(describeLong(found).culprit, 'no script attributed (style, layout or paint)');
});

test('a frame of 50 ms or less never counts', () => {
  assert.deepEqual(longFramesBetween([[100, 50, []], [200, 20, [app(15)]]], 0), []);
});

test('a frame whose time is the audit\'s own injected script is not the page\'s', () => {
  // 120 ms frame, 100 ms in the tracer's callback of which 5 ms forced a layout: 25 ms are the page's.
  assert.deepEqual(longFramesBetween([[100, 120, [audit(100, 5)]]], 0), []);
});

test('a layout the tracer forced inside its own callback is still the page\'s cost', () => {
  // The hover invalidated 1000 cells; the tracer's first rect read paid for the layout (90 of its 100 ms).
  const found = longFramesBetween([[100, 120, [audit(100, 90)]]], 0);
  assert.equal(found.length, 1);
  assert.equal(found[0].duration, 120);
});

test('a frame with an application script counts whatever the injected scripts did, and names only application scripts', () => {
  const found = longFramesBetween([[100, 70, [audit(5), app(60)]]], 0);
  assert.equal(found.length, 1);
  assert.match(describeLong(found).culprit, /^scripts: app\.js 60 ms$/);
});

test('on a slow machine a frame with no application script must be longer than the machine\'s own noise, a frame with an application script still counts from 50 ms', () => {
  const loaf = [[100, 93, []], [300, 130, []], [500, 60, [app(55)]]];
  assert.deepEqual(longFramesBetween(loaf, 0, Infinity, 120).map((f) => f.duration), [130, 60]);
  assert.deepEqual(longFramesBetween(loaf, 0).map((f) => f.duration), [93, 130, 60]);
});

test('only frames overlapping the window count', () => {
  const loaf = [[0, 80, []], [1000, 80, []], [5000, 80, []]];
  assert.deepEqual(longFramesBetween(loaf, 900, 2000).map((f) => f.duration), [80]);
});
