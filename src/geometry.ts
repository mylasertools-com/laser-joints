import { inflatePaths, JoinType, EndType, difference, FillRule, areaPaths } from 'clipper2-ts';
import type {
  Bounds,
  Contour,
  EdgeProfile,
  JointPart,
  PathGeometry,
  PlacedEdgeProfile,
  Point,
} from './types.js';
import { EPS, fail, number, keys } from './validation.js';

/** 1 micromillimetre integer grid. Coordinate bounds keep Clipper arithmetic safe. */
const SCALE = 1_000_000;
export const GEOMETRY_TOLERANCE_MM = 0.000002;
export const fmt = (n: number): string => String(Number(n.toFixed(6)));
export const area = (p: readonly Point[]): number =>
  p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length]!;
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
const equal = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const scaled = (p: readonly Point[]) =>
  p.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));

export function bounds(points: readonly Point[]): Bounds {
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const p of points) {
    x = Math.min(x, p[0]);
    y = Math.min(y, p[1]);
    r = Math.max(r, p[0]);
    b = Math.max(b, p[1]);
  }
  return { x, y, width: r - x, height: b - y };
}
export function path(points: readonly Point[], closed = true): string {
  return (
    points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0])} ${fmt(p[1])}`).join(' ') +
    (closed ? ' Z' : '')
  );
}
function clean(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (
      !Number.isFinite(p[0]) ||
      !Number.isFinite(p[1]) ||
      Math.max(Math.abs(p[0]), Math.abs(p[1])) > 500_000
    )
      fail('OUT_OF_RANGE', 'Generated coordinates exceed the supported range.');
    if (!out.length || !equal(out[out.length - 1]!, p)) out.push([p[0], p[1]]);
  }
  if (out.length > 1 && equal(out[0]!, out[out.length - 1]!)) out.pop();
  return out;
}
function canonical(points: readonly Point[]): Point[] {
  let out = clean(points);
  if (area(out) < 0) out = out.reverse();
  let first = 0;
  for (let i = 1; i < out.length; i++) {
    if (
      out[i]![1] < out[first]![1] ||
      (out[i]![1] === out[first]![1] && out[i]![0] < out[first]![0])
    )
      first = i;
  }
  return [...out.slice(first), ...out.slice(0, first)];
}
export function polygon(points: readonly Point[]): PathGeometry {
  const p = canonical(points);
  if (p.length < 3 || Math.abs(area(p)) < EPS)
    fail('IMPOSSIBLE_GEOMETRY', 'A closed part must have positive area.');
  return { points: p, pathData: path(p), bounds: bounds(p) };
}
/** Clipper2 handles concave corners and intersections introduced by offsetting. */
export function offsetPolygon(points: readonly Point[], deltaMm: number): PathGeometry {
  const input = canonical(points);
  if (deltaMm === 0) return polygon(input);
  const result = inflatePaths([scaled(input)], deltaMm * SCALE, JoinType.Miter, EndType.Polygon, 2);
  if (result.length !== 1 || result[0]!.length < 3)
    fail(
      'OFFSET_COLLAPSE',
      'Kerf offset collapses or splits a contour. Increase the feature size or reduce the kerf.',
    );
  const output = result[0]!.map((p): Point => [p.x / SCALE, p.y / SCALE]);
  const geom = polygon(output);
  // A feature can disappear without changing the number of contours. The offset must be
  // reversible within a tiny area tolerance; otherwise reject it rather than silently heal it.
  const restored = inflatePaths(result, -deltaMm * SCALE, JoinType.Miter, EndType.Polygon, 2);
  if (restored.length !== 1) fail('OFFSET_COLLAPSE', 'Kerf offset loses part topology.');
  const lost = difference([scaled(input)], restored, FillRule.NonZero);
  const gained = difference(restored, [scaled(input)], FillRule.NonZero);
  const perimeter = input.reduce((sum, a, i) => {
    const b = input[(i + 1) % input.length]!;
    return sum + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }, 0);
  if (
    (Math.abs(areaPaths(lost)) + Math.abs(areaPaths(gained))) / (SCALE * SCALE) >
    Math.max(1e-6, perimeter * GEOMETRY_TOLERANCE_MM * 4)
  )
    fail(
      'OFFSET_COLLAPSE',
      'Kerf offset would erase or merge a feature. Reduce kerf or increase the joint dimensions.',
    );
  return geom;
}
export function rectangle(x: number, y: number, w: number, h: number): Point[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}
export function roundedRectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): PathGeometry {
  if (w <= EPS || h <= EPS || radius < 0 || radius > Math.min(w, h) / 2 + EPS)
    fail('OFFSET_COLLAPSE', 'Rounded slot cannot survive the requested kerf offset.');
  if (radius <= EPS) return polygon(rectangle(x, y, w, h));
  const r = radius;
  const f = fmt;
  return {
    bounds: { x, y, width: w, height: h },
    pathData: `M${f(x + r)} ${f(y)} H${f(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)} V${f(y + h - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)} H${f(x + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)} V${f(y + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z`,
  };
}
export function contour(
  id: string,
  points: readonly Point[],
  kerf: number,
  mode: 'geometry' | 'cam',
  role: 'outer' | 'hole' = 'outer',
): Contour {
  return {
    id,
    role,
    nominal: polygon(points),
    toolpath: offsetPolygon(
      points,
      mode === 'geometry' ? (kerf / 2) * (role === 'outer' ? 1 : -1) : 0,
    ),
  };
}
export function roundedHole(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  kerf: number,
  mode: 'geometry' | 'cam',
): Contour {
  const d = mode === 'geometry' ? kerf / 2 : 0;
  // A round beam cannot reproduce an internal radius smaller than its own radius.
  if (r > 0 && r < kerf / 2 + GEOMETRY_TOLERANCE_MM)
    fail(
      'FEATURE_TOO_SMALL',
      'slotEndReliefMm must exceed half of side B kerf by at least 0.000002 mm.',
      'slotEndReliefMm',
    );
  return {
    id,
    role: 'hole',
    nominal: roundedRectangle(x, y, w, h, r),
    toolpath: roundedRectangle(x + d, y + d, w - 2 * d, h - 2 * d, r === 0 ? 0 : r - d),
  };
}
export function part(id: 'sideA' | 'sideB', contours: Contour[]): JointPart {
  const pts: Point[] = contours.flatMap((c) => {
    const b = c.toolpath.bounds;
    return [
      [b.x, b.y],
      [b.x + b.width, b.y + b.height],
    ] as Point[];
  });
  return { id, contours, bounds: bounds(pts) };
}
export function edge(points: readonly Point[]): EdgeProfile {
  const p = clean(points);
  return {
    points: p,
    pathData: path(p, false),
    closed: false,
    compensation: 'none',
    materialSide: 'positive-y',
  };
}
/** Position an edge by a rigid transform. It never scales functional dimensions. */
export function placeEdge(
  profile: EdgeProfile,
  options: { origin: Point; angleDeg?: number; reverse?: boolean },
): PlacedEdgeProfile {
  keys(options, ['origin', 'angleDeg', 'reverse']);
  if (!Array.isArray(options.origin) || options.origin.length !== 2)
    fail('INVALID_INPUT', 'origin must be [x, y].', 'origin');
  const ox = number(options.origin[0], 'origin.x', -100_000),
    oy = number(options.origin[1], 'origin.y', -100_000);
  const angle = (number(options.angleDeg ?? 0, 'angleDeg', -360_000, 360_000) * Math.PI) / 180;
  if (options.reverse !== undefined && typeof options.reverse !== 'boolean')
    fail('INVALID_INPUT', 'reverse must be boolean.', 'reverse');
  if (
    !profile ||
    !Array.isArray(profile.points) ||
    profile.points.length < 2 ||
    profile.points.length > 2048
  )
    fail('INVALID_INPUT', 'profile must be an edge with 2–2048 points.');
  const points = Array.from(profile.points, (p): Point => {
    if (!Array.isArray(p) || p.length !== 2)
      fail('INVALID_INPUT', 'Each edge point must be [x, y].');
    const x = number(p[0], 'point.x', -100_000),
      y = number(p[1], 'point.y', -100_000);
    return [
      ox + x * Math.cos(angle) - y * Math.sin(angle),
      oy + x * Math.sin(angle) + y * Math.cos(angle),
    ];
  });
  if (options.reverse) points.reverse();
  return {
    ...edge(points),
    materialSide: options.reverse ? 'right' : 'left',
    materialNormal: [-Math.sin(angle), Math.cos(angle)],
  };
}
