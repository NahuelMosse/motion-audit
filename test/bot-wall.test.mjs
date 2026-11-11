import test from 'node:test';
import assert from 'node:assert/strict';
import { httpWall, isExternal, wallMessage, wallReason } from '../skills/motion-audit/scripts/lib/bot-wall.mjs';
import { main } from '../skills/motion-audit/scripts/lib/cli.mjs';

const page = (body, title = 'Shop') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const answer = (status, html) => async () => new Response(html, { status });

test('only pages on the internet are external', () => {
  assert.equal(isExternal('https://example.com/a'), true);
  assert.equal(isExternal('http://localhost:3000'), false);
  assert.equal(isExternal('http://127.0.0.1:3000'), false);
  assert.equal(isExternal('http://[::1]:3000'), false);
  assert.equal(isExternal('http://app.localhost:3000'), false);
  assert.equal(isExternal('file:///tmp/a.html'), false);
  assert.equal(isExternal('not a url'), false);
});

test('an error status, a challenge title and challenge text are walls; an ordinary page is not', () => {
  assert.equal(wallReason({ status: 403, html: page('x') }), 'status 403');
  assert.equal(wallReason({ status: 503, html: page('x') }), 'status 503');
  assert.match(wallReason({ status: 200, html: page('x', 'Just a moment...') }), /^title "Just a moment/);
  assert.match(wallReason({ status: 200, html: page('Please enable JavaScript and cookies to continue') }), /^text matches/);
  assert.equal(wallReason({ status: 200, html: page('<h1>Orders</h1><p>Welcome back</p>') }), null);
});

test('a script that names a captcha, or a long page that mentions one, is not a wall', () => {
  assert.equal(wallReason({ status: 200, html: page('<h1>Sign up</h1><script>const captcha = load("captcha")</script>') }), null);
  assert.equal(wallReason({ status: 200, html: page(`<p>${'word '.repeat(400)}</p><p>captcha</p>`) }), null);
});

test('httpWall reads the answer of an external page and leaves local ones and silent ones alone', async () => {
  assert.match(await httpWall('https://example.com', { fetch: answer(403, 'Access denied') }), /^status 403/);
  assert.equal(await httpWall('https://example.com', { fetch: answer(200, page('<h1>Orders</h1>')) }), null);
  assert.equal(await httpWall('http://localhost:3000', { fetch: answer(403, 'x') }), null);
  assert.equal(await httpWall('https://example.com', { fetch: async () => { throw new Error('offline'); } }), null);
});

const quiet = async (run) => {
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try { return { code: await run(), errors }; } finally { console.error = original; }
};

test('the CLI exits 2 on a bot wall without auditing it, and says which page and why', async () => {
  const { code, errors } = await quiet(() => main(['https://example.com/orders'], { fetch: answer(403, 'Access denied') }));
  assert.equal(code, 2);
  assert.match(errors.join('\n'), /could not run: https:\/\/example\.com\/orders answered a bot wall or an error page \(status 403\)/);
});

test('the CLI takes the URL from APP_URL when none is given', async () => {
  const before = process.env.APP_URL;
  process.env.APP_URL = 'https://example.com/from-env';
  try {
    const { code, errors } = await quiet(() => main([], { fetch: answer(503, 'Just a moment') }));
    assert.equal(code, 2);
    assert.match(errors.join('\n'), /https:\/\/example\.com\/from-env answered a bot wall/);
  } finally {
    if (before === undefined) delete process.env.APP_URL; else process.env.APP_URL = before;
  }
});

test('without a URL and without APP_URL the CLI says what is missing', async () => {
  const before = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const { code, errors } = await quiet(() => main([]));
    assert.equal(code, 2);
    assert.match(errors.join('\n'), /missing <url\|file>/);
  } finally {
    if (before !== undefined) process.env.APP_URL = before;
  }
});

test('the message names the URL and the reason', () => {
  assert.equal(wallMessage('https://a.test', 'status 403'), 'https://a.test answered a bot wall or an error page (status 403): nothing was audited');
});
