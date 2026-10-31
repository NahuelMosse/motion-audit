// The gestures: what one control, one toggle, one click target and the reduced-motion pass do.
import { join } from 'node:path';
import {
  CLICK_INTERRUPT_MS, CLICK_LEAD_MS, CLICK_RECORD_MS, CONTACT_SHEET_STEP_MS, DENY_SELECTOR, DENY_TEXT, FOCUS_DWELL_MS, FRAME_MS,
  HIT_TEST_POINTS, HOVER_DWELL_MS, INTERRUPT_LEAD_MS, INTERRUPT_MIN_MOTION_MS, INTERRUPT_TAIL_MS, LONG_FRAME_MS, LONG_FRAME_UNATTRIBUTED_MS, PRESS_DWELL_MS,
  REDUCED_LOOP_SPINNER_PX, REST_MARGIN_MS, REST_MAX_MS, REST_MIN_MS, TOGGLE, TOGGLE_MIN_MOTION_MS, TOGGLE_SETTLE_MARGIN_MS, TOGGLE_SHARES, VIEWPORT, VISIBLE_PROPS,
} from './constants.mjs';
import { createPseudoStates, diff, load, longFramesBetween, shot, snapshot, toMs, traced } from './browser.mjs';
import { interruptionJumps } from './continuity.mjs';
import { denyReason, elementInfo, hitPoint, infiniteAnimations, invisibleContent, proxyOf, readTransition, scrollPass } from './page-scripts.mjs';
import { reducedMoves, reducedResidue } from './reduced.mjs';
import { analyzeRecording } from './series.mjs';

const DENY = { selector: DENY_SELECTOR, text: DENY_TEXT.source };
const asElement = (jsHandle) => jsHandle.asElement();
const wait = (page, ms) => page.waitForTimeout(ms);

export const denied = (handle) => handle.evaluate(denyReason, DENY);

// A point where the control itself receives the pointer, scrolling it to the centre if the first
// try is covered (sticky header, cookie banner); null when something stays on top.
export const reachablePoint = async (proxy) => {
  await proxy.scrollIntoViewIfNeeded();
  let point = await proxy.evaluate(hitPoint, HIT_TEST_POINTS);
  if (!point) {
    await proxy.evaluate((n) => n.scrollIntoView({ block: 'center', inline: 'center' }));
    point = await proxy.evaluate(hitPoint, HIT_TEST_POINTS);
  }
  return point;
};

const stillTransparent = (h) => h.evaluate((n) => { for (let e = n; e; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return true; return false; });

// Hover, press, hover-leave and keyboard focus of one control. Returns { el } or { skipped: reason }.
// Observe-only by default: the pointer only hovers; :active and :focus-visible are forced over CDP.
// With ctx.interact the press is real (mouse down, then released away from the control).
export const auditElement = async (ctx, original, label, { hoverOnly = false } = {}) => {
  const { page, pseudo } = ctx;
  const proxy = asElement(await original.evaluateHandle(proxyOf)) ?? original;
  const point = await reachablePoint(proxy);
  if (!point) return { skipped: 'covered' };
  const box = await proxy.boundingBox();
  if (!box || box.width < 2 || box.height < 2) return { skipped: 'zero-size' };
  const info = await proxy.evaluate(elementInfo);
  const refused = await denied(original);
  const real = ctx.interact && !refused;
  const transition = (raw) => ({ properties: raw.properties, durations: toMs(raw.durations), easings: raw.easings });
  const rest = transition(await proxy.evaluate(readTransition));
  const el = { label, kind: info.kind, selected: info.selected, transition: rest, moments: {}, long: [], pressMode: real ? 'real' : 'forced', hoverOnly };
  const moment = async (name, before, beforePx, after, afterPx, run) => {
    el.moments[name] = { changed: diff(before, after), pixels: afterPx !== beforePx, motion: run.motion, transition: transition(await (name === 'focus' ? ring : proxy).evaluate(readTransition)) };
    el.long.push(...run.long.map((l) => ({ moment: name, ...l })));
  };
  // The element that shows the focus ring: a visually hidden input shows it on its sibling.
  const ring = asElement(await original.evaluateHandle((n) => (n.matches('input') && getComputedStyle(n).opacity === '0' ? n.nextElementSibling ?? n : n))) ?? original;

  if (info.kind !== 'focus-only') {
    const base = await snapshot(proxy, VISIBLE_PROPS);
    const basePx = await shot(page, box);
    const hover = await traced(page, proxy, async () => { await page.mouse.move(point.x, point.y); await wait(page, HOVER_DWELL_MS); });
    if (hoverOnly && (await stillTransparent(proxy))) return { skipped: 'hidden' };
    const hovered = await snapshot(proxy, VISIBLE_PROPS);
    const hoverPx = await shot(page, box);
    await moment('hover', base, basePx, hovered, hoverPx, hover);
    if (info.kind !== 'input') {
      let press;
      if (real) {
        press = await traced(page, proxy, async () => { await page.mouse.down(); await wait(page, PRESS_DWELL_MS); });
        const pressed = await snapshot(proxy, VISIBLE_PROPS);
        const pressedPx = await shot(page, box);
        await page.mouse.move(1, 1);
        await page.mouse.up();
        await moment('press', hovered, hoverPx, pressed, pressedPx, press);
      } else {
        let ids;
        press = await traced(page, proxy, async () => { ids = await pseudo.force(proxy, ['hover', 'active']); await wait(page, PRESS_DWELL_MS); });
        const pressed = await snapshot(proxy, VISIBLE_PROPS);
        const pressedPx = await shot(page, box);
        await moment('press', hovered, hoverPx, pressed, pressedPx, press);
        await pseudo.clear(ids);
        await page.mouse.move(1, 1);
      }
    } else await page.mouse.move(1, 1);
    // Back to rest before the next gesture, or a slow transition leaks into the focus snapshot.
    await wait(page, Math.min(REST_MAX_MS, Math.max(REST_MIN_MS, ...el.transition.durations) + REST_MARGIN_MS));
    // Interrupt: enter, leave half-way through the hover motion; a reversing transition stays continuous.
    const hoverMs = Math.max(...hover.motion.flatMap((e) => e.moves.map((m) => m.durationMs)), 0);
    if (hoverMs >= INTERRUPT_MIN_MOTION_MS) {
      await proxy.evaluate((n) => window.__mt.begin('i', n));
      await wait(page, INTERRUPT_LEAD_MS);
      await page.mouse.move(point.x, point.y);
      await wait(page, Math.max(70, hoverMs / 2));
      await page.evaluate(() => window.__mt.mark('i'));
      await page.mouse.move(1, 1);
      await wait(page, INTERRUPT_TAIL_MS);
      const rec = await page.evaluate(() => window.__mt.end('i'));
      el.interrupt = rec?.marks.length ? interruptionJumps(rec, rec.marks[0], { durationMs: hoverMs, small: true }) : [];
    }
  }

  // Keyboard focus as :focus-visible shows it, forced over CDP: nothing receives a focus event.
  // Ancestors get :focus-within so a ring drawn on a wrapper counts.
  const wrapperHandles = [];
  for (const up of [1, 2]) wrapperHandles.push(asElement(await ring.evaluateHandle((n, levels) => { let e = n; for (let i = 0; i < levels && e.parentElement; i++) e = e.parentElement; return e; }, up)));
  const before = await snapshot(ring, VISIBLE_PROPS);
  const wrapperBefore = await Promise.all(wrapperHandles.map((h) => snapshot(h, VISIBLE_PROPS)));
  const beforePx = await shot(page, box);
  let ids;
  const focus = await traced(page, ring, async () => { ids = await pseudo.force(original, ['focus', 'focus-visible'], { 1: ['focus-within'], 2: ['focus-within'] }); await wait(page, FOCUS_DWELL_MS); });
  const after = await snapshot(ring, VISIBLE_PROPS);
  const wrapperAfter = await Promise.all(wrapperHandles.map((h) => snapshot(h, VISIBLE_PROPS)));
  const afterPx = await shot(page, box);
  const wrapperChanged = wrapperBefore.flatMap((b, i) => diff(b, wrapperAfter[i]).map((p) => `wrapper:${p}`));
  const hiddenUntilHover = hoverOnly && (await stillTransparent(ring));
  el.moments.focus = { changed: [...diff(before, after), ...wrapperChanged], pixels: afterPx !== beforePx, motion: focus.motion, transition: transition(await ring.evaluate(readTransition)), hiddenUntilHover };
  el.long.push(...focus.long.map((l) => ({ moment: 'focus', ...l })));
  await pseudo.clear(ids);
  return { el };
};

// ---------- toggles (only with --interact) ----------

const clickToggle = (page, index) => page.evaluate(([sel, i]) => { document.querySelectorAll(sel)[i].click(); }, [TOGGLE, index]);

// Indices of the toggles that may be clicked: reachable, enabled and not on the denylist.
export const eligibleToggles = async (page) => {
  const handles = await page.$$(TOGGLE);
  const eligible = [];
  const skipped = [];
  for (const [i, h] of handles.entries()) {
    const refused = await denied(h);
    if (refused) { skipped.push({ index: i, reason: 'denied' }); continue; }
    const reach = await h.evaluate((n) => { const r = n.getBoundingClientRect(); const c = getComputedStyle(n); return !n.disabled && c.display !== 'none' && c.visibility !== 'hidden' && r.width > 1 && r.height > 1; });
    if (reach) eligible.push(i); else skipped.push({ index: i, reason: 'hidden' });
  }
  return { eligible, skipped };
};

// Clicks a toggle, learns how long its motion lasts, then clicks the reverse at the middle of that
// motion in both directions and looks for a restart. The number of clicks is always even, so the
// control ends in the state it started in.
export const probeToggle = async (ctx, index) => {
  const { page, url } = ctx;
  await load(page, url, ctx.loadOptions);
  const label = await page.evaluate(([sel, i]) => { const n = document.querySelectorAll(sel)[i]; return n ? n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') + ` "${(n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"` : null; }, [TOGGLE, index]);
  if (!label) return { label: null };
  let clicks = 0;
  const click = async () => { clicks++; await clickToggle(page, index); };
  const run = async (steps) => {
    const hint = await page.evaluateHandle(([sel, i]) => { const n = document.querySelectorAll(sel)[i]; return n ? document.getElementById(n.getAttribute('aria-controls') || '') : null; }, [TOGGLE, index]);
    await page.evaluate(([h]) => window.__mt.begin('p', null, true, h), [hint]);
    for (const s of steps) { if (s === 'click') await click(); else await wait(page, s); }
    return page.evaluate(() => window.__mt.end('p'));
  };
  const moved = (rec) => analyzeRecording(rec).flatMap((e) => e.moves.filter((m) => m.startT >= rec.marks[0] - 2 * FRAME_MS));
  const jumps = [];
  let dur = 0;
  try {
    const first = await run(['click', CLICK_RECORD_MS]);
    dur = Math.max(0, ...moved(first).map((m) => m.durationMs));
    if (dur >= TOGGLE_MIN_MOTION_MS) {
      const settle = Math.round(dur + TOGGLE_SETTLE_MARGIN_MS);
      const check = (rec, direction) => { if (rec.marks.length > 1) for (const j of interruptionJumps(rec, rec.marks.at(-1), { durationMs: dur })) jumps.push({ ...j, direction }); };
      await run(['click', settle]); // back to the starting state
      for (const share of TOGGLE_SHARES) {
        const half = Math.max(50, Math.round(dur * share));
        check(await run(['click', half, 'click', settle]), 'opening'); // opening, reversed part-way
        check(await run(['click', settle, 'click', half, 'click', settle]), 'closing'); // closing, reversed part-way
        await run(['click', settle]); // closed again
      }
    } else await run(['click', TOGGLE_SETTLE_MARGIN_MS]); // no motion: still return to the starting state
  } finally {
    if (clicks % 2) await click().catch((e) => ctx.notes.push(`could not restore toggle ${label}: ${e.message.split('\n')[0]}`));
  }
  jumps.sort((x, y) => y.delta - x.delta);
  return { label, dur, jumps };
};

// ---------- --click <selector> ----------

// Everything that moves for 1.5 s after a real click, with the tracer off for the long-frame pass
// (tracing hundreds of nodes would itself overrun the frames it times) and on for the trajectories.
export const clickMeasurer = (ctx, selector, interrupt) => {
  const { page, url } = ctx;
  const attempt = async (trace) => {
    await load(page, url, ctx.loadOptions);
    const target = await page.$(selector);
    if (!target) return { missing: 'matches nothing' };
    const point = await reachablePoint(target);
    if (!point) return { missing: 'is covered by another element or not visible' };
    const hint = await target.evaluateHandle((n) => document.getElementById(n.getAttribute('aria-controls') || ''));
    if (trace) await page.evaluate(([h]) => window.__mt.begin('c', null, true, h), [hint]);
    const from = await page.evaluate(() => window.__mt.now());
    await wait(page, CLICK_LEAD_MS);
    await page.mouse.click(point.x, point.y);
    // The second click is dispatched on the element itself: an overlay opened by the first one
    // (a drawer over its own trigger) would otherwise receive it.
    if (interrupt) { await wait(page, CLICK_INTERRUPT_MS); await target.evaluate((n) => n.click()); }
    await wait(page, CLICK_RECORD_MS);
    const loaf = await page.evaluate(() => window.__mt.loaf);
    return { from, loaf, rec: trace ? await page.evaluate(() => window.__mt.end('c')) : null };
  };
  const measure = async () => {
    const quiet = await attempt(false);
    if (quiet.missing) return quiet;
    const traced2 = await attempt(true);
    if (traced2.missing) return traced2;
    const rec = traced2.rec;
    // What was already moving before the click (loops, carousels) is ambient, not the click's motion.
    const clickT = rec.marks[0] ?? Infinity;
    const moved = analyzeRecording(rec).map((e) => ({ ...e, moves: e.moves.filter((m) => m.startT >= clickT - 2 * FRAME_MS) })).filter((e) => e.moves.length);
    return {
      moved,
      long: longFramesBetween(quiet.loaf, quiet.from),
      jumps: moved.flatMap((e) => e.moves.flatMap((m) => m.jumps.map((j) => ({ label: e.label, prop: m.prop, ...j })))),
      layout: moved.flatMap((e) => e.moves.filter((m) => /^layout/.test(m.prop) && m.durationMs > 2 * FRAME_MS).map((m) => ({ label: e.label, prop: m.prop, durationMs: m.durationMs }))),
      interrupt: interrupt && rec.marks.length > 1 ? interruptionJumps(rec, rec.marks[1], { durationMs: CLICK_INTERRUPT_MS * 2, small: true }) : [],
      mounted: rec.mounted,
    };
  };
  return measure;
};

// ---------- reduced motion ----------

export const reducedPass = async (ctx, targets) => {
  const { context, url } = ctx;
  const page = await context.newPage();
  try {
    await page.setViewportSize(ctx.viewport ?? VIEWPORT);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(page, url, ctx.loadOptions);
    const pseudo = await createPseudoStates(context, page);
    const per = new Map();
    for (const { path, real } of targets) {
      const h = await page.$(path);
      if (!h || !(await h.isVisible())) continue;
      await h.scrollIntoViewIfNeeded();
      const box = await h.boundingBox();
      if (!box) continue;
      const T = ['transform', 'translate', 'scale', 'rotate'];
      const rest = await snapshot(h, T);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await wait(page, 150);
      let ids = null;
      if (real) await page.mouse.down(); else ids = await pseudo.force(h, ['hover', 'active']);
      await wait(page, PRESS_DWELL_MS);
      const pressed = await snapshot(h, T);
      if (real) { await page.mouse.move(1, 1); await page.mouse.up(); } else { await pseudo.clear(ids); await page.mouse.move(1, 1); }
      await wait(page, 300);
      const released = await snapshot(h, T);
      per.set(path, { moves: reducedMoves(rest, pressed), residue: reducedResidue(rest, released) });
    }
    await page.evaluate(scrollPass, { step: 400, stepMs: 60, tail: 600, limit: LONG_FRAME_MS, strongMs: LONG_FRAME_UNATTRIBUTED_MS, maxScrollers: 5 });
    const hidden = await page.evaluate(invisibleContent);
    const infinite = await page.evaluate(infiniteAnimations, { spinnerPx: REDUCED_LOOP_SPINNER_PX });
    return { per, hidden, infinite };
  } finally {
    await page.close();
  }
};

// ---------- contact sheet ----------

// One frame after another through hover, press and release, each with the time it really was taken.
export const contactSheet = async (ctx, selector, out) => {
  const { page, context, pseudo, url } = ctx;
  await load(page, url, ctx.loadOptions);
  const h = await page.$(selector);
  if (!h) return null;
  await h.scrollIntoViewIfNeeded();
  const box = await h.boundingBox();
  if (!box) return null;
  const clip = { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 };
  const shots = [];
  const t0 = Date.now();
  const take = async (tag) => { const data = (await page.screenshot({ clip })).toString('base64'); shots.push({ data, at: Date.now() - t0, tag }); };
  const burst = async (n, tag) => { for (let i = 0; i < n; i++) { await wait(page, CONTACT_SHEET_STEP_MS); await take(i === 0 ? tag : ''); } };
  await take('rest');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await burst(8, 'hover');
  const ids = await pseudo.force(h, ['hover', 'active']);
  await burst(5, 'press');
  await pseudo.clear(ids);
  await page.mouse.move(1, 1);
  await burst(6, 'out');
  const sheet = await context.newPage();
  try {
    await sheet.setViewportSize({ width: 1200, height: 200 });
    await sheet.setContent(`<body style="margin:0;background:#888;display:flex;flex-wrap:wrap;gap:4px;padding:4px">${shots.map((s) => `<figure style="margin:0;font:10px sans-serif;color:#fff"><img src="data:image/png;base64,${s.data}"><figcaption>${s.at} ms${s.tag ? ` ${s.tag}` : ''}</figcaption></figure>`).join('')}</body>`);
    const file = join(out, `${selector.replace(/[^\w-]+/g, '_').slice(0, 60)}.png`);
    await sheet.screenshot({ path: file, fullPage: true });
    return file;
  } finally {
    await sheet.close();
  }
};
