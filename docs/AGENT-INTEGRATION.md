# Using Laser Joints from a generator or agent

The same synchronous API is available in browsers, ESM and CommonJS. Prefer the API inside JavaScript tools; use the CLI when your agent exchanges JSON with subprocesses. No network access, filesystem access, model service or user account is needed by the core geometry library.

## Input contract

Choose the joint function first, then provide measured `thicknessMm`, **full** `kerfMm`, explicit **total** `clearanceMm`, and the required dimensions in millimetres. Include process minima and tolerances when known. Never substitute a material preset for measurements without telling the caller. Option names are validated, so misspellings fail instead of quietly using defaults. See [API](API.md) for the exact per-family options.

```ts
import { createTabSlotJoint, JointError } from '@mylasertools/laser-joints';

function jointTool(options: Parameters<typeof createTabSlotJoint>[0]) {
  try {
    return { ok: true, result: createTabSlotJoint(options) };
  } catch (error) {
    if (error instanceof JointError) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
```

The generated result separates `nominal`, `toolpath`, `fits`, `machining` and `issues`. Preserve those fields when passing geometry between tools. Every output has `schemaVersion: 1` and `units: 'mm'`. Input objects are not modified. Serialization order and shared patterns are deterministic for the same version/options.

## Resolve diagnostics with the caller's intent

An error identifies the failed field or dimension when available. For example, increasing kerf until it consumes a slot causes an error; do not simply discard the error or clamp kerf. Increasing a joint's width may be appropriate if it fits the intended design. Changing measured material thickness to silence validation is not.

Warnings remain exportable. Show them to the user, especially interference in brittle material, fit ranges crossing zero, and the need to apply CAM compensation. `minimumClearanceMm < 0` is possible interference under the supplied tolerances, not proof of failure for every sample.

Use `createFitTest` when the desired clearance is unknown. Keep its `manifest` with the cut sheet: samples are ordered left-to-right, and there are no hidden text paths intended for cutting. A coupon's measured outcome is evidence; a preview is not evidence of real material fit.

## Embedding edges

`result.edges` are open nominal profiles. Place them with `placeEdge`, close your complete panel, then apply kerf to the complete boundary. Do not compensate an open edge and separately compensate the joined outline. The ready-made `sideA`/`sideB` panels are suitable for coupons. `createBox` provides complete panels and assembly transforms when that box model meets your needs.

## CLI example

```json
{
  "lengthMm": 100,
  "thicknessMm": 3,
  "kerfMm": { "sideA": 0.15, "sideB": 0.2 },
  "clearanceMm": 0.08,
  "key": "front-left"
}
```

Pass that JSON to `laser-joints finger -`. Default stdout is a single JSON result. Request `--format svg` for cut-only SVG; warnings then go to stderr. Exit codes are 0 success, 2 input/geometry errors, and 1 I/O errors. Limit is 64 KiB input. `--output` refuses to replace an existing file.

Use subprocess argument arrays instead of shell-string concatenation. Parse JSON results as data. `toSvg` accepts library-generated results, not arbitrary result-shaped objects from an untrusted service. For server tools, maintain your own request size/rate limits in addition to the library's finger and dimension bounds.
