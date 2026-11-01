# Contributing and releasing

Use Node 20 or newer. Work from the repository root. All authored code is TypeScript: the library and CLI in `src/`, the browser demo in `demo/`, build utilities in `scripts/`, and tests in `test/`. Clipper2 is a pinned build dependency and bundled into the core. Three.js is used only by the demo and preview tests.

```sh
npm ci
npm run check
npm run examples
npm run test:package
npm run format:check
npx playwright install chromium firefox webkit
npm run test:browser
```

`npm run typecheck` strictly checks the core with `tsconfig.json` and all remaining TypeScript with `tsconfig.tools.json`. It also runs as part of `npm run check` and CI. `tsx` runs development scripts and Node tests; esbuild produces the JavaScript runtime bundles, and TypeScript generates the public declarations. Generated JavaScript stays out of Git. Keep new authored code in TypeScript and covered by one of these configurations.

For screenshots/GIFs, install ffmpeg, then run `npm run build:demo` and `npm run capture`. Capture uses a separate localhost port 4180 and closes its own server/browser afterwards. The interactive demo uses port 4178 (`PORT` overrides it). The local server is a development utility, not an internet-facing deployment server. To host the demo, build it and serve `demo/` and `docs/` as static files.

## Changes that need particular care

- Keep full kerf, total clearance and sheet thickness independent. Offsets belong on closed contours exactly once.
- For new shapes, test actual resulting paths and beam-removal dimensions, not just measurements copied from inputs. Check topology, minimum webs, corner behavior and a possible assembly direction.
- Preserve deterministic output, strict unknown-option validation, bounded complexity and ESM/CommonJS declaration parity.
- Keep finished nominal geometry separate from cutting centerlines. Do not add text or preview dimensions to the cutting layer.
- Describe the evidence honestly: software checks are not physical material tests. A new shape needs documented assembly and relief limits.
- Preserve third-party notices when updating bundled dependencies or generating a standalone demo distribution.

## Release checklist

1. Run the commands above on the final tree and inspect the actual demo and generated examples.
2. Rebuild GIFs when geometry or appearance changes, and update validation documentation when scope changes.
3. Run `npm pack --dry-run` and inspect the whitelist; then `npm pack` produces the reviewable tarball. `prepack` runs the build, strict type checks, geometry/CLI tests and size check.
4. Check the version and changelog, and verify the repository and demo links.
5. npm publication requires the maintainer's explicit release decision. Verify the authenticated npm/GitHub accounts and repository-local author/committer identity before publishing or committing.

CI validates pull requests and pushes. The Pages workflow deploys the demo from `main` after validation, or can be dispatched manually. `npm run build:site` prepares only the compiled demo, docs, examples, and license notices for Pages. npm releases are published manually after these checks.
