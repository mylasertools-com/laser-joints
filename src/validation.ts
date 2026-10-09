import type { CommonOptions, Issue, IssueCode } from './types.js';

export const EPS = 0.000002;
export const MAX_DIMENSION = 100_000;
export const MAX_FINGERS = 128;
export class JointError extends Error {
  readonly code: IssueCode;
  readonly issues: readonly Issue[];
  constructor(issue: Issue) {
    super(issue.message);
    this.name = 'JointError';
    this.code = issue.code;
    this.issues = [issue];
  }
  toJSON() {
    return { name: this.name, code: this.code, message: this.message, issues: this.issues };
  }
}
export function fail(code: IssueCode, message: string, field?: string): never {
  throw new JointError({ code, severity: 'error', message, ...(field ? { field } : {}) });
}
export function object(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail('INVALID_INPUT', `${field} must be an object.`, field);
}
export function keys(value: unknown, allowed: readonly string[], field = 'options'): void {
  object(value, field);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      fail('UNKNOWN_OPTION', `Unknown option ${field}.${key}.`, `${field}.${key}`);
    if (value[key] === null)
      fail('INVALID_INPUT', `${field}.${key} cannot be null.`, `${field}.${key}`);
  }
}
export function number(value: unknown, field: string, min = 0, max = MAX_DIMENSION): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail('INVALID_INPUT', `${field} must be a finite number.`, field);
  if (value < min || value > max)
    fail('OUT_OF_RANGE', `${field} must be between ${min} and ${max}.`, field);
  return value;
}
export function positive(value: unknown, field: string): number {
  const n = number(value, field);
  if (n <= EPS) fail('OUT_OF_RANGE', `${field} must be greater than ${EPS} mm.`, field);
  return n;
}
export function feature(actual: number, minimum: number, field: string, web = false): void {
  if (actual <= EPS)
    fail('IMPOSSIBLE_GEOMETRY', `${field} has no remaining width or depth.`, field);
  if (actual + EPS < minimum) {
    throw new JointError({
      code: web ? 'WEB_TOO_SMALL' : 'FEATURE_TOO_SMALL',
      severity: 'error',
      message: `${field} is ${actual} mm; the requested minimum is ${minimum} mm.`,
      field,
      actualMm: actual,
      limitMm: minimum,
    });
  }
}
export const COMMON_KEYS = [
  'thicknessMm',
  'mateThicknessMm',
  'kerfMm',
  'clearanceMm',
  'compensation',
  'minFeatureMm',
  'minWebMm',
  'brittleMaterial',
  'tolerances',
];
export function common(o: CommonOptions) {
  const a = positive(o.thicknessMm, 'thicknessMm');
  const b = positive(o.mateThicknessMm ?? a, 'mateThicknessMm');
  const clearance = number(o.clearanceMm, 'clearanceMm', -MAX_DIMENSION);
  const mode = o.compensation ?? 'geometry';
  if (mode !== 'geometry' && mode !== 'cam')
    fail('INVALID_INPUT', 'compensation must be geometry or cam.', 'compensation');
  let ka: number, kb: number;
  if (typeof o.kerfMm === 'number') ka = kb = number(o.kerfMm, 'kerfMm');
  else {
    keys(o.kerfMm, ['sideA', 'sideB'], 'kerfMm');
    ka = number(o.kerfMm.sideA, 'kerfMm.sideA');
    kb = number(o.kerfMm.sideB, 'kerfMm.sideB');
  }
  if (o.brittleMaterial !== undefined && typeof o.brittleMaterial !== 'boolean')
    fail('INVALID_INPUT', 'brittleMaterial must be boolean.', 'brittleMaterial');
  if (o.tolerances !== undefined) keys(o.tolerances, ['thicknessMm', 'cutMm'], 'tolerances');
  const thicknessTolerance = number(o.tolerances?.thicknessMm ?? 0, 'tolerances.thicknessMm');
  const cutTolerance = number(o.tolerances?.cutMm ?? 0, 'tolerances.cutMm');
  if (thicknessTolerance >= Math.min(a, b))
    fail(
      'OUT_OF_RANGE',
      'Thickness tolerance must be smaller than both material thicknesses.',
      'tolerances.thicknessMm',
    );
  const minFeature = number(o.minFeatureMm ?? 0, 'minFeatureMm');
  const minWeb = number(o.minWebMm ?? 0, 'minWebMm');
  const issues: Issue[] = [];
  if (clearance < 0)
    issues.push({
      code: 'INTERFERENCE_FIT',
      severity: 'warning',
      message:
        'Negative clearance specifies interference. Calibrate on the actual material before using this fit.',
    });
  if (clearance < 0 && o.brittleMaterial)
    issues.push({
      code: 'BRITTLE_INTERFERENCE',
      severity: 'warning',
      message: 'Interference in a brittle material can crack the part. Use a measured fit coupon.',
    });
  if (mode === 'cam' && (ka > 0 || kb > 0))
    issues.push({
      code: 'CAM_COMPENSATION_REQUIRED',
      severity: 'warning',
      message:
        'These contours are nominal. Apply the reported per-side offsets in CAM, outward on outlines and inward on holes.',
    });
  return {
    a,
    b,
    clearance,
    ka,
    kb,
    mode,
    minFeature,
    minWeb,
    thicknessTolerance,
    cutTolerance,
    issues,
  };
}
