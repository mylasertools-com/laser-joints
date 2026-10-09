#!/usr/bin/env node
import { open, writeFile } from 'node:fs/promises';
import {
  createFingerJointPair,
  createTabSlotJoint,
  createCrossLapJoint,
  createDovetailJointPair,
  createFitTest,
  createBox,
  toSvg,
  JointError,
} from './index.js';
import type {
  FingerJointOptions,
  TabSlotOptions,
  CrossLapOptions,
  DovetailOptions,
  FitTestOptions,
  BoxOptions,
  JointResult,
  BoxResult,
  FitTestResult,
} from './types.js';

// The public generators validate unknown JSON at runtime. Assertions are confined
// to this input boundary; downstream result handling stays a checked union.
function generate(kind: string, input: unknown): JointResult | BoxResult | FitTestResult {
  switch (kind) {
    case 'finger':
      return createFingerJointPair(input as FingerJointOptions);
    case 'tab-slot':
      return createTabSlotJoint(input as TabSlotOptions);
    case 'cross-lap':
      return createCrossLapJoint(input as CrossLapOptions);
    case 'dovetail':
      return createDovetailJointPair(input as DovetailOptions);
    case 'calibration':
      return createFitTest(input as FitTestOptions);
    case 'box':
      return createBox(input as BoxOptions);
    default:
      throw new SyntaxError(help);
  }
}

const help = `laser-joints <finger|tab-slot|cross-lap|dovetail|box|calibration> <config.json|-> [--format json|svg] [--output file]\n\nAll dimensions are millimetres. JSON is the default. Use - for stdin.\nExisting output files are never overwritten. Geometry errors exit 2; I/O errors exit 1.\nExamples:\n  laser-joints finger examples/box-corner.json --format svg --output corner.svg\n  laser-joints calibration examples/calibration.json --format json\n`;
const MAX_BYTES = 64 * 1024;
async function readInput(file: string) {
  if (file === '-') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('Input exceeds 64 KiB.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw new Error('Input must be a regular JSON file at most 64 KiB.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_BYTES) throw new Error('Input exceeds 64 KiB.');
    return buffer.subarray(0, length).toString('utf8');
  } finally {
    await handle.close();
  }
}
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(help);
  } else {
    const [kind, file, ...rest] = args;
    if (
      !kind ||
      !['finger', 'tab-slot', 'cross-lap', 'dovetail', 'calibration', 'box'].includes(kind) ||
      !file
    )
      throw new SyntaxError(help);
    let format = 'json',
      output;
    const seen = new Set();
    for (let i = 0; i < rest.length; i += 2) {
      const flag = rest[i],
        value = rest[i + 1];
      if (!flag || !['--format', '--output'].includes(flag) || !value || seen.has(flag))
        throw new SyntaxError('Invalid or duplicate CLI option.\n' + help);
      seen.add(flag);
      if (flag === '--format') format = value;
      else output = value;
    }
    if (!['json', 'svg'].includes(format)) throw new SyntaxError('format must be json or svg.');
    const options: unknown = JSON.parse(await readInput(file));
    const result = generate(kind, options);
    const body =
      format === 'json'
        ? JSON.stringify(result, null, 2) + '\n'
        : 'svg' in result
          ? result.svg
          : toSvg(result);
    if (output) await writeFile(output, body, { flag: 'wx' });
    else process.stdout.write(body);
    if (format === 'svg') {
      const issues =
        'samples' in result ? result.samples.flatMap((s) => s.joint.issues) : result.issues;
      if (issues.length) process.stderr.write(JSON.stringify({ issues }) + '\n');
    }
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      error instanceof JointError
        ? error.toJSON()
        : {
            code: error instanceof SyntaxError ? 'INVALID_INPUT' : 'IO_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
    ) + '\n',
  );
  process.exitCode = error instanceof JointError || error instanceof SyntaxError ? 2 : 1;
}
