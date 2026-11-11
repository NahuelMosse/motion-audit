// Parses every tracked .mjs file with `node --check`, without running any of them. Exit 1 lists the files that do not parse.
import { execFileSync, spawnSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '*.mjs'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const broken = files.filter((file) => spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }).status !== 0);
console.log(`${files.length - broken.length} of ${files.length} files parse`);
process.exitCode = broken.length ? 1 : 0;
