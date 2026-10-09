# Geometry, fit and assembly

## Three separate quantities

Measured sheet thickness, laser kerf, and desired clearance describe different things. Thickness sets how much space a panel occupies. Kerf is the width removed by a cut. Clearance is the difference between the **finished** mating dimensions.

For a rectangular external tab with desired width `w` and full kerf `kA`, the distance between cutting centerlines is `w + kA`. For a closed receiving slot of desired width `w + c` and full kerf `kB`, that distance is `w + c - kB`. Ideal beam removal gives:

```text
finished tab  = (w + kA) - kA     = w
finished slot = (w + c - kB) + kB = w + c
clearance     = finished slot - finished tab = c
```

The library offsets **closed contours normally to their edges**, rather than adjusting only horizontal coordinates. Sloped dovetail faces therefore receive the appropriate normal kerf offset too. Clipper2 handles concave polygons; slots with rounded end relief use analytic SVG arcs. Offset results must keep one connected contour and pass a reverse-offset topology/area check. Small features that disappear cause errors.

Polygon operations use an integer grid of 0.000001 mm and paths print six decimal places. This is computational precision, not achievable laser accuracy. The supported coordinate range keeps scaled values within JavaScript's exact integer range. The exported numerical comparison tolerance is 0.000002 mm. Very small acute features may be rejected by the offset checks.

## Fit is a measured choice

The API requires a numeric `clearanceMm`; it does not offer universal “press fit in plywood” presets. Material, actual thickness, machine focus, settings, taper, coating, moisture and grain can change the outcome. Begin with measured material and a calibrated kerf, generate a small clearance sweep, and use the chosen coupon result in the generator.

For complete-dimension tolerances ±`tm` and ±`tf`:

```text
nominal clearance = female - male
minimum clearance = nominal - tm - tf
maximum clearance = nominal + tm + tf
```

Cut-to-cut dimensions use cut tolerance on both mates. A slot receiving a sheet uses thickness tolerance on the male sheet and cut tolerance on the female slot. These are worst-case arithmetic bounds, not a statistical confidence interval. They do not model a material distribution, friction, strength or elastic deflection. Zero tolerance represents an ideal model. Negative clearance deliberately creates interference; the assembly collision-free tests apply to zero and positive nominal clearance.

## Corners, relief and material limits

An ideal polygon has perfectly square internal corners. A circular beam leaves a finite internal corner radius. Kerf compensation preserves straight face dimensions but cannot create an infinitely sharp interior corner. Taper, corner dwell and charring add more differences. The package reports square-recess warnings; it does not hide them by silently changing all joints.

Optional tab-slot end relief extends the slot **at both ends** by its radius. Rounded corners lie outside the full-height central gauge width. That helps square tab corners clear, but the overall wider slot allows extra sideways travel. The reported width fit includes this extra space. A radius smaller than the beam radius is rejected.

`leadInMm` chamfers a tab's leading corners in the cut plane. It does not bevel the sheet faces or guarantee insertion through a zero-clearance rounded recess. `minFeatureMm` and `minWebMm` are caller-supplied process constraints, not strength thresholds. Slender fingers and brittle-material interference generate warnings. No universal finger aspect ratio, tensile capacity, retention force or snap-fit life is claimed.

The dovetail is a coplanar flared splice. Reflect one coupon across its baseline to bring the profiles together. Assemble from above/out of plane; its wide head cannot pass through its narrow throat. Its horizontal clearance is distinct from perpendicular clearance on the angled flank. It is not a sliding woodworking dovetail and is not inherently locked against lifting out of plane.

## Local edges and complete panels

Every exposed edge starts at local left and proceeds in +X; material lies on +Y. The edge is open, uncompensated nominal geometry. Use `placeEdge` to rotate/translate it into your generator, then connect it to the remaining boundary. Reversing traversal preserves the material normal. Nonuniform scaling would destroy thickness/fit dimensions and is not supported.

The provided coupon panels already have complete closed boundaries. Polygon vertex winding is normalized positive in SVG coordinates; outer versus hole semantics are carried by `role`. When combining them into a filled preview, use `fill-rule="evenodd"` or reverse holes for a nonzero-winding renderer. The cut-only SVG has `fill="none"`.

## Box construction

The open box has five panels and a raised bottom. This separates the vertical corner fingers from the bottom's mortise-and-tenon joints. All panels use the same thickness. The default base elevation is `2t`; bottom corner margins are `3t`. Front/back carry one phase of the vertical seam; left/right carry the complementary phase. The bottom's tabs occupy matching closed slots in each wall.

World axes: X = width, Y = depth, Z = up. Inner height starts at the top face of the seated bottom, not at the underside of the box. The `assembly` basis on each panel maps SVG-local coordinates and material extrusion to world positions without scaling.

A tested insertion order for the ideal geometry is:

1. Hold the bottom in its final horizontal position.
2. Slide the front wall along +Y onto the bottom tabs, then the back wall along −Y.
3. Slide the left wall along +X, then the right wall along −X.

Each wall moves normal to its sheet. Its entire straight insertion sweep is exactly its 2D profile extruded through the wall thickness plus travel. Tests compare that swept solid against already seated panels using exhaustive rectilinear overlap cells. This verifies an available collision-free path for the tested nonnegative-clearance cases. It does not account for real beam rounding, glue squeeze-out, flexible materials or hand/tool access.

The demo's simultaneous explosion is an inspection animation and is not this insertion sequence. It separates parts for visibility and uses ideal nominal solids.

## Export contract

SVG uses explicit millimetres and a matching numeric viewBox. Each cutting contour is closed. Preview labels and dimensions are omitted. Closed slots are written before their panel outline, but users must still set machine cut order, speed, power, support and nesting in their CAM software.

Geometry mode exports already compensated toolpaths: apply zero further CAM kerf offset. CAM mode exports nominal geometry and records the required half-kerf in metadata. Exporting `geometry: 'nominal'` also marks the output as needing CAM compensation. Always preserve this distinction through downstream tooling.

The simple horizontal exporter is intentionally not a stock nesting optimizer. It does not merge shared cuts. Arbitrary user SVG validation belongs to a separate SVG validation/import step, such as the MyLaserTools SVG tools.
