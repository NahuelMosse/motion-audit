// What the audit's own page scripts (the tracer, the guards, the noise probe) and the page under audit hang on `window`,
// and the web APIs the DOM typings of TypeScript do not carry yet. Only the type-check reads this file.
interface Window {
  __mt?: any;
  __noise?: any;
  __maTarget?: any;
  __maGuard?: any;
  __vite_plugin_react_preamble_installed__?: any;
  __NEXT_DATA__?: any;
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: any;
}
interface PerformanceEntry {
  scripts?: any[];
}
interface AnimationEffect {
  target?: Element | null;
  getKeyframes?(): Record<string, any>[];
}
