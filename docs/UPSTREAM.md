# Upstream choices and fabrication references

## Geometry engine: Clipper2

The core bundles [`clipper2-ts` 2.0.1-18](https://github.com/countertype/clipper2-ts), Jeremy Tribby's TypeScript port of Angus Johnson's [Clipper2](https://github.com/AngusJohnson/Clipper2), under BSL-1.0. It handles closed polygon offsets and the unions/differences needed for full box panels. The package pins that version in its lockfile; consumers do not need a separate runtime dependency.

Using one established polygon engine gives offsets and boolean composition the same coordinate model. It also allows explicit checks for split/erased contours. Our tests independently measure resulting dimensions rather than treating successful engine calls as proof of fit. The engine's numerical range and our scaled coordinate bounds are separate from physical machine accuracy.

[ClipperOffset documentation](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm) informed closed-path offset handling. The other `clipper2-js` package was inspected but not selected; its documented polygon-test limitations were a reason to choose the countertype port. This choice should be reevaluated when updating dependencies.

## Joint spacing and box construction: BoxBurner

[BoxBurner](https://github.com/velipso/boxburner) by Sean Connelly (@velipso), licensed 0BSD, was inspected at commit `8f927abb952811e9d2132787e1c823789e82232b`. Its `lib/src/edges/BoxJoint.ts` spacing routine is the source of the small adapted routine in `src/spacing.ts`: preserve the chosen finger/gap width and distribute unused length symmetrically into the margins.

Changes include strict input bounds, explicit count support, returning a shared span list for both mates, and an original deterministic asymmetric keyed extension. The pair generators apply explicit total clearance and generate closed nominal/toolpath contours. BoxBurner's `MortiseAndTenonJoint.ts` and `BoxPlain.ts` informed the separation between vertical finger seams and the raised bottom's closed mortises. Box construction here uses Clipper2 booleans and explicit 3D bases. BoxBurner's custom kerf implementation was not adopted.

TPVector was inspected as another existing joinery reference; its GPL code was not incorporated. No claim is made that keyed fingers or dovetails are unique inventions; the distinguishing feature here is their small typed API with matching geometry, machining metadata and calibration.

## Fabrication references

- [LightBurn: test kerf offset](https://docs.lightburnsoftware.com/latest/Guides/Test-KerfOffset/) — measure on the actual process, distinguish full kerf from per-side offset, and use closed contours with correct outer/hole direction.
- [SendCutSend: designing laser-cut tab and slot parts](https://sendcutsend.com/blog/designing-laser-cut-tab-and-slot-parts/) — account for actual material thickness, cut tolerances and corners. Their process-specific metal recommendations are not treated as universal wood/acrylic clearances.

These informed the explicit inputs, coupon workflow and diagnostics. This package does not encode a universal fit, material strength table, or machine process preset. All third-party license notices are preserved in [THIRD-PARTY-NOTICES](../THIRD-PARTY-NOTICES.md).
