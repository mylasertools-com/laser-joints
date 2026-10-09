import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
const port = 4180,
  base = `http://127.0.0.1:${port}`;
await mkdir('docs/assets', { recursive: true });
await mkdir('qa-dist/frames', { recursive: true });
const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve.ts'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'pipe',
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/demo/')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error('Capture server did not start.');
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/demo/');
  await page.waitForFunction(() => window.laserJointsDemo?.getView() === '3d');
  await page.screenshot({ path: 'docs/assets/demo.png' });
  for (let i = 0; i < 48; i++) {
    await page.evaluate(
      (v) => window.laserJointsDemo.setExplosion(v),
      (1 - Math.cos((i / 47) * Math.PI * 2)) * 50,
    );
    await page
      .locator('#stage')
      .screenshot({ path: `qa-dist/frames/box-${String(i).padStart(3, '0')}.png` });
  }
  await page.locator('[data-kind="keyed"]').click();
  for (const [i, key] of ['front-left', 'front-right', 'shelf-1', 'divider-A'].entries()) {
    await page.locator('#key').fill(key);
    await page
      .locator('.preview-panel')
      .screenshot({ path: `qa-dist/frames/key-${String(i).padStart(3, '0')}.png` });
  }
  await page.locator('[data-kind="dovetail"]').click();
  await page.locator('.preview-panel').screenshot({ path: 'docs/assets/dovetail.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-kind="box"]').click();
  await page.screenshot({ path: 'docs/assets/mobile.png', fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  for (const [name, rate, file, width] of [
    ['box', 12, 'assembly', 840],
    ['key', 0.6, 'keyed-fingers', 840],
  ]) {
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        String(rate),
        '-i',
        `qa-dist/frames/${name}-%03d.png`,
        '-filter_complex',
        `[0:v]scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`,
        '-loop',
        '0',
        `docs/assets/${file}.gif`,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw Error(r.stderr || 'Install ffmpeg to create GIFs.');
  }
  console.log('Captured real preview screenshots and assembly/keyed GIFs in docs/assets.');
} finally {
  await browser?.close();
  server.kill();
}
