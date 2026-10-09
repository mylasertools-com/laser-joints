# API reference

All lengths are millimetres. Functions are synchronous and deterministic, and do not mutate options. Inputs must contain finite JavaScript numbers; numeric strings, unknown keys and null option values are rejected. Returned objects are JSON-compatible.

## Common joint options

| Option                   | Default       | Meaning                                                                 |
| ------------------------ | ------------- | ----------------------------------------------------------------------- |
| `thicknessMm`            | required      | Measured thickness of side A, greater than 0.000002                     |
| `mateThicknessMm`        | `thicknessMm` | Measured thickness of side B                                            |
| `kerfMm`                 | required      | Full kerf, either a number or `{ sideA, sideB }`; zero allowed          |
| `clearanceMm`            | required      | Total finished female-minus-male dimension; negative is interference    |
| `compensation`           | `'geometry'`  | `'geometry'` or `'cam'`                                                 |
| `minFeatureMm`           | `0`           | Process-specific minimum width of checked tabs, slots and tips          |
| `minWebMm`               | `0`           | Process-specific minimum checked shoulder/back/bridge width             |
| `brittleMaterial`        | `false`       | Adds a warning for negative clearance; does not guess material strength |
| `tolerances.cutMm`       | `0`           | ± error on a complete cut dimension, not each edge                      |
| `tolerances.thicknessMm` | `0`           | ± error on measured sheet thickness; must be less than sheet thickness  |

Zero minima mean no user-specified process limit; the positive geometry and kerf-survival checks still apply. These controls are checks on the dimensions described below, not a general wall-thickness or stress analysis. Length inputs are limited to 100,000 mm. Generated coordinates are limited to ±500,000 mm. The exported `GEOMETRY_TOLERANCE_MM` is 0.000002 mm, a numerical tolerance, not machine accuracy.

## `createFingerJointPair(options)`

| Option                | Default                    | Meaning                                                                           |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `lengthMm`            | required                   | Total seam length                                                                 |
| `targetFingerWidthMm` | `2 × max(thicknesses)`     | Equal finger and gap width; leftover length is centered in the margins            |
| `fingerCount`         | inferred                   | Alternative to target width, integer 1–128; width is solved from available length |
| `endMarginMm`         | `1.5 × max(thicknesses)`   | Minimum end margin; actual margin may be larger with target width                 |
| `bodyDepthMm`         | `max(20, 4 × max(depths))` | Coupon body depth from its local baseline                                         |
| `depthClearanceMm`    | `0`                        | Extra depth in side B's recesses                                                  |
| `leadInMm`            | `0`                        | 45° tip chamfer on A; retains positive tip width and straight engagement          |
| `key`                 | absent                     | 1–64 ASCII letters/digits/spaces/underscores/hyphens; at least 3 fingers          |

`fingerCount` and `targetFingerWidthMm` are mutually exclusive. A's recess depth uses B's thickness; B's uses A's thickness plus depth allowance. B's slots receive the total lateral clearance; B's intervening fingers shrink accordingly. The keyed variant distributes asymmetric widths over the same occupied span; `pattern.fingers` is authoritative, and equal-width `fingerWidthMm`/`pitchMm` measurements are omitted for keyed results. `fits.finger` uses the narrowest finger and the specified cut tolerance on each mate.

## `createTabSlotJoint(options)`

| Option            | Default                    | Meaning                                              |
| ----------------- | -------------------------- | ---------------------------------------------------- |
| `tabWidthMm`      | required                   | In-plane tab width                                   |
| `tabDepthMm`      | B's thickness              | Tab projection from shoulder                         |
| `shoulderMm`      | `max(5, 2 × A thickness)`  | Material on each side of tab                         |
| `bodyDepthMm`     | `max(20, 4 × A thickness)` | Tab coupon body depth                                |
| `slotBorderMm`    | `max(5, 2 × B thickness)`  | Border around slot coupon                            |
| `slotEndReliefMm` | `0`                        | Rounded extension at each slot end, with this radius |
| `leadInMm`        | `0`                        | 45° tip chamfer on tab                               |

Slot height = **A's sheet thickness + clearance**. Gauge width = tab width + clearance. Overall slot width = gauge width + `2 × slotEndReliefMm`. Relief radius cannot exceed half slot height and must exceed B's half-kerf by at least 0.000002 mm. Relief preserves a full-height central gauge region but adds lateral play: `fits.width` deliberately uses **overall** slot width. `fits.thickness` combines A's thickness tolerance and B's cut tolerance. There is no slot edge profile: the slot is a closed hole.

## `createCrossLapJoint(options)`

`heightMm` is required. `widthMm` defaults to `max(30, 8 × max(thicknesses))`. `depthClearanceMm` defaults to zero and is the **total** extra notch depth, shared equally: each notch depth = `(height + depthClearance) / 2`.

Each notch width uses the **other** sheet's thickness plus clearance. The two complete coupon outlines have opposing notches. Edge profiles both use the common +X/+Y local convention; B's complete coupon is rotated 180°. `fits.sideA` and `fits.sideB` include sheet and cut tolerances. This function assumes equal panel heights.

## `createDovetailJointPair(options)`

Required: `neckWidthMm`, `headWidthMm`, `depthMm`; head must be wider than neck. `shoulderMm` defaults to `max(6, 2 × A thickness)`. `bodyDepthMm` defaults to `max(20, depth + 2 × max(thicknesses))`. `depthClearanceMm` defaults to zero.

Creates a flared **coplanar** splice, inserted from out of plane. A flared head cannot slide through the narrow throat. Clearance is measured horizontally at corresponding depths, not normal to the sloped faces. The socket's slopes continue through any depth allowance; side-web checks include that extra flare. `fits.throat` reports the horizontal throat fit. This is not a woodworking sliding dovetail or a strength prediction. Each side retains its supplied sheet thickness; unequal sheets will not have both faces flush.

## Joint return value

`JointResult` contains:

- `schemaVersion: 1`, `kind`, `units: 'mm'`.
- `sideA` and `sideB`: panel `id`, `bounds` of toolpaths, and `contours`.
- Each contour: `id`, `role: 'outer' | 'hole'`, `nominal`, `toolpath`. Geometry has `pathData`, `bounds`, and polygon `points` without a repeated closing vertex. Analytic rounded rectangles omit `points` and use SVG arc commands.
- `edges`: open **nominal** profiles for composing larger parts. Local traversal +X, material +Y. Never send these directly as closed-part cutting paths.
- `measurements`: computed values, all named with units.
- `fits`: nominal/minimum/maximum clearance and classification.
- `machining`: mode, full kerf per side, additional CAM offset per side (zero in geometry mode).
- `issues`: warnings with stable `code`, `severity`, `message`, and optional `field`/dimension evidence.
- `pattern` on finger joints: optional key and exact finger intervals.

## `createBox(options)`

Required: `innerWidthMm`, `innerDepthMm`, `innerHeightMm`, `thicknessMm`, numeric `kerfMm`, `clearanceMm`. Supports other common options **except** `mateThicknessMm`. Boxes use one material and kerf throughout. `fingerWidthMm` defaults to `2 × thickness`; `baseElevationMm` defaults to `2 × thickness` and must remain positive. Each edge reserves `3 × thickness` at its ends for corners.

Returns `BoxResult` with `kind: 'box'`, five `panels` (bottom/front/back/left/right), inner/outer `dimensions`, `clearanceMm`, `fits.finger` for cut widths and `fits.bottomThickness` for the sheet-to-slot fit, scalar `machining`, and `issues`. There is no lid or nesting optimizer. Inner height is the usable height above the bottom panel's top face.

Each panel adds `assembly: { originMm, u, v, normal, thicknessMm }`. World position is `origin + u*x + v*y + normal*z` for extrusion depth `0 ≤ z ≤ thickness`. Coordinates are right-handed with world +Z up. Outer width/depth = inner + 2t. Outer height = inner height + base elevation + t. See the tested assembly sequence in [DESIGN](DESIGN.md).

## Utilities

`toSvg(resultOrArray, options?)`: accepts a joint, 1–21 joint results, or a box. Options: `geometry: 'toolpath'` (default) or `'nominal'`; `gapMm` default `max(5, maxKerf + 1)`; `paddingMm` default `max(3, maxKerf/2 + 1)`; `title` string ≤500 characters. Layout is a simple horizontal row. Holes are emitted before each outline; machine ordering still belongs to CAM. Nominal export metadata always reports the required CAM offsets. Use generator results, not arbitrary imported SVG or unvalidated result-shaped JSON.

`createFitTest(options)`: tab-slot options except `clearanceMm`, plus 1–21 distinct finite `clearancesMm` in caller order. Returns `{ schemaVersion, units, samples, svg, manifest }`. Manifest entries identify each pair left-to-right and report clearances/fits; no engraved labels are added.

`estimateFit({ maleMm, femaleMm, maleToleranceMm = 0, femaleToleranceMm = 0 })`: worst-case female-minus-male fit. Tolerances must be smaller than their complete dimensions. Classification: `line-to-line`, `clearance`, `interference`, or `transition`. Values smaller than numerical tolerance are treated as zero.

`placeEdge(profile, { origin: [x,y], angleDeg = 0, reverse = false })`: rigid translation/rotation and optional traversal reversal. Returns `materialNormal` and `materialSide: 'left' | 'right'`. It does not scale dimensions or offset the path. Accepts 2–2048 points. Reversal changes traversal, not the side occupied by material.

## Errors

Catch exported `JointError`; `error.toJSON()` serializes its `name`, `code`, `message`, and `issues`. Fatal codes: `INVALID_INPUT`, `UNKNOWN_OPTION`, `OUT_OF_RANGE`, `IMPOSSIBLE_GEOMETRY`, `FEATURE_TOO_SMALL`, `WEB_TOO_SMALL`, `OFFSET_COLLAPSE`, `LIMIT_EXCEEDED`.

Warnings: `INTERFERENCE_FIT`, `BRITTLE_INTERFERENCE`, `FIT_RANGE_CROSSES_ZERO`, `SHARP_INTERNAL_CORNERS`, `SLENDER_FINGER`, `CAM_COMPENSATION_REQUIRED`. Warnings require a caller decision; they do not disable export. Tiny features lost by kerf offsets are rejected instead of silently repaired.

## CLI

`laser-joints <finger|tab-slot|cross-lap|dovetail|box|calibration> <config.json|-> [--format json|svg] [--output file]`

JSON default; 64 KiB input limit; regular files or stdin; exclusive output creation. Exit 0 success, 2 validation/usage/JSON error, 1 I/O error. Diagnostics are JSON on stderr. Use `finger` with a `key` for keyed fingers. `--help` prints usage.
