import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBox,
  createFingerJointPair,
  createDovetailJointPair,
  createCrossLapJoint,
  createTabSlotJoint,
  toSvg,
  JointError,
} from '../dist/index.js';
import type { Point, Panel } from '../src/types.js';
import { defined, unchecked } from './helpers.js';
type TestPanel = Panel & {
  assembly: {
    originMm: readonly number[];
    u: readonly number[];
    v: readonly number[];
    normal: readonly number[];
    thicknessMm: number;
  };
};

const near = (a: number, b: number, t = 0.000006) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test('cross-lap panels assemble at right angles with unequal measured thicknesses', () => {
  for (const thicknessMm of [1.5, 3, 5])
    for (const mateThicknessMm of [2, 4])
      for (const clearanceMm of [0, 0.05, 0.2]) {
        const width = 50,
          r = createCrossLapJoint({
            heightMm: 40,
            widthMm: width,
            thicknessMm,
            mateThicknessMm,
            kerfMm: 0.15,
            clearanceMm,
            depthClearanceMm: 0.1,
          });
        const a = {
          ...r.sideA,
          assembly: {
            originMm: [-width / 2, thicknessMm / 2, 0],
            u: [1, 0, 0],
            v: [0, 0, 1],
            normal: [0, -1, 0],
            thicknessMm,
          },
        };
        const b = {
          ...r.sideB,
          assembly: {
            originMm: [-mateThicknessMm / 2, -width / 2, 0],
            u: [0, 1, 0],
            v: [0, 0, 1],
            normal: [1, 0, 0],
            thicknessMm: mateThicknessMm,
          },
        };
        assert.ok(verifyAssembly({ panels: [a, b] }) > 0);
      }
});
test('upright tab seats in a horizontal receiver without solid overlap', () => {
  for (const thicknessMm of [1.5, 3, 5])
    for (const mateThicknessMm of [2, 4])
      for (const clearanceMm of [0, 0.05, 0.2]) {
        const shoulderMm = 6,
          r = createTabSlotJoint({
            tabWidthMm: 14,
            shoulderMm,
            thicknessMm,
            mateThicknessMm,
            kerfMm: 0.15,
            clearanceMm,
          });
        const hole = defined(r.sideB.contours.find((c) => c.role === 'hole')).nominal.bounds;
        const a = {
          ...r.sideA,
          assembly: {
            originMm: [
              hole.x + clearanceMm / 2 - shoulderMm,
              hole.y + (hole.height + thicknessMm) / 2,
              mateThicknessMm,
            ],
            u: [1, 0, 0],
            v: [0, 0, 1],
            normal: [0, -1, 0],
            thicknessMm,
          },
        };
        const b = {
          ...r.sideB,
          assembly: {
            originMm: [0, 0, 0],
            u: [1, 0, 0],
            v: [0, 1, 0],
            normal: [0, 0, 1],
            thicknessMm: mateThicknessMm,
          },
        };
        assert.ok(verifyAssembly({ panels: [a, b] }) > 0);
      }
});
function scan(points: readonly Point[] | undefined, y: number) {
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
function insidePolygon(p: Point, points: readonly Point[] | undefined) {
  assert.ok(points);
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((n, v, i) => n + v * b[i], 0);
function insidePanel(world: readonly number[], p: TestPanel) {
  const a = p.assembly,
    delta = world.map((v, i) => v - a.originMm[i]);
  const q: Point = [dot(delta, a.u), dot(delta, a.v)];
  const depth = dot(delta, a.normal);
  if (depth <= 1e-7 || depth >= a.thicknessMm - 1e-7) return false;
  return (
    p.contours.some((c) => c.role === 'outer' && insidePolygon(q, c.nominal.points)) &&
    !p.contours.some((c) => c.role === 'hole' && insidePolygon(q, c.nominal.points))
  );
}
function vertices(p: TestPanel) {
  const a = p.assembly;
  return p.contours.flatMap((c) =>
    defined(c.nominal.points).flatMap(([x, y]) =>
      [0, a.thicknessMm].map((z) =>
        a.originMm.map((o, i) => o + x * a.u[i] + y * a.v[i] + z * a.normal[i]),
      ),
    ),
  );
}
// For these axis-aligned rectilinear extrusions, all boundaries lie on the collected
// coordinate planes. One midpoint per resulting cell exhausts the possible overlap cells.
function verifyAssembly(box: { panels: readonly TestPanel[] }) {
  let cells = 0;
  const panels = box.panels;
  for (let i = 0; i < panels.length; i++)
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i],
        b = panels[j],
        av = vertices(a),
        bv = vertices(b);
      const samples = [];
      for (let axis = 0; axis < 3; axis++) {
        const lo = Math.max(
          Math.min(...av.map((p) => p[axis])),
          Math.min(...bv.map((p) => p[axis])),
        );
        const hi = Math.min(
          Math.max(...av.map((p) => p[axis])),
          Math.max(...bv.map((p) => p[axis])),
        );
        const coords = [
          ...new Set(
            [lo, hi, ...av.map((p) => p[axis]), ...bv.map((p) => p[axis])]
              .filter((n) => n >= lo && n <= hi)
              .map((n) => Number(n.toFixed(6))),
          ),
        ].sort((a, b) => a - b);
        samples.push(coords.slice(1).map((n, k) => (n + coords[k]) / 2));
      }
      for (const x of samples[0])
        for (const y of samples[1])
          for (const z of samples[2]) {
            cells++;
            assert.ok(
              !(insidePanel([x, y, z], a) && insidePanel([x, y, z], b)),
              `${a.id}/${b.id} collide at ${[x, y, z]}`,
            );
          }
    }
  return cells;
}
test('walls have collision-free straight insertion sweeps around the seated bottom', () => {
  // Every moving wall travels normal to its own sheet. Its swept solid is exactly
  // the same 2D outline extruded through thickness + travel, so the cell check is
  // exhaustive in continuous motion, rather than sampling animation frames.
  for (const t of [1.5, 3, 5])
    for (const clearanceMm of [0, 0.04, 0.15]) {
      const box = createBox({
        innerWidthMm: 90,
        innerDepthMm: 65,
        innerHeightMm: 45,
        thicknessMm: t,
        kerfMm: 0.15,
        clearanceMm,
      });
      const seated = [box.panels[0]],
        travel = 100;
      for (const id of ['front', 'back', 'left', 'right']) {
        const panel = defined(box.panels.find((p) => p.id === id)),
          sweep = structuredClone(panel);
        const [x, y, z] = sweep.assembly.originMm;
        if (id === 'back') sweep.assembly.originMm = [x, y + travel, z];
        if (id === 'left') sweep.assembly.originMm = [x - travel, y, z];
        sweep.assembly.thicknessMm += travel;
        for (const fixed of seated) verifyAssembly({ panels: [fixed, sweep] });
        seated.push(panel);
      }
    }
});
test('complete five-panel box: exhaustive rectilinear overlap cells at zero and positive clearance', () => {
  let cells = 0;
  for (const t of [1.5, 3, 5])
    for (const clearance of [0, 0.04, 0.15])
      for (const dimensions of [
        [90, 65, 45],
        [57, 83, 38],
      ]) {
        const [innerWidthMm, innerDepthMm, innerHeightMm] = dimensions;
        const box = createBox({
          innerWidthMm,
          innerDepthMm,
          innerHeightMm,
          thicknessMm: t,
          kerfMm: 0.15,
          clearanceMm: clearance,
        });
        cells += verifyAssembly(box);
        assert.equal(box.panels.length, 5);
        near(box.dimensions.outerWidthMm - 2 * t, innerWidthMm);
        near(box.dimensions.outerHeightMm - box.dimensions.baseElevationMm - t, innerHeightMm);
        for (const p of box.panels) {
          assert.equal(p.contours.filter((c) => c.role === 'outer').length, 1);
          for (const c of p.contours) assert.ok(c.toolpath.pathData.endsWith('Z'));
        }
      }
  assert.ok(cells > 1000);
});
test('bottom tenons line up with all four walls and slot heights accommodate sheet thickness', () => {
  const b = createBox({
    innerWidthMm: 90,
    innerDepthMm: 65,
    innerHeightMm: 45,
    thicknessMm: 3,
    kerfMm: 0.15,
    clearanceMm: 0.08,
  });
  const bottom = b.panels[0].contours[0].nominal.points;
  const tenons = scan(bottom, 1.5);
  const front = defined(b.panels.find((p) => p.id === 'front'));
  const holes = front.contours
    .filter((c) => c.role === 'hole')
    .sort((a, b) => a.nominal.bounds.x - b.nominal.bounds.x);
  assert.equal(holes.length, tenons.length / 2);
  holes.forEach((h, i) => {
    near(h.nominal.bounds.x + 0.04, tenons[2 * i]);
    near(h.nominal.bounds.width - 0.08, tenons[2 * i + 1] - tenons[2 * i]);
    near(h.nominal.bounds.y, 5.96);
    near(h.nominal.bounds.height, 3.08);
  });
  const svg = toSvg(b);
  assert.equal((svg.match(/<g /g) || []).length, 5);
  assert.match(svg, /outerWidthMm/);
});
test('keyed fingers are repeatable, asymmetric, and all mating widths retain clearance', () => {
  const opts = {
    lengthMm: 120,
    thicknessMm: 3,
    kerfMm: { sideA: 0.15, sideB: 0.2 },
    clearanceMm: 0.05,
    key: 'front-left',
    leadInMm: 0.2,
  };
  const a = createFingerJointPair(opts),
    other = createFingerJointPair({ ...opts, key: 'front-right' });
  assert.deepEqual(createFingerJointPair(opts), a);
  assert.notDeepEqual(a.pattern, other.pattern);
  const widths = defined(a.pattern).fingers.map((s) => s.endMm - s.startMm);
  assert.ok(Math.abs(widths[0] - defined(widths.at(-1))) > 1);
  const x = scan(a.sideA.contours[0].toolpath.points, 1.5),
    y = scan(a.sideB.contours[0].toolpath.points, 1.5);
  for (let i = 0; i < widths.length; i++) {
    near(x[2 * i + 1] - x[2 * i] - 0.15, widths[i]);
    near(y[2 * i + 2] - y[2 * i + 1] + 0.2 - widths[i], 0.05);
  }
});
test('dovetail clearance is preserved on sloped faces after normal beam removal', () => {
  const o = {
    neckWidthMm: 10,
    headWidthMm: 18,
    depthMm: 8,
    thicknessMm: 3,
    kerfMm: { sideA: 0.15, sideB: 0.2 },
    clearanceMm: 0.08,
    depthClearanceMm: 0.1,
  };
  const r = createDovetailJointPair(o);
  const normalFactor = Math.sqrt(1 + ((18 - 10) / (2 * 8)) ** 2);
  for (const depth of [1, 3, 5, 7]) {
    const a = scan(r.sideA.contours[0].toolpath.points, -depth),
      b = scan(r.sideB.contours[0].toolpath.points, depth);
    const tab = a[1] - a[0] - 0.15 * normalFactor,
      slot = b[2] - b[1] + 0.2 * normalFactor;
    near(slot - tab, 0.08);
    near(tab, 10 + depth);
  }
  assert.equal(r.kind, 'dovetail');
  assert.ok(r.measurements.flareAngleDeg > 0);
});
test('box rejects dimensions that cannot carry joints and disallows mixed material kerf', () => {
  const b = {
    innerWidthMm: 90,
    innerDepthMm: 65,
    innerHeightMm: 45,
    thicknessMm: 3,
    kerfMm: 0.15,
    clearanceMm: 0.05,
  };
  for (const override of [
    { innerWidthMm: 2 },
    { baseElevationMm: 0.01, minWebMm: 2 },
    { fingerWidthMm: 100 },
    { kerfMm: { sideA: 0.1, sideB: 0.2 } },
  ])
    assert.throws(() => unchecked(createBox, { ...b, ...override }), JointError);
});
test('box fit estimates include measured thickness and cut tolerances', () => {
  const b = createBox({
    innerWidthMm: 90,
    innerDepthMm: 65,
    innerHeightMm: 45,
    thicknessMm: 3,
    kerfMm: 0.15,
    clearanceMm: 0.08,
    tolerances: { thicknessMm: 0.1, cutMm: 0.03 },
  });
  near(b.fits.bottomThickness.minimumClearanceMm, -0.05);
  near(b.fits.bottomThickness.maximumClearanceMm, 0.21);
  near(b.fits.finger.minimumClearanceMm, 0.02);
  assert.ok(
    b.issues.some((i) => i.code === 'FIT_RANGE_CROSSES_ZERO' && i.field === 'bottomThickness'),
  );
});
test('key and dovetail constraints are explicit', () => {
  assert.throws(
    () =>
      createFingerJointPair({
        lengthMm: 30,
        thicknessMm: 3,
        kerfMm: 0.15,
        clearanceMm: 0,
        key: 'one',
        fingerCount: 1,
      }),
    JointError,
  );
  assert.throws(
    () =>
      createDovetailJointPair({
        neckWidthMm: 18,
        headWidthMm: 10,
        depthMm: 8,
        thicknessMm: 3,
        kerfMm: 0.15,
        clearanceMm: 0,
      }),
    JointError,
  );
});
