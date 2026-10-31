# motion-audit

A CLI, a library and a Claude Code skill that measure how a running web UI moves, in a real Chromium: which
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

## Install and run

Node 22.12+ and Playwright 1.59+ with Chromium in the project you audit.

```bash
npm i -D motion-audit playwright
npx playwright install chromium
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
| `--interact` | real press and toggle probes; a denylist skips submit and reset controls, unnamed buttons, every link that is not `#` or an `#id` on the page, destructive wording in six languages, drag and slider controls |
| `--click <sel>` `--interrupt` | record a real click (and a second one half-way); clicks the target twice, four times with `--interrupt`, and at most eight times (sixteen) when sparse frames or a flaky finding force a re-measure (a retry adds one press: when the count would end odd without `--interrupt` the target is pressed once more, so the state it keeps ends as it began; with `--interrupt` every recording presses twice and the count is always even): throwaway environments only |
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
`baseline`, `storageState`, `waitFor`, `allowRedirect`, `out`). With a `page`, the CPU throttle is
removed, the CDP session detached and the tracer stopped and unregistered when the audit ends. Or from
the shell, failing on new findings only:

```bash
npx motion-audit "$APP_URL/orders" --max 200 --min-coverage 0.8 --baseline motion-baseline.json
```

## Claude Code skill

The same tool as a skill: Claude measures the page, reads the findings and fixes the CSS. The skill is the
`skills/motion-audit` directory, self-contained (CLI and library included), so the plugin, `npx skills add
NahuelMosse/motion-audit` and a copy of that directory all work. Inside the skill, `npx --no-install
motion-audit` is preferred when the project has the devDependency; otherwise it runs the bundled script.


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

The skill needs the same Node and Playwright. Set `PLAYWRIGHT_ROOT` to a project that has
it when the audited project does not.

## Develop

```bash
npm ci
npx playwright install chromium
npm run test:unit                         # pure and quick, no browser
npm run test:browser                      # fixtures, CLI and safety tests in Chromium
npm test                                  # both
node test/helpers/fixture-runs.mjs 3      # every fixture three times: identical findings, equal to the golden file
MA_SHARD=2/6 npm run test:browser         # one slice of the browser tests (CI runs the slices in parallel jobs)
```

## License

MIT. See [NOTICES.md](NOTICES.md) for credits.
