// motion-audit.config.json: bands, duration tokens, per-kind severity and ignores with a reason.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BANDS } from './constants.mjs';
import { KINDS, LEVELS } from './kinds.mjs';

export const CONFIG_FILE = 'motion-audit.config.json';
const TOP_KEYS = new Set(['bands', 'tokens', 'severity', 'ignore']);
const GESTURES = Object.keys(BANDS);

export class ConfigError extends Error {}

// Fingerprint of a finding: stable across runs because it uses the element's label and the
// moment/property that identifies the finding, never DOM indices or measured numbers.
export const fingerprint = (f) => createHash('sha1').update(`${f.kind}\n${f.element}\n${f.key ?? ''}`).digest('hex').slice(0, 10);

export const validateConfig = (raw, source = CONFIG_FILE) => {
  const fail = (m) => { throw new ConfigError(`${source}: ${m}`); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('must be a JSON object');
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) fail(`unknown key "${k}" (allowed: ${[...TOP_KEYS].join(', ')})`);
  const bands = { ...BANDS };
  for (const [g, v] of Object.entries(raw.bands ?? {})) {
    if (!GESTURES.includes(g)) fail(`bands.${g}: unknown gesture (allowed: ${GESTURES.join(', ')})`);
    if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'number' || x < 0) || v[0] > v[1]) fail(`bands.${g} must be [min, max] in ms`);
    bands[g] = v;
  }
  const durations = raw.tokens?.durations ?? [];
  if (!Array.isArray(durations) || durations.some((x) => typeof x !== 'number' || x <= 0)) fail('tokens.durations must be an array of positive numbers (ms)');
  const severity = {};
  for (const [k, v] of Object.entries(raw.severity ?? {})) {
    if (!KINDS[k]) fail(`severity.${k}: unknown kind`);
    if (!LEVELS.includes(v)) fail(`severity.${k}: "${v}" is not one of ${LEVELS.join(', ')}`);
    severity[k] = v;
  }
  const ignore = [];
  for (const [i, e] of (raw.ignore ?? []).entries()) {
    if (!e || typeof e !== 'object') fail(`ignore[${i}] must be an object`);
    if (typeof e.reason !== 'string' || !e.reason.trim()) fail(`ignore[${i}] needs a non-empty "reason"`);
    if (!e.id && !e.kind) fail(`ignore[${i}] needs "id" (fingerprint) or "kind" (with optional "element")`);
    if (e.kind && !KINDS[e.kind]) fail(`ignore[${i}].kind "${e.kind}" is not a known kind`);
    ignore.push({ id: e.id, kind: e.kind, element: e.element, reason: e.reason.trim() });
  }
  return { bands, tokens: { durations }, severity, ignore };
};

export const loadConfig = (path, cwd = process.cwd()) => {
  const file = path ? resolve(cwd, path) : join(cwd, CONFIG_FILE);
  if (!existsSync(file)) {
    if (path) throw new ConfigError(`config file not found: ${file}`);
    return validateConfig({});
  }
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new ConfigError(`${file}: invalid JSON (${e.message})`); }
  return validateConfig(raw, file);
};

const globToRegExp = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const ignoreMatches = (rule, f) => (rule.id ? rule.id === f.id : rule.kind === f.kind && (!rule.element || globToRegExp(rule.element).test(f.element)));

// Raw findings -> final findings: default level, config severity, ignores. Returns
// { findings, suppressed } where suppressed carries the reason of the rule that dropped it.
export const finalize = (raw, config, { devServer = false } = {}) => {
  const findings = [];
  const suppressed = [];
  for (const f of raw) {
    let level = f.level ?? KINDS[f.kind].level;
    if (f.kind === 'long-frame' && devServer) level = 'warning';
    level = config.severity[f.kind] ?? level;
    if (level === 'off') continue;
    const full = { id: fingerprint(f), level, kind: f.kind, element: f.element, detail: f.detail };
    const rule = config.ignore.find((r) => ignoreMatches(r, full));
    if (rule) suppressed.push({ ...full, reason: rule.reason });
    else findings.push(full);
  }
  return { findings, suppressed };
};
