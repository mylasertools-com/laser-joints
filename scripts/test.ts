import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files = (await readdir('test'))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => `test/${name}`);
if (!files.length) throw Error('No unit tests found.');
const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
});
process.exitCode = r.status ?? 1;
