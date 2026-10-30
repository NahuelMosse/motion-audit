// Helpers that drive the page: tracing a gesture, snapshots, forced pseudo-states over CDP,
// navigation with redirect checks.
import { CLIP_MARGIN_PX, HYDRATION_WAIT_MS, LOGIN_PATH, LONG_FRAME_MS, LONG_FRAME_UNATTRIBUTED_MS, NAV_TIMEOUT_MS, TRACE_MIN_SIZE_PX, TRACE_MOUNT_CAP, TRACE_PAGE_CAP, TRACE_SUBTREE_CAP, WAIT_FOR_TIMEOUT_MS } from './constants.mjs';
import { COLS, analyzeRecording } from './series.mjs';

export class AuditError extends Error {}

export const TRACER_CONFIG = { cols: COLS, skip: ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'TEMPLATE'], subtreeCap: TRACE_SUBTREE_CAP, pageCap: TRACE_PAGE_CAP, mountCap: TRACE_MOUNT_CAP, minSize: TRACE_MIN_SIZE_PX };

export const snapshot = (h, props) => h.evaluate((n, p) => { const cs = getComputedStyle(n); return Object.fromEntries(p.map((x) => [x, cs.getPropertyValue(x)])); }, props);
export const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
export const shot = async (page, box) => (await page.screenshot({ clip: { x: Math.max(0, box.x - CLIP_MARGIN_PX), y: Math.max(0, box.y - CLIP_MARGIN_PX), width: box.width + 2 * CLIP_MARGIN_PX, height: box.height + 2 * CLIP_MARGIN_PX } })).toString('base64');
export const toMs = (list) => String(list).split(',').map((s) => s.trim()).map((s) => (s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000));

// Records one gesture: the tracer follows `root` and its subtree while `action` runs.
export const traced = async (page, root, action) => {
  await root.evaluate((n) => window.__mt.begin('m', n));
  const from = await page.evaluate(() => window.__mt.now());
  await action();
  const rec = await page.evaluate(() => window.__mt.end('m'));
  const to = await page.evaluate(() => window.__mt.now());
  const loaf = await page.evaluate(() => window.__mt.loaf);
  return { rec, motion: analyzeRecording(rec), long: longFramesBetween(loaf, from, to) };
};

// Long frames in [from, to] that an application script (a named source URL) caused, or that are very long.
export const longFramesBetween = (loaf, from, to = Infinity) => loaf.filter(([s, d, scripts]) => s + d >= from && s <= to && d > LONG_FRAME_MS && ((scripts ?? []).some((x) => x.url) || d >= LONG_FRAME_UNATTRIBUTED_MS)).map(([, d, scripts]) => ({ duration: Math.round(d), scripts }));

// Which scripts a long frame is attributed to, from the LoAF `scripts[]`.
export const describeLong = (long) => {
  const frames = long.map((l) => l.duration);
  const byUrl = new Map();
  for (const l of long) for (const s of l.scripts ?? []) {
    const name = s.url ? s.url.replace(/^.*\//, '').replace(/\?.*$/, '') || s.url : '(inline or injected script)';
    byUrl.set(name, (byUrl.get(name) ?? 0) + s.duration);
  }
  const top = [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, d]) => `${n} ${d} ms`);
  return { frames, culprit: top.length ? `scripts: ${top.join(', ')}` : 'no script attributed (style, layout or paint)' };
};

// Forces CSS pseudo-classes on an element through the DevTools protocol: no pointer or focus
// event is dispatched, so nothing in the app reacts.
export const createPseudoStates = async (context, page) => {
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const nodeId = async (handle, up = 0) => {
    await handle.evaluate((n, levels) => { let e = n; for (let i = 0; i < levels && e.parentElement; i++) e = e.parentElement; window.__maTarget = e; }, up);
    const { result } = await session.send('Runtime.evaluate', { expression: 'window.__maTarget' });
    await handle.evaluate(() => { delete window.__maTarget; });
    return (await session.send('DOM.requestNode', { objectId: result.objectId })).nodeId;
  };
  return {
    async force(handle, states, ancestors = {}) {
      // Node ids are only valid until the next getDocument, so it is called once, before resolving any.
      await session.send('DOM.getDocument', { depth: 0 });
      const ids = [{ id: await nodeId(handle), states }];
      for (const [up, st] of Object.entries(ancestors)) ids.push({ id: await nodeId(handle, Number(up)), states: st });
      for (const { id, states: s } of ids) await session.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: s });
      return ids;
    },
    async clear(ids) { for (const { id } of ids) await session.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] }); },
    session,
  };
};

const sameDocument = (a, b) => {
  const x = new URL(a);
  const y = new URL(b);
  return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') && x.search === y.search;
};
export const sameLocation = sameDocument;

// Loads `url` fresh (never reload: a probe may have navigated) and checks where it landed.
export const load = async (page, url, { waitFor, expectLogin = false } = {}) => {
  const response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
  if (response && response.status() >= 400) throw new AuditError(`${url} answered HTTP ${response.status()}`);
  const landed = page.url();
  if (!sameDocument(url, landed) && !expectLogin) {
    const requested = new URL(url);
    const final = new URL(landed);
    if (LOGIN_PATH.test(final.pathname + final.search) && !LOGIN_PATH.test(requested.pathname)) {
      throw new AuditError(`${url} redirected to ${landed}: that is a login page, not the page to audit. Pass --storage-state <file> with a logged-in session`);
    }
  }
  if (waitFor) {
    try { await page.waitForSelector(waitFor, { state: 'visible', timeout: WAIT_FOR_TIMEOUT_MS }); } catch (e) {
      throw new AuditError(`--wait-for "${waitFor}" did not appear within ${WAIT_FOR_TIMEOUT_MS / 1000} s on ${landed}: ${e.message.split('\n')[0]}`);
    }
  }
  await page.waitForTimeout(HYDRATION_WAIT_MS);
  return { landed, redirected: !sameDocument(url, landed) };
};
