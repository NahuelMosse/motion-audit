# motion-audit

A Claude Code skill and CLI that measure how a running web UI moves, in a real Chromium: which
controls give no hover, press or keyboard-focus feedback, which transitions snap or jank, long frames,
ease-in curves and off-band durations, animations that jump or restart when interrupted, and
`prefers-reduced-motion` that is missing or broken. It records the element and its children on every
animation frame instead of trusting what the CSS declares.

It is **observe-only by default**: it hovers, forces `:active` and `:focus-visible` over the DevTools
protocol, scrolls and reads. It never clicks unless you pass `--interact` (or name a control with
`--click`), so it cannot toggle a Follow button or submit a form, and no focus, key or press handler
runs. The pointer and the scroll are real, though: handlers bound to hover (`mouseenter`, `mouseover`,
`pointerenter` that send a beacon or write storage), scroll-bound `IntersectionObserver` callbacks and
`beforeunload` beacons run. Audit a throwaway or staging environment, never one where those events
are billed or irreversible.

## Install as a Claude Code plugin

```bash
claude plugin marketplace add NahuelMosse/motion-audit
claude plugin install motion-audit@motion-audit
```

Pin a release by adding the tag to the marketplace source, and update with the plugin commands:

```bash
claude plugin marketplace add NahuelMosse/motion-audit#v1.0.0
claude plugin marketplace update motion-audit
claude plugin update motion-audit@motion-audit
```

The skill needs Node 22.12+ and Playwright 1.43+ with Chromium in the project you audit
(`npm i -D playwright && npx playwright install chromium`). Set `PLAYWRIGHT_ROOT` to a project that has
it when the audited project does not.

## Standalone CLI

```bash
npm i -D github:NahuelMosse/motion-audit#v1.0.0
npx motion-audit http://localhost:3000/orders
npx motion-audit http://localhost:3000/orders --cpu 4 --click '[aria-controls=filters]' --interrupt
npx motion-audit compare ref.json mine.json
```

Exit `0` clean, `1` findings, `2` could not run or audited nothing. Audit a production build
(`next start`, `vite preview`): on a dev server long frames are downgraded to warnings.

| Option | Meaning |
|---|---|
| `--only <sel>` | audit only matching controls (repeatable) |
| `--max <n>` | audit at most n controls, default 40; the summary says `audited N of M` |
| `--min-coverage <0-1>` | exit 2 when audited / candidates is lower; controls beyond `--max` count as not audited, so raise `--max` too |
| `--interact` | real press and toggle probes; a denylist skips submit and reset controls, unnamed buttons, logout and delete links, destructive wording in six languages, drag and slider controls |
| `--click <sel>` `--interrupt` | record a real click (and a second one half-way); clicks the target twice, four times with `--interrupt`, more when a finding is re-measured: throwaway environments only |
| `--allow-redirect` | audit the page the URL redirects to; without it any redirect, from the server or from script, exits 2, and a login page always does |
| `--cpu <rate>` | CPU throttle, 4 is a mid-range phone |
| `--frames <sel>` | contact sheet of hover and press with real timestamps |
| `--entrances` | also report sections without an entrance (info) |
| `--storage-state <file>` | logged-in Playwright storage state; a redirect to a login page exits 2 |
| `--wait-for <sel>` | wait for a selector before auditing |
| `--config <file>` | config file, default `./motion-audit.config.json` |
| `--baseline <report.json>` | ignore findings already in an earlier report |
| `--out <dir>` | report and sheets; default a fresh temp directory |
| `--strict` | warnings fail too |
| `--json` | the report, `schemaVersion: 1`, with coverage, `loafSupported` and finding ids |

## Config

`motion-audit.config.json` in the audited project. Everything that loosens the audit needs a reason:

```json
{
  "bands": { "reason": "Carbon micro-interactions run at 70 ms", "hover": [60, 300] },
  "tokens": { "reason": "design-system duration tokens", "durations": [70, 120, 200] },
  "severity": {
    "inconsistent-duration": { "level": "info", "reason": "size-scaled durations are intended" },
    "duration": "error"
  },
  "ignore": [
    { "kind": "no-feedback", "element": "a \"Skip to content\"*", "reason": "visible only on focus" },
    { "id": "no-feedback:3f2a9c1d07", "reason": "tracked in the design-system backlog" }
  ]
}
```

`bands` are `[min, max]` ms for `hover`, `press` and `focus`. `severity` levels are `error`, `warning`,
`info` and `off`; lowering a kind needs the object form with a reason, raising does not. `ignore` takes a
finding id (`kind:hash`, printed after each finding) or a kind plus an element glob; wildcard-only ids
and elements are rejected. Defaults: `no-entrance` is info and opt-in, a missing press or hover on links
and inputs is never an error, durations and consistency are warnings.

## CI

With Playwright Test, in a project that installed this package:

```js
import { test, expect } from '@playwright/test';
import { audit } from 'motion-audit';

test('orders: motion', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/orders');
  const report = await audit(page, { only: ['main button', 'nav a'], max: 20 });
  expect(report.coverage.audited).toBeGreaterThan(0);
  expect(report.findings.filter((f) => f.level === 'error')).toEqual([]);
});
```

`audit(pageOrUrl, options)` takes a Playwright `page` (its `baseURL` and `storageState` apply) or a URL
(options: `only`, `max`, `cpu`, `click`, `interrupt`, `interact`, `frames`, `entrances`, `config`,
`baseline`, `storageState`, `waitFor`, `allowRedirect`, `out`). Or from the shell, failing on new findings only:

```bash
npx motion-audit "$APP_URL/orders" --max 200 --min-coverage 0.8 --baseline motion-baseline.json
```

## Develop

```bash
npm ci
npx playwright install chromium
npm test                                  # unit and fixture tests
node test/helpers/fixture-runs.mjs 3      # every fixture three times, identical findings required
```

## License

MIT. See [NOTICES.md](NOTICES.md) for credits.
