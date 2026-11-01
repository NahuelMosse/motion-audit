// Decides what the release workflow does and writes it to $GITHUB_OUTPUT: version, dist-tag, mode and on-npm.
//   mode=pack     a ref that is neither main nor a tag: only shows what would be published
//   mode=none     nothing to publish: the package is not on npm yet (its first version is published by hand) or this
//                 version already is
//   mode=publish  main or a tag holds a version npm does not have
// It needs no installed dependencies, so the publishing job can run it without `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const { name, version } = json('package.json');
const plugin = json('.claude-plugin/plugin.json').version;
const { GITHUB_REF_TYPE: refType, GITHUB_REF_NAME: refName, GITHUB_OUTPUT: outputFile } = process.env;

if (version !== plugin) fail(`package.json (${version}) and plugin.json (${plugin}) differ`);
if (refType === 'tag' && refName !== `v${version}`) fail(`tag ${refName} is not v${version}`);
console.log(`package.json ${version}, plugin.json ${plugin}`);

const output = {
  version,
  // A prerelease (1.3.0-rc.0) goes to the `next` dist-tag: `latest` only ever points at a stable version.
  'dist-tag': version.includes('-') ? 'next' : 'latest',
  mode: 'pack',
  'on-npm': 'false',
};
if (refType === 'tag' || refName === 'main') {
  if (view(name, 'name') === null) {
    console.log(`::notice::${name} is not on npm yet: the first version is published by hand (trusted publishing needs an existing package)`);
    output.mode = 'none';
  } else if (view(`${name}@${version}`, 'version') === version) {
    console.log(`${name}@${version} is already on npm: nothing to publish`);
    output.mode = 'none';
    output['on-npm'] = 'true';
  } else {
    output.mode = 'publish';
  }
}
for (const [key, value] of Object.entries(output)) {
  console.log(`${key}=${value}`);
  if (outputFile) appendFileSync(outputFile, `${key}=${value}\n`);
}

// `npm view <spec> <field>`: the value, '' when the version does not exist, null when the package does not exist (E404).
// Any other failure (registry down) must not pass as "not published".
function view(spec, field) {
  try {
    return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['view', spec, field], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (String(error.stderr).includes('E404')) return null;
    throw error;
  }
}

function fail(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}
