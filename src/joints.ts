import type {
  CrossLapOptions,
  DovetailOptions,
  FingerJointOptions,
  FitEstimate,
  JointResult,
  Point,
  TabSlotOptions,
} from './types.js';
import {
  COMMON_KEYS,
  EPS,
  MAX_FINGERS,
  common,
  fail,
  feature,
  keys,
  number,
  positive,
} from './validation.js';
import { contour, edge, part, rectangle, roundedHole } from './geometry.js';
import { estimateFit } from './fit.js';
import { fingerSpans } from './spacing.js';

type Context = ReturnType<typeof common>;
const finish = (
  kind: JointResult['kind'],
  c: Context,
  sideA: JointResult['sideA'],
  sideB: JointResult['sideB'],
  edges: JointResult['edges'],
  measurements: JointResult['measurements'],
  fits: Record<string, FitEstimate>,
): JointResult => {
  for (const [field, fit] of Object.entries(fits))
    if (fit.classification === 'transition')
      c.issues.push({
        code: 'FIT_RANGE_CROSSES_ZERO',
        severity: 'warning',
        field,
        message: `${field}: the tolerance range crosses zero clearance; some parts may interfere.`,
      });
  return {
    schemaVersion: 1,
    kind,
    units: 'mm',
    sideA,
    sideB,
    edges,
    measurements,
    fits,
    issues: c.issues,
    machining: {
      compensation: c.mode,
      kerfMm: { sideA: c.ka, sideB: c.kb },
      additionalOffsetMm: {
        sideA: c.mode === 'cam' ? c.ka / 2 : 0,
        sideB: c.mode === 'cam' ? c.kb / 2 : 0,
      },
    },
  };
};
function fit(male: number, female: number, c: Context, material = false) {
  return estimateFit({
    maleMm: male,
    femaleMm: female,
    maleToleranceMm: material ? c.thicknessTolerance : c.cutTolerance,
    femaleToleranceMm: c.cutTolerance,
  });
}
function sharp(c: Context) {
  c.issues.push({
    code: 'SHARP_INTERNAL_CORNERS',
    severity: 'warning',
    message:
      'Nominal square recesses do not model beam rounding, taper or material stress. Test the fit; use relief where appropriate.',
  });
}
function physicalFeature(width: number, c: Context, field: string, kerf: number) {
  feature(width, c.minFeature, field);
  feature(width - kerf, 0, `${field} after kerf`);
}
function leadIn(value: unknown, width: number, depth: number, c: Context) {
  const lead = number(value ?? 0, 'leadInMm');
  if (lead > 0) {
    feature(width - 2 * lead, c.minFeature, 'tipWidthMm');
    feature(depth - lead, 0, 'straightEngagementMm');
  }
  return lead;
}

export function createFingerJointPair(o: FingerJointOptions): JointResult {
  keys(o, [
    ...COMMON_KEYS,
    'lengthMm',
    'targetFingerWidthMm',
    'fingerCount',
    'endMarginMm',
    'bodyDepthMm',
    'depthClearanceMm',
    'leadInMm',
    'key',
  ]);
  const c = common(o),
    length = positive(o.lengthMm, 'lengthMm');
  const margin = positive(o.endMarginMm ?? Math.max(c.a, c.b) * 1.5, 'endMarginMm');
  const usable = length - 2 * margin;
  feature(usable, 0, 'availableEdgeMm');
  if (o.fingerCount !== undefined && o.targetFingerWidthMm !== undefined)
    fail('INVALID_INPUT', 'Choose fingerCount or targetFingerWidthMm, not both.', 'fingerCount');
  let count: number, width: number;
  if (o.fingerCount !== undefined) {
    count = number(o.fingerCount, 'fingerCount', 1, MAX_FINGERS);
    if (!Number.isInteger(count))
      fail('INVALID_INPUT', 'fingerCount must be an integer.', 'fingerCount');
    width = usable / (2 * count - 1);
  } else {
    width = positive(o.targetFingerWidthMm ?? Math.max(c.a, c.b) * 2, 'targetFingerWidthMm');
    count = Math.floor((usable + width + EPS) / (2 * width));
    if (count < 1)
      fail(
        'IMPOSSIBLE_GEOMETRY',
        'The requested finger width does not fit between the end margins.',
        'targetFingerWidthMm',
      );
    if (count > MAX_FINGERS)
      fail(
        'LIMIT_EXCEEDED',
        `A joint supports at most ${MAX_FINGERS} fingers.`,
        'targetFingerWidthMm',
      );
  }
  const extra = number(o.depthClearanceMm ?? 0, 'depthClearanceMm');
  const depthA = c.b,
    depthB = c.a + extra;
  const body = positive(o.bodyDepthMm ?? Math.max(20, 4 * Math.max(depthA, depthB)), 'bodyDepthMm');
  feature(body - depthA, c.minWeb, 'sideA remaining body', true);
  feature(body - depthB, c.minWeb, 'sideB remaining body', true);
  if (
    o.key !== undefined &&
    (typeof o.key !== 'string' ||
      o.key.length < 1 ||
      o.key.length > 64 ||
      !/^[a-zA-Z0-9 _-]+$/.test(o.key))
  )
    fail(
      'INVALID_INPUT',
      'key must be 1–64 ASCII letters, digits, spaces, underscores or hyphens.',
      'key',
    );
  if (o.key !== undefined && count < 3)
    fail('IMPOSSIBLE_GEOMETRY', 'A keyed pattern needs at least three fingers.', 'key');
  const spans = fingerSpans(length, width, count, margin, o.key);
  const end = spans[0]!.start;
  feature(end - c.clearance / 2, c.minWeb, 'sideB end shoulder', true);
  feature(end, c.minWeb, 'sideA end recess', true);
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    physicalFeature(s.end - s.start, c, 'fingerWidthMm', c.ka);
    physicalFeature(s.end - s.start + c.clearance, c, 'slotWidthMm', c.kb);
    if (i > 0) {
      const gap = s.start - spans[i - 1]!.end;
      physicalFeature(gap, c, 'sideA gap width', c.ka);
      feature(gap - c.clearance, c.minWeb, 'sideB finger width', true);
    }
  }
  const minWidth = Math.min(...spans.map((s) => s.end - s.start)),
    maxWidth = Math.max(...spans.map((s) => s.end - s.start));
  const lead = leadIn(o.leadInMm, minWidth, depthA, c);
  const a: Point[] = [[0, depthA]],
    b: Point[] = [[0, 0]];
  for (const s of spans) {
    a.push([s.start, depthA]);
    if (lead > 0) a.push([s.start, lead], [s.start + lead, 0], [s.end - lead, 0], [s.end, lead]);
    else a.push([s.start, 0], [s.end, 0]);
    a.push([s.end, depthA]);
    const x0 = s.start - c.clearance / 2,
      x1 = s.end + c.clearance / 2;
    b.push([x0, 0], [x0, depthB], [x1, depthB], [x1, 0]);
  }
  a.push([length, depthA]);
  b.push([length, 0]);
  if (depthA / minWidth > 3)
    c.issues.push({
      code: 'SLENDER_FINGER',
      severity: 'warning',
      message:
        'Finger depth is more than three times its width. Check material strength and grain direction.',
    });
  sharp(c);
  const result = finish(
    'finger',
    c,
    part('sideA', [contour('outline', [...a, [length, body], [0, body]], c.ka, c.mode)]),
    part('sideB', [contour('outline', [...b, [length, body], [0, body]], c.kb, c.mode)]),
    { sideA: edge(a), sideB: edge(b) },
    {
      lengthMm: length,
      fingerCount: count,
      ...(o.key === undefined
        ? { fingerWidthMm: width, slotWidthMm: width + c.clearance, pitchMm: 2 * width }
        : {}),
      minimumFingerWidthMm: minWidth,
      maximumFingerWidthMm: maxWidth,
      endMarginMm: end,
      depthAMm: depthA,
      depthBMm: depthB,
      bodyDepthMm: body,
      clearanceMm: c.clearance,
      leadInMm: lead,
    },
    { finger: fit(minWidth, minWidth + c.clearance, c) },
  );
  result.pattern = {
    ...(o.key !== undefined ? { key: o.key } : {}),
    fingers: spans.map((s) => ({ startMm: s.start, endMm: s.end })),
  };
  return result;
}

/** Flared coplanar splice; assemble from above, not by pushing in along the sheet. */
export function createDovetailJointPair(o: DovetailOptions): JointResult {
  keys(o, [
    ...COMMON_KEYS,
    'neckWidthMm',
    'headWidthMm',
    'depthMm',
    'shoulderMm',
    'bodyDepthMm',
    'depthClearanceMm',
  ]);
  const c = common(o),
    neck = positive(o.neckWidthMm, 'neckWidthMm'),
    head = positive(o.headWidthMm, 'headWidthMm'),
    depth = positive(o.depthMm, 'depthMm');
  if (head <= neck)
    fail(
      'IMPOSSIBLE_GEOMETRY',
      'headWidthMm must exceed neckWidthMm for a retaining flare.',
      'headWidthMm',
    );
  const shoulder = positive(o.shoulderMm ?? Math.max(6, 2 * c.a), 'shoulderMm');
  const body = positive(
    o.bodyDepthMm ?? Math.max(20, depth + 2 * Math.max(c.a, c.b)),
    'bodyDepthMm',
  );
  const extra = number(o.depthClearanceMm ?? 0, 'depthClearanceMm');
  physicalFeature(neck, c, 'neckWidthMm', c.ka);
  physicalFeature(neck + c.clearance, c, 'socket throat', c.kb);
  const slope = (head - neck) / (2 * depth);
  feature(shoulder - c.clearance / 2 - slope * extra, c.minWeb, 'socket side web', true);
  feature(body - depth - extra, c.minWeb, 'socket back web', true);
  const L = head + 2 * shoulder,
    mid = L / 2;
  const a: Point[] = [
    [0, 0],
    [mid - neck / 2, 0],
    [mid - head / 2, -depth],
    [mid + head / 2, -depth],
    [mid + neck / 2, 0],
    [L, 0],
  ];
  const bn = (neck + c.clearance) / 2,
    bh = (head + c.clearance) / 2 + slope * extra;
  const b: Point[] = [
    [0, 0],
    [mid - bn, 0],
    [mid - bh, depth + extra],
    [mid + bh, depth + extra],
    [mid + bn, 0],
    [L, 0],
  ];
  sharp(c);
  return finish(
    'dovetail',
    c,
    part('sideA', [contour('outline', [...a, [L, body], [0, body]], c.ka, c.mode)]),
    part('sideB', [contour('outline', [...b, [L, body], [0, body]], c.kb, c.mode)]),
    { sideA: edge(a), sideB: edge(b) },
    {
      neckWidthMm: neck,
      headWidthMm: head,
      depthMm: depth,
      depthClearanceMm: extra,
      clearanceMm: c.clearance,
      flareAngleDeg: (Math.atan((head - neck) / 2 / depth) * 180) / Math.PI,
    },
    { throat: fit(neck, neck + c.clearance, c) },
  );
}

export const TAB_KEYS = [
  ...COMMON_KEYS,
  'tabWidthMm',
  'tabDepthMm',
  'shoulderMm',
  'bodyDepthMm',
  'slotBorderMm',
  'slotEndReliefMm',
  'leadInMm',
];
export function createTabSlotJoint(o: TabSlotOptions): JointResult {
  keys(o, TAB_KEYS);
  const c = common(o),
    width = positive(o.tabWidthMm, 'tabWidthMm');
  const depth = positive(o.tabDepthMm ?? c.b, 'tabDepthMm');
  const shoulder = positive(o.shoulderMm ?? Math.max(5, 2 * c.a), 'shoulderMm');
  const body = positive(o.bodyDepthMm ?? Math.max(20, 4 * c.a), 'bodyDepthMm');
  const border = positive(o.slotBorderMm ?? Math.max(5, 2 * c.b), 'slotBorderMm');
  const relief = number(o.slotEndReliefMm ?? 0, 'slotEndReliefMm');
  const lead = leadIn(o.leadInMm, width, depth, c);
  const sw = width + c.clearance,
    sh = c.a + c.clearance;
  physicalFeature(width, c, 'tabWidthMm', c.ka);
  physicalFeature(sw, c, 'slotGaugeWidthMm', c.kb);
  physicalFeature(sh, c, 'slotHeightMm', c.kb);
  feature(shoulder, c.minWeb, 'shoulderMm', true);
  feature(body, c.minWeb, 'bodyDepthMm', true);
  feature(border, c.minWeb, 'slotBorderMm', true);
  if (relief > sh / 2)
    fail(
      'OUT_OF_RANGE',
      'slotEndReliefMm cannot exceed half the finished slot height.',
      'slotEndReliefMm',
    );
  const length = width + 2 * shoulder;
  const a: Point[] = [
    [0, 0],
    [shoulder, 0],
    [shoulder, -depth + lead],
  ];
  if (lead > 0) a.push([shoulder + lead, -depth], [shoulder + width - lead, -depth]);
  else a.push([shoulder + width, -depth]);
  a.push([shoulder + width, -depth + lead], [shoulder + width, 0], [length, 0]);
  const holeWidth = sw + 2 * relief;
  if (relief === 0) sharp(c);
  return finish(
    'tab-slot',
    c,
    part('sideA', [contour('outline', [...a, [length, body], [0, body]], c.ka, c.mode)]),
    part('sideB', [
      contour('outline', rectangle(0, 0, holeWidth + 2 * border, sh + 2 * border), c.kb, c.mode),
      roundedHole('slot', border, border, holeWidth, sh, relief, c.kb, c.mode),
    ]),
    { sideA: edge(a) },
    {
      tabWidthMm: width,
      tabDepthMm: depth,
      tabThicknessMm: c.a,
      receiverThicknessMm: c.b,
      slotGaugeWidthMm: sw,
      slotOverallWidthMm: holeWidth,
      slotHeightMm: sh,
      slotEndReliefMm: relief,
      clearanceMm: c.clearance,
      leadInMm: lead,
    },
    { width: fit(width, holeWidth, c), thickness: fit(c.a, sh, c, true) },
  );
}

export function createCrossLapJoint(o: CrossLapOptions): JointResult {
  keys(o, [...COMMON_KEYS, 'heightMm', 'widthMm', 'depthClearanceMm']);
  const c = common(o),
    height = positive(o.heightMm, 'heightMm');
  const width = positive(o.widthMm ?? Math.max(30, 8 * Math.max(c.a, c.b)), 'widthMm');
  const extra = number(o.depthClearanceMm ?? 0, 'depthClearanceMm');
  const depth = (height + extra) / 2;
  feature(height - depth, c.minWeb, 'remainingWebMm', true);
  const aw = c.b + c.clearance,
    bw = c.a + c.clearance;
  physicalFeature(aw, c, 'sideA notch width', c.ka);
  physicalFeature(bw, c, 'sideB notch width', c.kb);
  feature((width - aw) / 2, c.minWeb, 'sideA shoulder', true);
  feature((width - bw) / 2, c.minWeb, 'sideB shoulder', true);
  const notched = (w: number): Point[] => [
    [0, 0],
    [(width - w) / 2, 0],
    [(width - w) / 2, depth],
    [(width + w) / 2, depth],
    [(width + w) / 2, 0],
    [width, 0],
  ];
  const a = notched(aw),
    b = notched(bw);
  const rotate = (p: Point): Point => [width - p[0], height - p[1]];
  sharp(c);
  return finish(
    'cross-lap',
    c,
    part('sideA', [contour('outline', [...a, [width, height], [0, height]], c.ka, c.mode)]),
    part('sideB', [
      contour(
        'outline',
        [...b, [width, height], [0, height]].map((p) => rotate(p as Point)),
        c.kb,
        c.mode,
      ),
    ]),
    { sideA: edge(a), sideB: edge(b) },
    {
      heightMm: height,
      widthMm: width,
      depthMm: depth,
      depthClearanceMm: extra,
      notchWidthAMm: aw,
      notchWidthBMm: bw,
      clearanceMm: c.clearance,
    },
    { sideA: fit(c.b, aw, c, true), sideB: fit(c.a, bw, c, true) },
  );
}
