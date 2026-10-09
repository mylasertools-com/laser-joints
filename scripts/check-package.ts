import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.'),
  parent = resolve('.pack-test');
await mkdir(parent, { recursive: true });
const dir = await mkdtemp(join(parent, 'consumer-'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this with npm run test:package.');
function run(args: string[], cwd = dir) {
  const r = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}
try {
  const [pack]: Array<{
    filename: string;
    version: string;
    size: number;
    files: Array<{ path: string }>;
  }> = JSON.parse(
    run([npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', dir], root),
  );
  const files = pack.files.map((f) => f.path);
  for (const required of [
    'README.md',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
    'dist/index.js',
    'dist/index.cjs',
    'dist/index.d.ts',
    'dist/index.d.cts',
    'dist/cli.js',
  ])
    assert.ok(files.includes(required), required);
  assert.ok(!files.some((f) => /node_modules|qa-dist|test-results|\.env/.test(f)));
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'laser-joints-consumer', private: true, type: 'module' }),
  );
  run([
    npmCli,
    'install',
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    join(dir, pack.filename),
  ]);
  const source = `import {createBox,toSvg,createFingerJointPair} from '@mylasertools/laser-joints';
const b=createBox({innerWidthMm:90,innerDepthMm:65,innerHeightMm:45,thicknessMm:3,kerfMm:.15,clearanceMm:.08});
if(b.panels.length!==5||!toSvg(b).includes('<svg'))throw Error('Box import failed');
const j=createFingerJointPair({lengthMm:100,thicknessMm:3,kerfMm:.15,clearanceMm:.08,key:'left'});
if(j.pattern?.key!=='left')throw Error('Key failed');`;
  await writeFile(join(dir, 'consumer.mjs'), source);
  run(['consumer.mjs']);
  await writeFile(
    join(dir, 'consumer.cjs'),
    source.replace(
      "import {createBox,toSvg,createFingerJointPair} from '@mylasertools/laser-joints';",
      "const {createBox,toSvg,createFingerJointPair}=require('@mylasertools/laser-joints');",
    ),
  );
  run(['consumer.cjs']);
  // The same ES import syntax in .cts exercises require-condition declarations.
  for (const ext of ['mts', 'cts']) await writeFile(join(dir, `consumer.${ext}`), source);
  run([
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--module',
    'nodenext',
    '--moduleResolution',
    'nodenext',
    '--target',
    'es2020',
    'consumer.mts',
    'consumer.cts',
  ]);
  const config = { lengthMm: 100, thicknessMm: 3, kerfMm: 0.15, clearanceMm: 0.08 };
  await writeFile(join(dir, 'config.json'), JSON.stringify(config));
  const result = JSON.parse(
    run(['node_modules/@mylasertools/laser-joints/dist/cli.js', 'finger', 'config.json']),
  );
  assert.equal(result.kind, 'finger');
  const binResult = JSON.parse(
    run([npmCli, 'exec', '--offline', '--no', '--', 'laser-joints', 'finger', 'config.json']),
  );
  assert.equal(binResult.kind, 'finger');
  const installed = JSON.parse(
    await readFile(join(dir, 'node_modules/@mylasertools/laser-joints/package.json'), 'utf8'),
  );
  assert.equal(installed.version, pack.version);
  console.log(
    `Packed ${pack.filename}: ${files.length} files, ${pack.size} bytes. Offline install, ESM, CJS, both TypeScript modes, and CLI passed.`,
  );
} finally {
  if (dirname(dir) !== parent || !dir.startsWith(join(parent, 'consumer-')))
    throw Error('Unexpected temporary path');
  await rm(dir, { recursive: true, force: true });
}
