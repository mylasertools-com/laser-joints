# Validation evidence

Validation is reproducible from the package directory. It covers software geometry and previews; no physical laser hardware was used.

## Geometry and assembly

`npm run check` builds the distributable, strictly type-checks the library, CLI, demo, scripts, tests and Playwright configuration, runs Node's test suite, and checks a 64 KiB gzip budget for each core module format.

- Independent scanline measurements recover tab/slot widths **after** ideal beam removal. Tests vary positive/negative/zero clearance, separate kerfs, unequal sheet thicknesses and insertion chamfers.
- Sloped dovetail faces use normal-distance beam removal when testing horizontal clearance; throat/head dimensions are measured independently.
- A deterministic 180-case property sweep checks finite/simple polygon contours, dimensions and immutable inputs. Separate cases exercise the 128-finger limit, invalid inputs, minimum webs/features, offset collapse and rounded relief.
- Full five-panel box checks cover 18 combinations: thicknesses 1.5/3/5 mm, clearances 0/0.04/0.15 mm, and two inner dimension sets. For rectilinear extrusions, every boundary lies on a collected coordinate plane. Midpoint checks in every resulting overlap cell exhaust possible positive-volume collisions; this is not sparse surface sampling.
- Nine material/clearance combinations also test the **continuous swept solid** for the documented straight insertion order. Swept walls are checked against already seated panels. Nominal solids are used; interference fits intentionally fall outside collision-free claims.
- Separate cross-lap and upright tab-slot solids are assembled at right angles over 18 unequal-thickness/clearance combinations each and checked for positive-volume overlap.
- Bottom tenons align with mortises, fit ranges combine complete-dimension tolerances, SVG metadata distinguishes compensation modes, and labels remain outside cut geometry.
- CLI tests cover supported joint/box outputs, malformed/oversized input, misspelled options, duplicate flags, errors and non-overwriting output.

## Real preview checks

`npm run test:browser` uses Playwright Chromium, Firefox, WebKit and a Chromium mobile viewport. Every example renders and exports SVG. Tests verify invalid input disables export, valid input recovers, toolpaths can be inspected, calibration exports, CAM metadata, responsive layout and absence of page exceptions. Software WebGL verifies the actual box renderer in Chromium/mobile; other engines may use the SVG fallback if WebGL is unavailable. A Playwright mobile viewport is not a physical phone test.

The screenshot and GIF capture command (`npm run capture`, ffmpeg required) operates the same local demo. It records actual generated geometry. Images have been visually inspected at desktop and mobile sizes and at assembled/exploded states.

## Distribution

`npm run test:package` packs the actual whitelist, installs the tarball into a fresh temporary consumer **offline**, checks ESM and CommonJS imports, compiles consumers in TypeScript `.mts` and `.cts` modes, and invokes the installed CLI. It also checks required license/docs files and excludes node_modules, test output and secrets-like filenames. The npm package has no runtime install dependencies; Clipper2 is bundled with notices.

CI is configured for Node 20/22/24 on Linux and Windows, plus the browser suite on Linux. The validation commands must pass again for a release; dependency updates require rerunning geometry and browser checks.

## Practical limits

Tests do not prove every possible parameter combination, predict load capacity, simulate circular-beam corner rounding/taper, or establish actual material fit. Use the material/process calibration coupon before fabrication. No claim of physical assembly, long-term durability or universal joint coverage is made.
