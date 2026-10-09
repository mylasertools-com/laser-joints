import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFingerJointPair,
  createTabSlotJoint,
  createCrossLapJoint,
  createFitTest,
  estimateFit,
  toSvg,
  placeEdge,
  JointError,
} from '../dist/index.js';
import type { Point, IssueCode } from '../src/types.js';
import { defined, unchecked } from './helpers.js';

const base = { thicknessMm: 3, kerfMm: 0.15, clearanceMm: 0.05 };
test('sparse JavaScript arrays fail with structured diagnostics', () => {
  assert.throws(
    () =>
      createFitTest({ thicknessMm: 3, kerfMm: 0.15, tabWidthMm: 12, clearancesMm: new Array(3) }),
    JointError,
  );
  assert.throws(
    () =>
      placeEdge(
        {
          points: new Array<Point>(3),
          pathData: '',
          closed: false,
          compensation: 'none',
          materialSide: 'positive-y',
        },
        { origin: [0, 0] },
      ),
    JointError,
  );
});
test('SVG carries keyed pattern and diagnostic provenance', () => {
  const svg = toSvg(createFingerJointPair({ ...base, lengthMm: 100, key: 'front-left' }));
  assert.match(svg, /front-left/);
  assert.match(svg, /SHARP_INTERNAL_CORNERS/);
});
const near = (a: number, b: number, tol = 0.000005) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
// Independent scanline measurement of the emitted polygon, followed by beam removal.
function intersections(points: readonly Point[] | undefined, y: number) {
  assert.ok(points);
  const xs = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
      xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return xs.sort((a, b) => a - b);
}
function checkSimple(points: readonly Point[] | undefined) {
  assert.ok(points);
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) {
    assert.ok(points[i].every(Number.isFinite));
    const a = points[i],
      b = points[(i + 1) % points.length];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-7, 'zero-length edge');
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      assert.ok(
        !(cross(a, b, c) * cross(a, b, d) < -1e-10 && cross(c, d, a) * cross(c, d, b) < -1e-10),
        'self-intersection',
      );
    }
  }
}
test('BoxBurner spacing reference: preserves target width and centers remaining space', () => {
  const r = createFingerJointPair({
    ...base,
    lengthMm: 100,
    targetFingerWidthMm: 6,
    endMarginMm: 4.5,
  });
  assert.equal(r.measurements.fingerCount, 8);
  assert.equal(r.measurements.endMarginMm, 5);
  const xs = intersections(r.sideA.contours[0].nominal.points, 1.5);
  assert.deepEqual(xs, [5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71, 77, 83, 89, 95]);
});
test('after beam removal, both mating dimensions match the specified total clearance', () => {
  for (const clearance of [-0.1, 0, 0.05, 0.4])
    for (const [ka, kb] of [
      [0, 0],
      [0.15, 0.25],
      [0.35, 0.07],
    ]) {
      const r = createFingerJointPair({
        ...base,
        clearanceMm: clearance,
        kerfMm: { sideA: ka, sideB: kb },
        mateThicknessMm: 4,
        lengthMm: 97,
        targetFingerWidthMm: 7,
        leadInMm: 0.3,
      });
      const a = intersections(r.sideA.contours[0].toolpath.points, 2);
      const b = intersections(r.sideB.contours[0].toolpath.points, 1.5);
      const w = r.measurements.fingerWidthMm;
      for (let i = 0; i < a.length; i += 2) {
        const finishedFinger = a[i + 1] - a[i] - ka;
        const finishedSocket = b[i + 2] - b[i + 1] + kb;
        near(finishedFinger, w);
        near(finishedSocket - finishedFinger, clearance);
      }
      near(r.measurements.depthAMm, 4);
      near(r.measurements.depthBMm, 3);
    }
});
test('tab-slot distinguishes cut tab width from uncut sheet thickness', () => {
  const r = createTabSlotJoint({
    ...base,
    thicknessMm: 2.85,
    mateThicknessMm: 4,
    tabWidthMm: 12,
    kerfMm: { sideA: 0.12, sideB: 0.22 },
    clearanceMm: 0.07,
    leadInMm: 0.4,
  });
  const xs = intersections(r.sideA.contours[0].toolpath.points, -2);
  const slot = defined(r.sideB.contours.find((c) => c.role === 'hole')).toolpath.bounds;
  near(xs[1] - xs[0] - 0.12, 12);
  near(slot.width + 0.22 - 12, 0.07);
  near(slot.height + 0.22 - 2.85, 0.07);
  near(r.measurements.tabDepthMm, 4);
});
test('rounded end relief preserves full slot height over the specified gauge width', () => {
  const r = createTabSlotJoint({ ...base, tabWidthMm: 12, slotEndReliefMm: 0.5 });
  const hole = defined(r.sideB.contours.find((c) => c.role === 'hole'));
  near(hole.nominal.bounds.width, 13.05);
  near(hole.toolpath.bounds.width, 12.9);
  near(hole.toolpath.bounds.height, 2.9);
  assert.match(hole.toolpath.pathData, /A0.425 0.425/);
  near(r.fits.width.nominalClearanceMm, 1.05); // Relief adds lateral play; never hide it.
});
test('cross lap uses the OTHER sheet thickness and opposing half-depth slots', () => {
  const r = createCrossLapJoint({
    ...base,
    mateThicknessMm: 5,
    heightMm: 40,
    depthClearanceMm: 0.2,
    kerfMm: { sideA: 0.1, sideB: 0.2 },
  });
  near(r.measurements.notchWidthAMm, 5.05);
  near(r.measurements.notchWidthBMm, 3.05);
  near(2 * r.measurements.depthMm, 40.2);
  const a = intersections(r.sideA.contours[0].toolpath.points, 10);
  const b = intersections(r.sideB.contours[0].toolpath.points, 30);
  near(a[2] - a[1] + 0.1, 5.05);
  near(b[2] - b[1] + 0.2, 3.05);
  near(r.fits.sideA.nominalClearanceMm, 0.05);
  near(r.fits.sideB.nominalClearanceMm, 0.05);
});
test('CAM mode keeps nominal contours and explicitly reports required offsets', () => {
  const r = createTabSlotJoint({
    ...base,
    tabWidthMm: 12,
    compensation: 'cam',
    kerfMm: { sideA: 0.2, sideB: 0.3 },
  });
  for (const p of [r.sideA, r.sideB])
    for (const c of p.contours) assert.deepEqual(c.nominal, c.toolpath);
  assert.deepEqual(r.machining.additionalOffsetMm, { sideA: 0.1, sideB: 0.15 });
  assert.ok(r.issues.some((i) => i.code === 'CAM_COMPENSATION_REQUIRED'));
});
test('worst-case tolerance stack includes both dimensions', () => {
  assert.deepEqual(
    estimateFit({ maleMm: 3, femaleMm: 3.05, maleToleranceMm: 0.08, femaleToleranceMm: 0.02 }),
    {
      nominalClearanceMm: 3.05 - 3,
      minimumClearanceMm: 3.05 - 3 - 0.08 - 0.02,
      maximumClearanceMm: 3.05 - 3 + 0.08 + 0.02,
      classification: 'transition',
    },
  );
  for (const [female, kind] of [
    [2.9, 'interference'],
    [3, 'line-to-line'],
    [3.1, 'clearance'],
  ] as const)
    assert.equal(estimateFit({ maleMm: 3, femaleMm: female }).classification, kind);
  const r = createTabSlotJoint({
    ...base,
    tabWidthMm: 10,
    tolerances: { thicknessMm: 0.1, cutMm: 0.02 },
  });
  near(r.fits.thickness.minimumClearanceMm, -0.07);
  assert.ok(r.issues.some((i) => i.code === 'FIT_RANGE_CROSSES_ZERO'));
});
test('interference stays explicit, with a separate brittle-material warning', () => {
  const r = createTabSlotJoint({
    ...base,
    tabWidthMm: 12,
    clearanceMm: -0.1,
    brittleMaterial: true,
  });
  assert.equal(r.fits.thickness.classification, 'interference');
  assert.ok(r.issues.some((i) => i.code === 'BRITTLE_INTERFERENCE'));
});
test('deterministic property sweep: simple contours, preserved dimensions, immutable inputs', () => {
  let seed = 231;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let sample = 0; sample < 180; sample++) {
    const thickness = 1 + rand() * 8,
      ka = 0.03 + rand() * 0.32,
      kb = 0.03 + rand() * 0.32,
      clearance = -0.08 + rand() * 0.35;
    const options = {
      thicknessMm: thickness,
      mateThicknessMm: 1 + rand() * 8,
      kerfMm: { sideA: ka, sideB: kb },
      clearanceMm: clearance,
      lengthMm: 80 + rand() * 120,
      fingerCount: 1 + Math.floor(rand() * 9),
      endMarginMm: 6,
    };
    const before = JSON.stringify(options);
    const r = createFingerJointPair(options);
    assert.equal(JSON.stringify(options), before);
    assert.deepEqual(createFingerJointPair(options), r);
    const a = intersections(r.sideA.contours[0].toolpath.points, r.measurements.depthAMm / 2);
    const b = intersections(r.sideB.contours[0].toolpath.points, r.measurements.depthBMm / 2);
    assert.equal(a.length, options.fingerCount * 2);
    for (let i = 0; i < a.length; i += 2)
      near(b[i + 2] - b[i + 1] + kb - (a[i + 1] - a[i] - ka), clearance, 0.00001);
    for (const p of [r.sideA, r.sideB])
      for (const c of p.contours) {
        checkSimple(c.nominal.points);
        checkSimple(c.toolpath.points);
        assert.ok(c.toolpath.pathData.endsWith('Z'));
      }
  }
});
test('128-finger bound remains usable and finite', () => {
  const r = createFingerJointPair({ ...base, lengthMm: 2000, fingerCount: 128 });
  assert.equal(r.measurements.fingerCount, 128);
  checkSimple(r.sideA.contours[0].toolpath.points);
});
test('edge placement is rigid, reversible in traversal, and preserves the material normal', () => {
  const r = createFingerJointPair({ ...base, lengthMm: 100 });
  const placed = placeEdge(r.edges.sideA, { origin: [10, 20], angleDeg: 90, reverse: true });
  const original = defined(r.edges.sideA.points.at(-1));
  near(placed.points[0][0], 10 - original[1]);
  near(placed.points[0][1], 20 + original[0]);
  near(placed.materialNormal[0], -1);
  near(placed.materialNormal[1], 0);
  assert.equal(placed.materialSide, 'right');
});
test('SVG output has explicit mm, closed cut contours, escaped metadata, and inner cuts first', () => {
  const r = createTabSlotJoint({ ...base, tabWidthMm: 12 });
  const svg = toSvg(r, { title: 'A < B & "C"' });
  assert.match(svg, /width="[\d.]+mm" height="[\d.]+mm"/);
  assert.match(svg, /<title>A &lt; B &amp; &quot;C&quot;<\/title>/);
  assert.equal((svg.match(/<path /g) || []).length, 3);
  assert.ok(svg.indexOf('id="sample-0-sideB-slot"') < svg.indexOf('id="sample-0-sideB-outline"'));
  assert.doesNotMatch(svg, /<text|<script|NaN|Infinity/);
  assert.match(svg, /additionalOffsetMm&quot;:\{&quot;sideA&quot;:0,&quot;sideB&quot;:0\}/);
  assert.match(toSvg(r, { geometry: 'nominal' }), /compensation&quot;:&quot;cam&quot;/);
});
test('calibration preserves caller order and records exact pair fit data', () => {
  const options = {
    thicknessMm: 3,
    kerfMm: 0.15,
    tabWidthMm: 12,
    clearancesMm: [-0.05, 0, 0.05, 0.1],
  };
  const r = createFitTest(options);
  assert.deepEqual(
    r.manifest.map((m) => m.clearanceMm),
    options.clearancesMm,
  );
  assert.equal((r.svg.match(/<path /g) || []).length, 12);
  assert.equal(r.samples.length, 4);
});
const invalidCases: Array<[string, () => unknown, IssueCode]> = [
  ['NaN', () => createFingerJointPair({ ...base, lengthMm: NaN }), 'INVALID_INPUT'],
  ['Infinity', () => createTabSlotJoint({ ...base, tabWidthMm: Infinity }), 'INVALID_INPUT'],
  [
    'numeric string',
    () => unchecked(createTabSlotJoint, { ...base, tabWidthMm: '12' }),
    'INVALID_INPUT',
  ],
  [
    'unknown field',
    () => unchecked(createTabSlotJoint, { ...base, tabWidthMm: 12, kerf: 0.1 }),
    'UNKNOWN_OPTION',
  ],
  [
    'null optional',
    () => unchecked(createTabSlotJoint, { ...base, tabWidthMm: 12, leadInMm: null }),
    'INVALID_INPUT',
  ],
  [
    'missing kerf',
    () => unchecked(createTabSlotJoint, { thicknessMm: 3, clearanceMm: 0, tabWidthMm: 12 }),
    'INVALID_INPUT',
  ],
  [
    'negative thickness',
    () => createTabSlotJoint({ ...base, thicknessMm: -3, tabWidthMm: 12 }),
    'OUT_OF_RANGE',
  ],
  [
    'zero material',
    () => createTabSlotJoint({ ...base, thicknessMm: 0, tabWidthMm: 12 }),
    'OUT_OF_RANGE',
  ],
  [
    'ambiguous spacing',
    () => createFingerJointPair({ ...base, lengthMm: 100, fingerCount: 4, targetFingerWidthMm: 6 }),
    'INVALID_INPUT',
  ],
  [
    'fractional count',
    () => createFingerJointPair({ ...base, lengthMm: 100, fingerCount: 2.5 }),
    'INVALID_INPUT',
  ],
  [
    'unbounded count',
    () => createFingerJointPair({ ...base, lengthMm: 100, fingerCount: 129 }),
    'OUT_OF_RANGE',
  ],
  ['too short', () => createFingerJointPair({ ...base, lengthMm: 5 }), 'IMPOSSIBLE_GEOMETRY'],
  [
    'oversized target',
    () => createFingerJointPair({ ...base, lengthMm: 20, targetFingerWidthMm: 30 }),
    'IMPOSSIBLE_GEOMETRY',
  ],
  [
    'overlapping recesses',
    () => createFingerJointPair({ ...base, lengthMm: 100, targetFingerWidthMm: 6, clearanceMm: 6 }),
    'IMPOSSIBLE_GEOMETRY',
  ],
  [
    'kerf consumes slot',
    () => createTabSlotJoint({ ...base, tabWidthMm: 12, kerfMm: 4 }),
    'IMPOSSIBLE_GEOMETRY',
  ],
  ['tiny feature', () => createTabSlotJoint({ ...base, tabWidthMm: 0.000001 }), 'OUT_OF_RANGE'],
  [
    'minimum web',
    () => createCrossLapJoint({ ...base, heightMm: 10, minWebMm: 6 }),
    'WEB_TOO_SMALL',
  ],
  [
    'minimum feature',
    () => createTabSlotJoint({ ...base, tabWidthMm: 2, minFeatureMm: 4 }),
    'FEATURE_TOO_SMALL',
  ],
  [
    'tip disappears',
    () => createTabSlotJoint({ ...base, tabWidthMm: 4, leadInMm: 2 }),
    'IMPOSSIBLE_GEOMETRY',
  ],
  [
    'engagement disappears',
    () => createTabSlotJoint({ ...base, tabWidthMm: 12, leadInMm: 3 }),
    'IMPOSSIBLE_GEOMETRY',
  ],
  [
    'relief too round',
    () => createTabSlotJoint({ ...base, tabWidthMm: 12, slotEndReliefMm: 2 }),
    'OUT_OF_RANGE',
  ],
  [
    'relief below beam radius',
    () => createTabSlotJoint({ ...base, tabWidthMm: 12, slotEndReliefMm: 0.01 }),
    'FEATURE_TOO_SMALL',
  ],
  [
    'invalid compensation',
    () => unchecked(createTabSlotJoint, { ...base, tabWidthMm: 12, compensation: 'both' }),
    'INVALID_INPUT',
  ],
  [
    'bad tolerance',
    () => estimateFit({ maleMm: 3, femaleMm: 3, maleToleranceMm: 3 }),
    'OUT_OF_RANGE',
  ],
  [
    'duplicate calibration',
    () => createFitTest({ thicknessMm: 3, kerfMm: 0.1, tabWidthMm: 12, clearancesMm: [0, 0] }),
    'INVALID_INPUT',
  ],
  [
    'excess calibration',
    () =>
      createFitTest({
        thicknessMm: 3,
        kerfMm: 0.1,
        tabWidthMm: 12,
        clearancesMm: Array(22).fill(0),
      }),
    'LIMIT_EXCEEDED',
  ],
];
for (const [label, fn, code] of invalidCases)
  test(`rejects ${label} with a structured error`, () =>
    assert.throws(
      fn,
      (e) =>
        e instanceof JointError && e.code === code && e.toJSON().issues[0].severity === 'error',
    ));
