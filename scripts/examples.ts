import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  createFingerJointPair,
  createTabSlotJoint,
  createCrossLapJoint,
  createDovetailJointPair,
  createBox,
  createFitTest,
  toSvg,
} from '../dist/index.js';
import type { JointResult, BoxResult, FitTestResult } from '../src/types.js';
await mkdir('examples/generated', { recursive: true });
async function example<Options>(
  name: string,
  fn: (options: Options) => JointResult | BoxResult | FitTestResult,
) {
  // Each generator validates its JSON input at runtime.
  const options: unknown = JSON.parse(await readFile(`examples/${name}.json`, 'utf8'));
  const result = fn(options as Options);
  await writeFile(
    `examples/generated/${name}.svg`,
    'svg' in result ? result.svg : toSvg(result, { title: name }),
  );
  await writeFile(
    `examples/generated/${name}.json`,
    JSON.stringify('manifest' in result ? result.manifest : result, null, 2) + '\n',
  );
}
await Promise.all([
  example('box-corner', createFingerJointPair),
  example('keyed-fingers', createFingerJointPair),
  example('dovetail', createDovetailJointPair),
  example('box', createBox),
  example('display-stand', createTabSlotJoint),
  example('divider', createCrossLapJoint),
  example('calibration', createFitTest),
]);
console.log('Generated seven reproducible SVG examples and their measurements.');
