import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('.'),
  port = Number(process.env.PORT || 4178);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') {
      res.writeHead(302, { location: '/demo/' }).end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + pathname);
    if (
      !file.startsWith(root + sep) ||
      !['/demo/', '/dist/', '/docs/', '/examples/'].some((p) => pathname.startsWith(p)) ||
      pathname.split('/').some((p) => p.startsWith('.'))
    ) {
      res.writeHead(403).end();
      return;
    }
    if (!(await stat(file)).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Laser Joints demo: http://127.0.0.1:${port}/`));
