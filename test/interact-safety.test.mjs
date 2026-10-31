import { after, before } from 'node:test';
import { sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { audit } from '../skills/motion-audit/scripts/lib/index.mjs';
import { denied } from '../skills/motion-audit/scripts/lib/probes.mjs';
import { FIXTURES, removeScratch } from './helpers/cli.mjs';
import { serve } from './helpers/serve.mjs';

let srv;
let browser;
const scratch = mkdtempSync(join(tmpdir(), 'ma-safety-'));
before(async () => {
  process.env.TEMP = scratch;
  process.env.TMP = scratch;
  process.env.TMPDIR = scratch;
  srv = await serve(FIXTURES);
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
  await srv.close();
  removeScratch();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
});

const withPage = async (fn) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try { return await fn(page); } finally { await context.close(); }
};
const calls = () => srv.stats.requests.filter((r) => r.includes('/api/'));
const count = (name) => calls().filter((c) => c.endsWith(`/api/${name}`)).length;

const DANGEROUS = {
  'Spanish aria-label': '<button type="button" aria-label="Eliminar elemento">x</button>',
  'icon-only button without a name': '<button type="button" data-testid="trash"><svg aria-hidden="true" viewBox="0 0 8 8"></svg></button>',
  'aria-labelledby': '<span id="n">Delete workspace</span><button type="button" aria-labelledby="n">x</button>',
  'summary Borrar cuenta': '<details><summary>Borrar cuenta</summary>x</details>',
  Pagar: '<button type="button">Pagar ahora</button>',
  'Cerrar sesión': '<button type="button">Cerrar sesión</button>',
  Comprar: '<button type="button">Comprar</button>',
  Enviar: '<button type="button">Enviar</button>',
  Confirmar: '<button type="button">Confirmar</button>',
  Publicar: '<button type="button">Publicar</button>',
  Salir: '<button type="button">Salir</button>',
  Supprimer: '<button type="button">Supprimer</button>',
  Löschen: '<button type="button">Löschen</button>',
  Excluir: '<button type="button">Excluir</button>',
  Abmelden: '<button type="button">Abmelden</button>',
  'name from an img alt': '<button type="button"><img alt="Delete" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></button>',
  'submit button outside its form': '<form id="f"></form><button form="f">Next</button>',
  'default-type button in a form': '<form><button>Next</button></form>',
  'input submit': '<input type="submit" value="Go">',
  'link to logout': '<a href="/api/logout" aria-expanded="false">Account</a>',
  'link to delete': '<a href="/orders/12/delete">Order</a>',
  'role=button Eliminar': '<div role="button" tabindex="0">Eliminar</div>',
};
const SAFE = {
  'English disclosure': '<button type="button" aria-expanded="false">More information</button>',
  'Spanish menu': '<button type="button" aria-expanded="false">Abrir menú</button>',
  Cerrar: '<button type="button">Cerrar</button>',
  Cancelar: '<button type="button">Cancelar</button>',
  'type=button inside a form': '<form><button type="button" aria-expanded="false">Filtros</button></form>',
  'aria-labelledby with a harmless name': '<span id="n">Favorites</span><button type="button" aria-pressed="false" aria-labelledby="n">x</button>',
  'img alt': '<button type="button"><img alt="Settings" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></button>',
  'link to a page': '<a href="/settings" aria-expanded="false">Settings</a>',
  'summary Details': '<details><summary>Details</summary>x</details>',
};

test('the denylist covers real labels in several languages, form owners, links and unnamed controls, and lets ordinary toggles through', async () => {
  await withPage(async (page) => {
    for (const [name, html] of Object.entries({ ...DANGEROUS, ...SAFE })) {
      await page.setContent(`<body>${html}</body>`);
      const target = await page.$('button, summary, [role=button], input, a');
      const reason = await denied(target);
      if (name in DANGEROUS) assert.ok(reason, `${name} must be denied`);
      else assert.equal(reason, null, `${name} must be allowed, got: ${reason}`);
    }
  });
});

test('--interact touches none of the dangerous controls (Spanish, icon-only, aria-labelledby, form owner, logout link) and still probes the safe toggle', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/dangerous.html`);
    srv.stats.requests.length = 0;
    const report = await audit(page, { url: `${srv.url}/dangerous.html`, interact: true });
    const touched = calls().filter((c) => !c.endsWith('/api/info'));
    assert.deepEqual(touched, []);
    assert.ok(count('info') > 0 && count('info') % 2 === 0, `info clicked ${count('info')} times`);
    assert.ok(report.coverage.toggles.probed >= 1);
    assert.ok(report.coverage.toggles.skipped.denied >= 7, JSON.stringify(report.coverage.toggles.skipped));
    assert.ok(!srv.stats.requests.includes('GET /api/logout'));
  });
});

test('a Pin that reorders the list is clicked on the same item every time: every item ends unpinned', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/pin-list.html`);
    srv.stats.requests.length = 0;
    const report = await audit(page, { url: `${srv.url}/pin-list.html`, interact: true });
    assert.ok(report.coverage.toggles.probed >= 3);
    for (const id of ['a', 'b', 'c']) assert.equal(count(`pin/${id}`) % 2, 0, `item ${id} was clicked ${count(`pin/${id}`)} times`);
    assert.equal(await page.evaluate(() => localStorage.getItem('pins')), '[]');
  });
});

test('--interact releases a press without a click on the body and without starting a link drag', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/interact-release.html`);
    srv.stats.requests.length = 0;
    const report = await audit(page, { url: `${srv.url}/interact-release.html`, interact: true });
    assert.equal(report.coverage.audited, 3);
    assert.deepEqual(calls(), []);
  });
});

test('a link that navigates on mousedown stops the audit with a note, not as an error', async () => {
  const report = await audit(`${srv.url}/nav-mousedown.html`, { interact: true });
  assert.equal(report.coverage.errored, 0);
  assert.equal(report.coverage.skipped.error, undefined);
  assert.ok(report.notes.some((n) => /navigated to .*shadcn\.html/.test(n)), report.notes.join(' | '));
  assert.ok(report.coverage.skipped['page navigated during the audit']?.count >= 1);
});

test('the default mode dispatches no focus, key, press or click event; only hover and scroll handlers run', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/side-effects.html`);
    srv.stats.requests.length = 0;
    const report = await audit(page, { url: `${srv.url}/side-effects.html` });
    assert.equal(report.mode, 'observe-only');
    for (const type of ['focus', 'focusin', 'blur', 'keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'click', 'input', 'change', 'document-keydown']) assert.equal(count(type), 0, `${type} handlers ran`);
    // Hover and scroll are real input: these are expected and documented.
    assert.ok(count('hover-mouseenter') > 0 && count('hover-mouseover') > 0 && count('hover-pointerenter') > 0, 'hover handlers ran');
    assert.ok(count('impression') > 0, 'the scroll-bound observer ran');
  });
});
