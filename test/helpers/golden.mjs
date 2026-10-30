// Shared by the golden-file test and its updater.
import { join } from 'node:path';
import { ROOT } from './cli.mjs';

export const GOLDEN_PATH = join(ROOT, 'test', 'expected-findings.json');
export const signature = (report) => report.findings.map((f) => `${f.level}|${f.id}|${f.element}`).sort();
