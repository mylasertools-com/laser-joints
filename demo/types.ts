import type { BoxResult, JointResult } from '../src/types.js';
export type DemoResult = BoxResult | JointResult;
export type PreviewMode = '3d' | 'sheet';
export interface DemoControls {
  getResult(): DemoResult | null;
  setExplosion(value: number): void;
  render(): void;
  getView(): PreviewMode;
}
declare global {
  interface Window {
    laserJointsDemo: DemoControls;
  }
}
