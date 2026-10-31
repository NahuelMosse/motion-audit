# Changelog

## 1.0.0

First release as an installable plugin and as the npm package `motion-audit`. The package ships the
`skills/motion-audit` directory (CLI, library and skill together); `bin` and `exports` point inside it.

- Skill `motion-audit` and CLI `motion-audit`: per-frame measurement of hover, press and keyboard focus,
  click transitions, interruption, scroll, long frames and reduced motion in Chromium.
- Observe-only by default (real hover, `:active` and `:focus-visible` forced over CDP); `--interact`
  adds real presses and toggle probes behind a denylist, with a fresh page load between probes, an even
  number of clicks per toggle and a stop when a gesture navigates.
- Coverage contract: `audited N of M`, skips with reasons, exit 2 when nothing was audited,
  `--min-coverage`.
- The tracer follows nodes mounted during a recording (portals, conditionally rendered overlays);
  Animation-object restart detection; interruption analysis normalised by time; flaky kinds kept only
  when two of three runs agree.
- Config file with bands, duration tokens, per-kind severity and ignores, all requiring a reason;
  default profile where `no-entrance` is info and opt-in and missing press or hover on links and inputs
  is never an error.
- `audit(pageOrUrl, options)` accepts a Playwright `page`; `--storage-state`, `--wait-for`, redirect
  detection, hit-testing, inner scroll containers, hidden-until-hover controls, development-build
  detection, long-frame attribution from LoAF scripts.
- JSON report `schemaVersion: 1` with coverage and `loafSupported`; stable `kind:hash` finding ids,
  `--baseline`, `compare <ref.json> <mine.json>`.
- Argument validation (`--help` exits 0, unknown options and invalid numbers exit 2); Playwright is
  resolved from `PLAYWRIGHT_ROOT`, then the working directory, with real load errors surfaced and a 1.59
  minimum; reports go to a temp directory unless `--out` is given.
- Packaging: Claude Code plugin and marketplace manifests, `references/fixes.md`, trigger evals, unit and
  fixture tests, CI on Linux, Windows and macOS.
