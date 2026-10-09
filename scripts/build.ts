import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('dist', { recursive: true });
for (const format of ['esm', 'cjs'] as const)
  await build({
    entryPoints: ['src/index.ts'],
    outfile: `dist/index.${format === 'esm' ? 'js' : 'cjs'}`,
    bundle: true,
    minify: true,
    format,
    platform: 'neutral',
    target: 'es2020',
    legalComments: 'eof',
    banner: {
      js: '/*! @mylasertools/laser-joints | MIT. Includes Clipper2 (Angus Johnson; TS port Jeremy Tribby), BSL-1.0, and BoxBurner spacing (Sean Connelly), 0BSD. See ../THIRD-PARTY-NOTICES.md. */',
    },
  });
for (const name of await readdir('dist'))
  if (name.endsWith('.d.ts')) {
    const source = await readFile(`dist/${name}`, 'utf8');
    await writeFile(
      `dist/${name.replace('.d.ts', '.d.cts')}`,
      source.replaceAll(".js'", ".cjs'").replaceAll('.js"', '.cjs"'),
    );
  }
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  format: 'esm',
  platform: 'node',
  target: 'node20',
});
