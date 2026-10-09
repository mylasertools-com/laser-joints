import type { BoxResult, JointResult, SvgOptions, Point } from './types.js';
import { bounds, fmt } from './geometry.js';
import { fail, keys, positive } from './validation.js';

const xml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
/** Cut-only SVG. Labels/dimensions belong in a preview, never in the cutting layer. */
export function toSvg(
  input: JointResult | readonly JointResult[] | BoxResult,
  options: SvgOptions = {},
): string {
  keys(options, ['geometry', 'gapMm', 'paddingMm', 'title']);
  const box =
    !Array.isArray(input) && (input as BoxResult)?.kind === 'box'
      ? (input as BoxResult)
      : undefined;
  const results: readonly JointResult[] = box
    ? []
    : Array.isArray(input)
      ? input
      : [input as JointResult];
  if (!box && (results.length === 0 || results.length > 21))
    fail('LIMIT_EXCEEDED', 'Export requires between 1 and 21 joint pairs.');
  const geometry = options.geometry ?? 'toolpath';
  if (geometry !== 'toolpath' && geometry !== 'nominal')
    fail('INVALID_INPUT', 'geometry must be toolpath or nominal.', 'geometry');
  const maxKerf = box
    ? box.machining.kerfMm
    : Math.max(...results.flatMap((r) => [r.machining.kerfMm.sideA, r.machining.kerfMm.sideB]));
  const gap = positive(options.gapMm ?? Math.max(5, maxKerf + 1), 'gapMm');
  const padding = positive(options.paddingMm ?? Math.max(3, maxKerf / 2 + 1), 'paddingMm');
  if (
    (geometry === 'nominal' ||
      box?.machining.compensation === 'cam' ||
      results.some((r) => r.machining.compensation === 'cam')) &&
    (gap <= maxKerf || padding <= maxKerf / 2)
  )
    fail(
      'IMPOSSIBLE_GEOMETRY',
      'Leave more than a full kerf between parts and half a kerf around the sheet when exporting nominal contours.',
    );
  const title = options.title ?? 'Laser joints';
  if (typeof title !== 'string' || title.length > 500)
    fail('INVALID_INPUT', 'title must be a string of at most 500 characters.', 'title');
  let x = padding,
    maxHeight = 0;
  const groups: string[] = [],
    placements: unknown[] = [];
  const entries = box
    ? [{ panels: box.panels, clearanceMm: box.clearanceMm }]
    : results.map((r) => ({ panels: [r.sideA, r.sideB], clearanceMm: r.measurements.clearanceMm }));
  entries.forEach((entry, sample) => {
    for (const p of entry.panels) {
      const box = bounds(
        p.contours.flatMap((c) => {
          const b = c[geometry].bounds;
          return [
            [b.x, b.y],
            [b.x + b.width, b.y + b.height],
          ] as Point[];
        }),
      );
      const tx = x - box.x,
        ty = padding - box.y;
      const id = `sample-${sample}-${p.id}`;
      groups.push(
        `  <g id="${id}" data-operation="cut" transform="translate(${fmt(tx)} ${fmt(ty)})">`,
      );
      // Put interior contours first; actual machine order still belongs to CAM.
      for (const c of [...p.contours].sort(
        (a, b) => (a.role === 'hole' ? 0 : 1) - (b.role === 'hole' ? 0 : 1),
      )) {
        groups.push(
          `    <path id="${id}-${xml(c.id)}" data-role="${c.role}" d="${xml(c[geometry].pathData)}"/>`,
        );
      }
      groups.push('  </g>');
      placements.push({
        sample,
        part: p.id,
        translateMm: [tx, ty],
        clearanceMm: entry.clearanceMm,
      });
      x += box.width + gap;
      maxHeight = Math.max(maxHeight, box.height);
    }
  });
  const width = x - gap + padding,
    height = maxHeight + 2 * padding;
  const meta = {
    schemaVersion: 1,
    units: 'mm',
    geometry,
    placements,
    ...(box
      ? {
          box: {
            dimensions: box.dimensions,
            fits: box.fits,
            issues: box.issues,
            machining:
              geometry === 'nominal'
                ? {
                    ...box.machining,
                    compensation: 'cam',
                    additionalOffsetMm: box.machining.kerfMm / 2,
                  }
                : box.machining,
          },
        }
      : {}),
    joints: results.map((r) => ({
      kind: r.kind,
      machining:
        geometry === 'nominal'
          ? {
              ...r.machining,
              compensation: 'cam',
              additionalOffsetMm: {
                sideA: r.machining.kerfMm.sideA / 2,
                sideB: r.machining.kerfMm.sideB / 2,
              },
            }
          : r.machining,
      measurements: r.measurements,
      fits: r.fits,
      issues: r.issues,
      ...(r.pattern ? { pattern: r.pattern } : {}),
    })),
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}" fill="none" stroke="#ff0000" stroke-width="0.1">\n  <title>${xml(title)}</title>\n  <metadata>${xml(JSON.stringify(meta))}</metadata>\n${groups.join('\n')}\n</svg>\n`;
}
