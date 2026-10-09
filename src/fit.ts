import type { FitEstimate, FitOptions } from './types.js';
import { EPS, keys, number, positive, fail } from './validation.js';

/** Worst-case stack on complete dimensions; no material-strength prediction. */
export function estimateFit(options: FitOptions): FitEstimate {
  keys(options, ['maleMm', 'femaleMm', 'maleToleranceMm', 'femaleToleranceMm']);
  const male = positive(options.maleMm, 'maleMm');
  const female = positive(options.femaleMm, 'femaleMm');
  const mt = number(options.maleToleranceMm ?? 0, 'maleToleranceMm');
  const ft = number(options.femaleToleranceMm ?? 0, 'femaleToleranceMm');
  if (mt >= male || ft >= female)
    fail('OUT_OF_RANGE', 'Tolerance cannot include a zero or negative dimension.', 'tolerance');
  const clean = (n: number) => (Math.abs(n) < EPS ? 0 : n);
  const nominal = clean(female - male);
  const min = clean(nominal - mt - ft),
    max = clean(nominal + mt + ft);
  return {
    nominalClearanceMm: nominal,
    minimumClearanceMm: min,
    maximumClearanceMm: max,
    classification:
      min === 0 && max === 0
        ? 'line-to-line'
        : min >= 0
          ? 'clearance'
          : max < 0
            ? 'interference'
            : 'transition',
  };
}
