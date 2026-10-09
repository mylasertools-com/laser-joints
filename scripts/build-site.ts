import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = resolve('.'),
  destination = resolve('site');
if (dirname(destination) !== root || destination !== resolve(root, 'site'))
  throw Error('Unexpected site destination.');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const path of [
  'demo/index.html',
  'demo/style.css',
  'demo/dist',
  'docs',
  'examples',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
]) {
  await mkdir(dirname(resolve(destination, path)), { recursive: true });
  await cp(path, resolve(destination, path), {
    recursive: true,
  });
}
await writeFile(resolve(destination, '.nojekyll'), '');
await writeFile(
  resolve(destination, 'index.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./demo/"><title>Laser Joints — MyLaserTools</title></head><body><a href="./demo/">Open the Laser Joints demo</a></body></html>\n',
);
console.log('Built the static Pages site in site/.');
