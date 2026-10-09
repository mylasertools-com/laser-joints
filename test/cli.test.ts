import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
const cli = resolve('dist/cli.js');
const call = (args: readonly string[], input: string) =>
  spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
const common = { thicknessMm: 3, kerfMm: 0.15, clearanceMm: 0.08 };
test('CLI generators produce structured JSON and clean cut-only SVG over stdin', () => {
  for (const [kind, extra] of [
    ['finger', { lengthMm: 100, key: 'orientation' }],
    ['tab-slot', { tabWidthMm: 14 }],
    ['cross-lap', { heightMm: 40 }],
    ['dovetail', { neckWidthMm: 10, headWidthMm: 18, depthMm: 8 }],
    ['box', { innerWidthMm: 90, innerDepthMm: 65, innerHeightMm: 45 }],
  ] as const) {
    const input = JSON.stringify({ ...common, ...extra });
    const json = call([kind, '-'], input);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).kind, kind);
    assert.equal(json.stderr, '');
    const svg = call([kind, '-', '--format', 'svg'], input);
    assert.equal(svg.status, 0, svg.stderr);
    assert.ok(svg.stdout.startsWith('<?xml'));
    assert.ok(!svg.stdout.includes('<text'));
    assert.ok(JSON.parse(svg.stderr).issues.length > 0);
  }
});
test('CLI rejects malformed, oversized, unknown, and duplicate input without partial output', () => {
  for (const [args, input, status] of [
    [['finger', '-'], '{', 2],
    [['finger', '-'], 'null', 2],
    [['finger', '-'], JSON.stringify({ ...common, lengthMm: 100, clearnceMm: 0.1 }), 2],
    [['finger', '-', '--format', 'svg', '--format', 'json'], '{}', 2],
    [['finger', '-'], ' '.repeat(65537), 1],
    [['unknown', '-'], '{}', 2],
  ] as const) {
    const r = call(args, input);
    assert.equal(r.status, status, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(JSON.parse(r.stderr).code);
  }
});
test('CLI output does not overwrite existing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'laser-joints-cli-'));
  try {
    const file = join(dir, 'joint.svg'),
      args = ['finger', '-', '--format', 'svg', '--output', file],
      input = JSON.stringify({ ...common, lengthMm: 100 });
    assert.equal(call(args, input).status, 0);
    const original = await readFile(file, 'utf8');
    assert.equal(call(args, input).status, 1);
    assert.equal(await readFile(file, 'utf8'), original);
  } finally {
    if (dirname(dir) !== resolve(tmpdir()) || !dir.includes('laser-joints-cli-'))
      throw new Error('Unexpected temp path');
    await rm(dir, { recursive: true, force: true });
  }
});
