import { union, difference, FillRule, area } from 'clipper2-ts';
import type { Path64 } from 'clipper2-ts';
import type { BoxOptions, BoxPanel, BoxResult, Point } from './types.js';
import { contour, bounds, rectangle } from './geometry.js';
import { COMMON_KEYS, MAX_FINGERS, common, fail, feature, keys, positive } from './validation.js';
import { fingerSpans } from './spacing.js';
import { estimateFit } from './fit.js';

// Assembly layout follows BoxBurner's separation of vertical finger seams and a
// raised mortise-and-tenon bottom. The geometry below is composed with Clipper2.
const SCALE = 1_000_000;
const poly = (p: readonly Point[]): Path64 =>
  p.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));
const rect = (x: number, y: number, w: number, h: number) => poly(rectangle(x, y, w, h));
export function createBox(o: BoxOptions): BoxResult {
  keys(o, [
    ...COMMON_KEYS.filter((k) => k !== 'mateThicknessMm'),
    'innerWidthMm',
    'innerDepthMm',
    'innerHeightMm',
    'fingerWidthMm',
    'baseElevationMm',
  ]);
  if (typeof o.kerfMm !== 'number')
    fail('INVALID_INPUT', 'A box uses one material and one numeric kerfMm.', 'kerfMm');
  const c = common(o),
    t = c.a;
  const iw = positive(o.innerWidthMm, 'innerWidthMm'),
    id = positive(o.innerDepthMm, 'innerDepthMm'),
    ih = positive(o.innerHeightMm, 'innerHeightMm');
  const W = iw + 2 * t,
    D = id + 2 * t;
  const base = positive(o.baseElevationMm ?? 2 * t, 'baseElevationMm'),
    H = ih + base + t;
  const fw = positive(o.fingerWidthMm ?? 2 * t, 'fingerWidthMm');
  feature(fw, c.minFeature, 'fingerWidthMm');
  feature(fw + c.clearance - c.ka, 0, 'finger slot after kerf');
  feature(t + c.clearance - c.ka, 0, 'bottom slot after kerf');
  feature(fw - c.clearance, c.minWeb, 'remaining seam finger', true);
  feature(base - c.clearance / 2, c.minWeb, 'material below bottom slots', true);
  feature(ih - c.clearance / 2, c.minWeb, 'material above bottom slots', true);
  const spans = (length: number) => {
    const margin = 3 * t;
    const count = Math.floor((length - 2 * margin + fw) / (2 * fw));
    if (count < 1)
      fail(
        'IMPOSSIBLE_GEOMETRY',
        'Box dimensions are too small for the requested fingers and corner margins.',
      );
    if (count > MAX_FINGERS)
      fail('LIMIT_EXCEEDED', `Each box edge supports at most ${MAX_FINGERS} fingers.`);
    const s = fingerSpans(length, fw, count, margin);
    feature(s[0]!.start - t - c.clearance / 2, c.minWeb, 'corner-to-slot web', true);
    return s;
  };
  const xs = spans(W),
    ys = spans(D),
    zs = spans(H);
  const bottomParts = [rect(t, t, iw, id)];
  for (const s of xs) {
    bottomParts.push(rect(s.start, 0, fw, t), rect(s.start, D - t, fw, t));
  }
  for (const s of ys) {
    bottomParts.push(rect(0, s.start, t, fw), rect(W - t, s.start, t, fw));
  }
  const bottom = union(bottomParts, FillRule.NonZero);
  function wall(length: number, side: 'A' | 'B', bottomSpans: typeof xs) {
    const cuts: Path64[] = [];
    const cut = (z: number, h: number) =>
      cuts.push(rect(-1, z, t + 1, h), rect(length - t, z, t + 1, h));
    if (side === 'A') {
      let z = 0;
      for (const s of zs) {
        cut(z, s.start - z);
        z = s.end;
      }
      cut(z, H - z);
    } else for (const s of zs) cut(s.start - c.clearance / 2, fw + c.clearance);
    for (const s of bottomSpans)
      cuts.push(
        rect(s.start - c.clearance / 2, base - c.clearance / 2, fw + c.clearance, t + c.clearance),
      );
    return difference([rect(0, 0, length, H)], cuts, FillRule.NonZero);
  }
  function panel(name: BoxPanel['id'], paths: Path64[], assembly: BoxPanel['assembly']): BoxPanel {
    if (paths.filter((p) => area(p) > 0).length !== 1)
      fail('IMPOSSIBLE_GEOMETRY', 'A box panel is disconnected. Adjust the joint dimensions.');
    const contours = paths.map((p, i) =>
      contour(
        `${name}-${i}`,
        p.map((q) => [q.x / SCALE, q.y / SCALE] as Point),
        c.ka,
        c.mode,
        area(p) > 0 ? 'outer' : 'hole',
      ),
    );
    return {
      id: name,
      contours,
      bounds: bounds(
        contours.flatMap((p) => {
          const b = p.toolpath.bounds;
          return [
            [b.x, b.y],
            [b.x + b.width, b.y + b.height],
          ] as Point[];
        }),
      ),
      assembly,
    };
  }
  const front = wall(W, 'A', xs),
    side = wall(D, 'B', ys);
  const panels: BoxPanel[] = [
    panel('bottom', bottom, {
      originMm: [0, 0, base],
      u: [1, 0, 0],
      v: [0, 1, 0],
      normal: [0, 0, 1],
      thicknessMm: t,
    }),
    panel('front', front, {
      originMm: [0, t, 0],
      u: [1, 0, 0],
      v: [0, 0, 1],
      normal: [0, -1, 0],
      thicknessMm: t,
    }),
    panel('back', front, {
      originMm: [0, D, 0],
      u: [1, 0, 0],
      v: [0, 0, 1],
      normal: [0, -1, 0],
      thicknessMm: t,
    }),
    panel('left', side, {
      originMm: [0, 0, 0],
      u: [0, 1, 0],
      v: [0, 0, 1],
      normal: [1, 0, 0],
      thicknessMm: t,
    }),
    panel('right', side, {
      originMm: [W - t, 0, 0],
      u: [0, 1, 0],
      v: [0, 0, 1],
      normal: [1, 0, 0],
      thicknessMm: t,
    }),
  ];
  c.issues.push({
    code: 'SHARP_INTERNAL_CORNERS',
    severity: 'warning',
    message:
      'Box recesses are nominally square. The ideal assembly does not model beam rounding, taper, coating, flex or load capacity. Cut a fit coupon first.',
  });
  const fits = {
    finger: estimateFit({
      maleMm: fw,
      femaleMm: fw + c.clearance,
      maleToleranceMm: c.cutTolerance,
      femaleToleranceMm: c.cutTolerance,
    }),
    bottomThickness: estimateFit({
      maleMm: t,
      femaleMm: t + c.clearance,
      maleToleranceMm: c.thicknessTolerance,
      femaleToleranceMm: c.cutTolerance,
    }),
  };
  for (const [field, value] of Object.entries(fits))
    if (value.classification === 'transition')
      c.issues.push({
        code: 'FIT_RANGE_CROSSES_ZERO',
        severity: 'warning',
        field,
        message: `${field}: the tolerance range crosses zero clearance; some parts may interfere.`,
      });
  return {
    schemaVersion: 1,
    kind: 'box',
    units: 'mm',
    panels,
    dimensions: {
      innerWidthMm: iw,
      innerDepthMm: id,
      innerHeightMm: ih,
      outerWidthMm: W,
      outerDepthMm: D,
      outerHeightMm: H,
      baseElevationMm: base,
      thicknessMm: t,
    },
    clearanceMm: c.clearance,
    fits,
    machining: {
      compensation: c.mode,
      kerfMm: c.ka,
      additionalOffsetMm: c.mode === 'cam' ? c.ka / 2 : 0,
    },
    issues: c.issues,
  };
}
