// Prints how well this machine's headless Chromium samples the two JS-driven motions the fixtures
// depend on: the idle requestAnimationFrame cadence, then six recordings each of the teleporting box
// of jump.html and of the rAF ease-in hover of kinds.html, with what the analysis made of them.
// CLI: node test/helpers/frame-cadence.mjs
import { chromium } from 'playwright';
import { calibrateFrames, TRACER_CONFIG } from '../../skills/motion-audit/scripts/lib/browser.mjs';
import { tracer } from '../../skills/motion-audit/scripts/lib/page-tracer.mjs';
import { analyzeRecording } from '../../skills/motion-audit/scripts/lib/series.mjs';
import { FIXTURES } from './cli.mjs';
import { serve } from './serve.mjs';

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 10) / 10;
  return { n: values.length, median: at(0.5), p90: at(0.9), max: at(1) };
};

const srv = await serve(FIXTURES);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(tracer, TRACER_CONFIG);
  const page = await context.newPage();
  const open = async (file) => { await page.goto(`${srv.url}/${file}`); await page.waitForTimeout(500); };
  await open('jump.html');
  const idle = await page.evaluate(() => new Promise((resolve) => {
    const times = [];
    const tick = (t) => { times.push(t); if (times.length < 90) requestAnimationFrame(tick); else resolve(times.slice(1).map((x, i) => x - times[i])); };
    requestAnimationFrame(tick);
  }));
  const center = (selector) => page.$eval(selector, (n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const summarize = (rec, label, prop) => {
    const el = rec.elems.find((e) => e.label.includes(label));
    const moves = analyzeRecording(rec).filter((e) => e.label.includes(label)).flatMap((e) => e.moves.filter((m) => m.prop === prop));
    const dts = el ? el.t.slice(1).map((x, i) => x - el.t[i]) : [];
    return { sampleMs: stats(dts.length ? dts : [0]), moves: moves.map((m) => ({ shape: m.shape, durationMs: m.durationMs, samples: m.samples, jumps: m.jumps })) };
  };
  const jumpRuns = [];
  for (let i = 0; i < 6; i++) {
    await open('jump.html');
    await page.evaluate(() => window.__mt.begin('c', null, true, null));
    await page.mouse.click(...(await center('#go')));
    await page.waitForTimeout(1200);
    jumpRuns.push(summarize(await page.evaluate(() => window.__mt.end('c')), 'box', 'translateX'));
  }
  const hoverRuns = [];
  for (let i = 0; i < 6; i++) {
    await open('kinds.html');
    const target = await page.$('.js');
    await target.evaluate((n) => window.__mt.begin('m', n));
    await page.mouse.move(...(await center('.js')));
    await page.waitForTimeout(700);
    hoverRuns.push(summarize(await page.evaluate(() => window.__mt.end('m')), 'js', 'translateY'));
    await page.mouse.move(1, 1);
  }
  console.log(JSON.stringify({
    platform: process.platform,
    cpus: (await import('node:os')).cpus().length,
    idleFrameMs: stats(idle),
    blankPageNoiseMs: Math.round(await calibrateFrames(context)),
    jumpRuns,
    hoverRuns,
  }));
} finally {
  await browser.close();
  await srv.close();
}
