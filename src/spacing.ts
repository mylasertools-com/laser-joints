// Adapted from boxJointFingerSpacer in BoxBurner by Sean Connelly (@velipso).
// Source: 8f927abb952811e9d2132787e1c823789e82232b/lib/src/edges/BoxJoint.ts
// SPDX-License-Identifier: 0BSD
// Changes: strict bounded inputs at the public boundary, equal-width cells,
// explicit count support, and a returned shared pattern instead of callbacks.
export function fingerSpans(
  length: number,
  width: number,
  count: number,
  margin: number,
  key?: string,
) {
  const occupied = width * (2 * count - 1);
  const start = margin + (length - 2 * margin - occupied) / 2;
  if (key === undefined)
    return Array.from({ length: count }, (_, i) => ({
      start: start + 2 * i * width,
      end: start + (2 * i + 1) * width,
    }));
  // Original extension: reproducible keyed spacing with deliberately different end widths.
  let seed = 2166136261;
  for (const ch of key) {
    seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  const weights = Array.from({ length: count * 2 - 1 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return i === 0 ? 1.5 : i === count * 2 - 2 ? 0.5 : 0.8 + (seed / 2 ** 32) * 0.4;
  });
  const unit = occupied / weights.reduce((a, b) => a + b, 0);
  let x = start;
  const spans: Array<{ start: number; end: number }> = [];
  weights.forEach((weight, i) => {
    const end = x + weight * unit;
    if (i % 2 === 0) spans.push({ start: x, end });
    x = end;
  });
  return spans;
}
