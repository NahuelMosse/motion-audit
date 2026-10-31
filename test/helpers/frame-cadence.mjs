// Prints how fast this machine's headless Chromium produces frames: the idle requestAnimationFrame
// cadence, the sampling intervals of the tracer during the jump fixture, and the analysis result.
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
  await page.goto(`${srv.url}/jump.html`);
  await page.waitForTimeout(500);
  const idle = await page.evaluate(() => new Promise((resolve) => {
    const times = [];
    const tick = (t) => { times.push(t); if (times.length < 90) requestAnimationFrame(tick); else resolve(times.slice(1).map((x, i) => x - times[i])); };
    requestAnimationFrame(tick);
  }));
  await page.evaluate(() => window.__mt.begin('c', null, true, null));
  await page.mouse.click(...(await page.$eval('#go', (n) => { const r = n.getBoundingClientRect(); return [r.left + 5, r.top + 5]; })));
  await page.waitForTimeout(1200);
  const rec = await page.evaluate(() => window.__mt.end('c'));
  const box = rec.elems.find((e) => e.label.includes('box'));
  const dts = box.t.slice(1).map((x, i) => x - box.t[i]);
  const jumps = analyzeRecording(rec).flatMap((e) => e.moves.filter((m) => m.jumps.length).map((m) => ({ label: e.label, prop: m.prop, jumps: m.jumps })));
  console.log(JSON.stringify({
    platform: process.platform,
    cpus: (await import('node:os')).cpus().length,
    userAgent: await page.evaluate(() => navigator.userAgent),
    idleFrameMs: stats(idle),
    tracerSampleMs: stats(dts),
    boxTx: box.tx.filter((_, i) => i % 6 === 0).map((v) => Math.round(v)),
    jumps,
    blankPageNoiseMs: Math.round(await calibrateFrames(context)),
  }));
} finally {
  await browser.close();
  await srv.close();
}
