import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['demo/app.ts'],
  outfile: 'demo/dist/app.js',
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
});
await copyFile('THIRD-PARTY-NOTICES.md', 'demo/dist/THIRD-PARTY-NOTICES.md');
console.log('Built the offline demo.');
