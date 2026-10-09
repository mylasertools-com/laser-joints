import type { FitTestOptions, FitTestResult } from './types.js';
import { createTabSlotJoint, TAB_KEYS } from './joints.js';
import { keys, fail, number } from './validation.js';
import { toSvg } from './svg.js';

export function createFitTest(options: FitTestOptions): FitTestResult {
  keys(options, [...TAB_KEYS.filter((k) => k !== 'clearanceMm'), 'clearancesMm']);
  const { clearancesMm, ...base } = options;
  if (!Array.isArray(clearancesMm) || clearancesMm.length < 1 || clearancesMm.length > 21)
    fail('LIMIT_EXCEEDED', 'clearancesMm must contain 1–21 values.', 'clearancesMm');
  const seen = new Set<number>();
  const samples = Array.from(clearancesMm, (clearanceMm, index) => {
    number(clearanceMm, `clearancesMm[${index}]`, -100_000);
    if (seen.has(clearanceMm))
      fail(
        'INVALID_INPUT',
        'Duplicate clearance values make calibration ambiguous.',
        'clearancesMm',
      );
    seen.add(clearanceMm);
    return { index, clearanceMm, joint: createTabSlotJoint({ ...base, clearanceMm }) };
  });
  return {
    schemaVersion: 1,
    units: 'mm',
    samples,
    svg: toSvg(
      samples.map((s) => s.joint),
      { title: 'Fit calibration — pairs in manifest order' },
    ),
    manifest: samples.map(({ index, clearanceMm, joint }) => ({
      index,
      clearanceMm,
      fits: joint.fits,
    })),
  };
}
