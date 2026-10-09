import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defined } from '../helpers.js';

test('all six examples render, export, and recover from invalid input', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demo/');
  for (const [kind, field] of [
    ['box', 'innerWidthMm'],
    ['finger', 'lengthMm'],
    ['keyed', 'lengthMm'],
    ['tab-slot', 'tabWidthMm'],
    ['cross-lap', 'heightMm'],
    ['dovetail', 'neckWidthMm'],
  ]) {
    await page.locator(`[data-kind="${kind}"]`).click();
    await expect(page.locator('#status')).toHaveText('Geometry ready');
    const result = await page.evaluate(() => window.laserJointsDemo.getResult());
    expect(result?.kind).toBe(kind === 'keyed' ? 'finger' : kind);
    if (kind === 'box') await page.locator('#view-sheet').click();
    await expect(page.locator('#sheet-view svg')).toBeVisible();
    await page.locator('#show-toolpath').check();
    expect(await page.locator('#sheet-view path').count()).toBeGreaterThan(2);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-svg').click();
    const download = await downloadPromise;
    const svg = await readFile(defined(await download.path()), 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<metadata>');
    expect(svg).not.toContain('<text');
    expect(svg).not.toMatch(/NaN|Infinity/);
    await page.locator(`#${field}`).fill('0');
    await expect(page.locator('#stage-error')).toBeVisible();
    await expect(page.locator('#download-svg')).toBeDisabled();
    expect(await page.evaluate(() => window.laserJointsDemo.getResult())).toBeNull();
    await page.locator(`[data-kind="${kind}"]`).click();
    await expect(page.locator('#download-svg')).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('box preview, export metadata, calibration, and responsive layout', async ({
  page,
}, testInfo) => {
  await page.goto('/demo/');
  await expect(page.locator('#status')).toHaveText('Geometry ready');
  // Software WebGL is enabled on Chromium; other engines can use the accessible SVG fallback.
  if (['chromium', 'mobile'].includes(testInfo.project.name)) {
    expect(await page.evaluate(() => window.laserJointsDemo.getView())).toBe('3d');
    await expect(page.locator('#three-view canvas')).toBeVisible();
    await page.locator('#animate').click();
    await expect(page.locator('#animate')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#view-sheet').click();
    await expect(page.locator('#animate')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#view-3d').click();
    await page.evaluate(() => window.laserJointsDemo.setExplosion(60));
  }
  await page.locator('summary').click();
  await page.locator('#cam').check();
  const jp = page.waitForEvent('download');
  await page.locator('#download-json').click();
  const json = JSON.parse(await readFile(defined(await (await jp).path()), 'utf8'));
  expect(json.machining.additionalOffsetMm).toBe(0.075);
  const cp = page.waitForEvent('download');
  await page.locator('#calibration').click();
  const calibration = await readFile(defined(await (await cp).path()), 'utf8');
  expect(calibration).toContain('clearanceMm');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
