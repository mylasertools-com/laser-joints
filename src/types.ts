export type Point = readonly [number, number];
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type IssueCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_OPTION'
  | 'OUT_OF_RANGE'
  | 'IMPOSSIBLE_GEOMETRY'
  | 'FEATURE_TOO_SMALL'
  | 'WEB_TOO_SMALL'
  | 'OFFSET_COLLAPSE'
  | 'INTERFERENCE_FIT'
  | 'FIT_RANGE_CROSSES_ZERO'
  | 'BRITTLE_INTERFERENCE'
  | 'SHARP_INTERNAL_CORNERS'
  | 'SLENDER_FINGER'
  | 'CAM_COMPENSATION_REQUIRED'
  | 'LIMIT_EXCEEDED';
export interface Issue {
  code: IssueCode;
  severity: 'warning' | 'error';
  message: string;
  field?: string;
  actualMm?: number;
  limitMm?: number;
}
/** kerfMm is the FULL width removed by the beam, never the per-edge offset. */
export interface CommonOptions {
  thicknessMm: number;
  mateThicknessMm?: number;
  kerfMm: number | { sideA: number; sideB: number };
  /** Total female-minus-male finished dimension. Negative means interference. */
  clearanceMm: number;
  compensation?: 'geometry' | 'cam';
  minFeatureMm?: number;
  minWebMm?: number;
  brittleMaterial?: boolean;
  /** Symmetric +/- errors on complete dimensions, not on each edge. */
  tolerances?: { thicknessMm?: number; cutMm?: number };
}
export interface FingerJointOptions extends CommonOptions {
  /** Deterministic asymmetric widths for assembly identification; at least 3 fingers. */
  key?: string;
  lengthMm: number;
  targetFingerWidthMm?: number;
  fingerCount?: number;
  endMarginMm?: number;
  bodyDepthMm?: number;
  /** Added depth in B's recess; independent of lateral clearance. */
  depthClearanceMm?: number;
  leadInMm?: number;
}
export interface TabSlotOptions extends CommonOptions {
  tabWidthMm: number;
  tabDepthMm?: number;
  shoulderMm?: number;
  bodyDepthMm?: number;
  slotBorderMm?: number;
  /** Extend each end of the slot by this amount and round it with this radius. */
  slotEndReliefMm?: number;
  leadInMm?: number;
}
export interface CrossLapOptions extends CommonOptions {
  heightMm: number;
  widthMm?: number;
  /** Total extra depth shared equally between the two opposing notches. */
  depthClearanceMm?: number;
}
export interface DovetailOptions extends CommonOptions {
  neckWidthMm: number;
  headWidthMm: number;
  depthMm: number;
  shoulderMm?: number;
  bodyDepthMm?: number;
  depthClearanceMm?: number;
}
export interface PathGeometry {
  pathData: string;
  bounds: Bounds;
  /** Vertices without repeated closing point; absent on analytic rounded rectangles. */
  points?: readonly Point[];
}
export interface Contour {
  id: string;
  role: 'outer' | 'hole';
  nominal: PathGeometry;
  toolpath: PathGeometry;
}
export interface Panel {
  id: string;
  contours: readonly Contour[];
  /** Bounds of the actual exported toolpaths. */
  bounds: Bounds;
}
export interface JointPart extends Panel {
  id: 'sideA' | 'sideB';
}
export interface EdgeProfile {
  points: readonly Point[];
  pathData: string;
  closed: false;
  compensation: 'none';
  /** Start -> end follows local +X. Material is on local +Y. */
  materialSide: 'positive-y';
}
export interface PlacedEdgeProfile extends Omit<EdgeProfile, 'materialSide'> {
  materialSide: 'left' | 'right';
  materialNormal: Point;
}
export interface FitEstimate {
  nominalClearanceMm: number;
  minimumClearanceMm: number;
  maximumClearanceMm: number;
  classification: 'clearance' | 'interference' | 'transition' | 'line-to-line';
}
export interface FitOptions {
  maleMm: number;
  femaleMm: number;
  maleToleranceMm?: number;
  femaleToleranceMm?: number;
}
export interface JointResult {
  schemaVersion: 1;
  kind: 'finger' | 'tab-slot' | 'cross-lap' | 'dovetail';
  units: 'mm';
  sideA: JointPart;
  sideB: JointPart;
  /** Nominal open edges for embedding in your own closed part outlines. */
  edges: { sideA: EdgeProfile; sideB?: EdgeProfile };
  measurements: Readonly<Record<string, number>>;
  fits: Readonly<Record<string, FitEstimate>>;
  machining: {
    compensation: 'geometry' | 'cam';
    kerfMm: { sideA: number; sideB: number };
    additionalOffsetMm: { sideA: number; sideB: number };
  };
  issues: readonly Issue[];
  pattern?: { key?: string; fingers: readonly { startMm: number; endMm: number }[] };
}
export interface SvgOptions {
  geometry?: 'toolpath' | 'nominal';
  gapMm?: number;
  paddingMm?: number;
  title?: string;
}
export interface FitTestOptions extends Omit<TabSlotOptions, 'clearanceMm'> {
  clearancesMm: readonly number[];
}
export interface FitTestResult {
  schemaVersion: 1;
  units: 'mm';
  samples: readonly { index: number; clearanceMm: number; joint: JointResult }[];
  svg: string;
  /** Labels are separate from cutting geometry, keyed by pair index left-to-right. */
  manifest: readonly { index: number; clearanceMm: number; fits: JointResult['fits'] }[];
}
export interface BoxOptions extends Omit<CommonOptions, 'mateThicknessMm' | 'kerfMm'> {
  innerWidthMm: number;
  innerDepthMm: number;
  innerHeightMm: number;
  kerfMm: number;
  fingerWidthMm?: number;
  baseElevationMm?: number;
}
export type Vector3 = readonly [number, number, number];
export interface BoxPanel extends Panel {
  id: 'bottom' | 'front' | 'back' | 'left' | 'right';
  /** World position = origin + u*x + v*y + normal*extrusion; millimetres. */
  assembly: { originMm: Vector3; u: Vector3; v: Vector3; normal: Vector3; thicknessMm: number };
}
export interface BoxResult {
  schemaVersion: 1;
  kind: 'box';
  units: 'mm';
  panels: readonly BoxPanel[];
  dimensions: {
    innerWidthMm: number;
    innerDepthMm: number;
    innerHeightMm: number;
    outerWidthMm: number;
    outerDepthMm: number;
    outerHeightMm: number;
    baseElevationMm: number;
    thicknessMm: number;
  };
  machining: { compensation: 'geometry' | 'cam'; kerfMm: number; additionalOffsetMm: number };
  clearanceMm: number;
  fits: Readonly<Record<string, FitEstimate>>;
  issues: readonly Issue[];
}
