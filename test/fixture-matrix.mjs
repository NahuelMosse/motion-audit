// Fixture runs through the CLI: what to pass, and (in expectations) the exact set of finding kinds.
export const CLI_MATRIX = [
  { name: 'bad', fixture: 'bad.html', args: [] },
  { name: 'bad-cpu4', fixture: 'bad.html', args: ['--cpu', '4'] },
  { name: 'bad-click', fixture: 'bad.html', args: ['--click', '#open', '--interrupt'] },
  { name: 'drawer-bad-click-interrupt', fixture: 'drawer-bad.html', args: ['--click', '#toggle', '--interrupt'] },
  { name: 'good', fixture: 'good.html', args: [] },
  { name: 'drawer-bad', fixture: 'drawer-bad.html', args: ['--interact'] },
  { name: 'drawer-good', fixture: 'drawer-good.html', args: ['--interact'] },
  { name: 'table-toast', fixture: 'table-toast.html', args: ['--click', '#save'] },
  { name: 'table-toast-cpu4', fixture: 'table-toast.html', args: ['--click', '#save', '--cpu', '4'] },
  { name: 'overlay-portal', fixture: 'overlay-portal.html', args: ['--click', '#open'] },
  { name: 'overlay-portal-cpu4', fixture: 'overlay-portal.html', args: ['--click', '#open', '--cpu', '4'] },
  { name: 'interactive-state', fixture: 'interactive-state.html', args: [] },
  { name: 'hover-reveal', fixture: 'hover-reveal.html', args: [] },
  { name: 'cookie-banner', fixture: 'cookie-banner.html', args: [] },
  { name: 'inner-scroll', fixture: 'inner-scroll.html', args: ['--max', '20'] },
  { name: 'shadcn', fixture: 'shadcn.html', args: [] },
  { name: 'jump', fixture: 'jump.html', args: ['--click', '#go'] },
  { name: 'kinds', fixture: 'kinds.html', args: [] },
  { name: 'kinds-interact', fixture: 'kinds.html', args: ['--interact'] },
  { name: 'scroll-jank', fixture: 'scroll-jank.html', args: [] },
  { name: 'dev-build', fixture: 'dev-build.html', args: [] },
  { name: 'toast-teleport', fixture: 'toast-teleport.html', args: ['--click', '#show'] },
  { name: 'remount', fixture: 'remount.html', args: ['--click', '#open'] },
  { name: 'pixel-noise', fixture: 'pixel-noise.html', args: [] },
  { name: 'dangerous-interact', fixture: 'dangerous.html', args: ['--interact'] },
  { name: 'pin-list-interact', fixture: 'pin-list.html', args: ['--interact'] },
  { name: 'interact-release', fixture: 'interact-release.html', args: ['--interact'] },
  { name: 'side-effects', fixture: 'side-effects.html', args: [] },
  { name: 'late-controls-waited', fixture: 'late-controls.html', args: ['--wait-for', 'button'] },
  { name: 'shadcn-fixed', fixture: 'shadcn-fixed.html', args: [] },
];

// Entries whose findings come from JS-driven motion sampled every frame (jumps, measured curves) or
// from frames near the 50 ms limit. GitHub's macOS runners render well under 30 fps in headless
// Chromium, which is below what that analysis needs, so their golden comparison runs on Linux and
// Windows only (Linux also runs each of them three times).
export const FRAME_RATE_BOUND = new Set([
  'bad', 'bad-cpu4', 'bad-click', 'drawer-bad', 'drawer-bad-click-interrupt', 'jump', 'kinds', 'kinds-interact', 'remount', 'toast-teleport',
]);
