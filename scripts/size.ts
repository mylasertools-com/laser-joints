import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
for (const file of ['index.js', 'index.cjs']) {
  const bytes = gzipSync(await readFile(`dist/${file}`)).length;
  console.log(`${file}: ${bytes} bytes gzip (includes Clipper2).`);
  if (bytes > 65_536) throw new Error('Bundle exceeds 64 KiB gzip budget.');
}
