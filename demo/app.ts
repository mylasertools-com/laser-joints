import {
  createBox,
  createFingerJointPair,
  createTabSlotJoint,
  createCrossLapJoint,
  createDovetailJointPair,
  createFitTest,
  toSvg,
  JointError,
} from '../src/index.ts';
import type {
  BoxOptions,
  FingerJointOptions,
  TabSlotOptions,
  CrossLapOptions,
  DovetailOptions,
  CommonOptions,
  BoxPanel,
  Vector3,
} from '../src/types.js';
import type { DemoResult, PreviewMode } from './types.js';
import { element as $, input, button, errorMessage } from './dom.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

const ns = 'http://www.w3.org/2000/svg';
type Kind = 'box' | 'finger' | 'keyed' | 'tab-slot' | 'cross-lap' | 'dovetail';
type Options = BoxOptions | FingerJointOptions | TabSlotOptions | CrossLapOptions | DovetailOptions;
interface Configuration {
  name: string;
  title: string;
  kicker: string;
  fields: Array<[string, string, number | string]>;
}
const colors = ['#bf935e', '#ddb677', '#c4a176', '#759783', '#aabc9c'];
const configs: Record<Kind, Configuration> = {
  box: {
    name: 'createBox',
    title: 'An open box, from the inside out.',
    kicker: 'FIVE PARTS, ONE ASSEMBLY',
    fields: [
      ['innerWidthMm', 'Inner width', 90],
      ['innerDepthMm', 'Inner depth', 65],
      ['innerHeightMm', 'Inner height', 45],
      ['fingerWidthMm', 'Finger width', 6],
    ],
  },
  finger: {
    name: 'createFingerJointPair',
    title: 'A shared pattern. A matching pair.',
    kicker: 'FINGER JOINT',
    fields: [
      ['lengthMm', 'Edge length', 100],
      ['targetFingerWidthMm', 'Finger width', 6],
      ['leadInMm', 'Insertion chamfer', 0.25],
    ],
  },
  keyed: {
    name: 'createFingerJointPair',
    title: 'A little asymmetry. A clear direction.',
    kicker: 'KEYED FINGER PATTERN',
    fields: [
      ['lengthMm', 'Edge length', 100],
      ['targetFingerWidthMm', 'Target cell width', 6],
      ['leadInMm', 'Insertion chamfer', 0.25],
      ['key', 'Assembly key', 'front-left'],
    ],
  },
  'tab-slot': {
    name: 'createTabSlotJoint',
    title: 'A tab, a slot, and room for the fit.',
    kicker: 'TAB & SLOT',
    fields: [
      ['tabWidthMm', 'Tab width', 14],
      ['mateThicknessMm', 'Receiver thickness', 3],
      ['leadInMm', 'Insertion chamfer', 0.3],
      ['slotEndReliefMm', 'Slot-end relief', 0.4],
    ],
  },
  'cross-lap': {
    name: 'createCrossLapJoint',
    title: 'Two halves. One crossing.',
    kicker: 'CROSS-LAP JOINT',
    fields: [
      ['heightMm', 'Panel height', 40],
      ['widthMm', 'Panel width', 50],
      ['mateThicknessMm', 'Other thickness', 3],
      ['depthClearanceMm', 'Depth allowance', 0.1],
    ],
  },
  dovetail: {
    name: 'createDovetailJointPair',
    title: 'A flared connection that holds its line.',
    kicker: 'DOVETAIL SPLICE',
    fields: [
      ['neckWidthMm', 'Neck width', 10],
      ['headWidthMm', 'Head width', 18],
      ['depthMm', 'Joint depth', 8],
      ['depthClearanceMm', 'Depth allowance', 0.1],
    ],
  },
};
let kind: Kind = 'box';
let result: DemoResult | null = null;
let options: Options | null = null;
let view: PreviewMode = '3d';
let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
interface Model {
  mesh: THREE.Group;
  assembly: BoxPanel['assembly'];
  direction: Vector3;
  center: Vector3;
}
let models: Model[] = [];
let animating = false,
  frame = 0,
  start = 0;
const f = (n: number) => Number(n.toFixed(2));
function fields() {
  $('specific').replaceChildren();
  for (const [id, label, value] of configs[kind].fields) {
    const el = document.createElement('label');
    el.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.value = String(value);
    input.type = typeof value === 'string' ? 'text' : 'number';
    if (input.type === 'number') {
      input.step = '0.05';
      input.min = '0';
      input.max = '1000';
    } else input.maxLength = 64;
    input.required = true;
    el.append(input);
    $('specific').append(el);
  }
}
function generate() {
  const number = (id: string) => input(id).valueAsNumber;
  const common: CommonOptions & { kerfMm: number } = {
    thicknessMm: number('thickness'),
    kerfMm: number('kerf'),
    clearanceMm: number('clearance'),
    minFeatureMm: number('minFeature'),
    minWebMm: number('minWeb'),
    tolerances: { cutMm: number('cutTolerance'), thicknessMm: number('thicknessTolerance') },
    compensation: input('cam').checked ? 'cam' : 'geometry',
    brittleMaterial: input('brittle').checked,
  };
  const make = <O extends Options>(fn: (o: O) => DemoResult, options: O) => ({
    options,
    result: fn(options),
  });
  switch (kind) {
    case 'box':
      return make(createBox, {
        ...common,
        innerWidthMm: number('innerWidthMm'),
        innerDepthMm: number('innerDepthMm'),
        innerHeightMm: number('innerHeightMm'),
        fingerWidthMm: number('fingerWidthMm'),
      });
    case 'finger':
    case 'keyed':
      return make(createFingerJointPair, {
        ...common,
        lengthMm: number('lengthMm'),
        targetFingerWidthMm: number('targetFingerWidthMm'),
        leadInMm: number('leadInMm'),
        ...(kind === 'keyed' ? { key: input('key').value } : {}),
      });
    case 'tab-slot':
      return make(createTabSlotJoint, {
        ...common,
        tabWidthMm: number('tabWidthMm'),
        mateThicknessMm: number('mateThicknessMm'),
        leadInMm: number('leadInMm'),
        slotEndReliefMm: number('slotEndReliefMm'),
      });
    case 'cross-lap':
      return make(createCrossLapJoint, {
        ...common,
        heightMm: number('heightMm'),
        widthMm: number('widthMm'),
        mateThicknessMm: number('mateThicknessMm'),
        depthClearanceMm: number('depthClearanceMm'),
      });
    case 'dovetail':
      return make(createDovetailJointPair, {
        ...common,
        neckWidthMm: number('neckWidthMm'),
        headWidthMm: number('headWidthMm'),
        depthMm: number('depthMm'),
        depthClearanceMm: number('depthClearanceMm'),
      });
  }
}
function renderSheet() {
  if (!result) return;
  const panels = result.kind === 'box' ? result.panels : [result.sideA, result.sideB];
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${kind} finished parts and cutting paths`);
  let x = 0,
    maxH = 0;
  const gap = kind === 'box' ? 12 : 10;
  const columns = kind === 'box' ? 3 : 2;
  let rowY = 0,
    rowH = 0,
    totalW = 0;
  panels.forEach((p, i) => {
    if (i && i % columns === 0) {
      rowY += rowH + gap + 6;
      x = 0;
      rowH = 0;
    }
    const b = p.bounds,
      g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${x - b.x} ${rowY - b.y})`);
    const shape = document.createElementNS(ns, 'path');
    shape.setAttribute('d', p.contours.map((c) => c.nominal.pathData).join(' '));
    shape.setAttribute('fill-rule', 'evenodd');
    shape.setAttribute('fill', colors[i % colors.length]);
    shape.setAttribute('stroke', '#725e42');
    shape.setAttribute('stroke-width', '.16');
    g.append(shape);
    if (input('show-toolpath').checked) {
      for (const c of p.contours) {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', c.toolpath.pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#af493a');
        path.setAttribute('stroke-width', '.15');
        g.append(path);
      }
    }
    const label = document.createElementNS(ns, 'text');
    label.textContent = p.id.replace('side', 'Side ');
    label.setAttribute('x', String(b.x));
    label.setAttribute('y', String(b.y + b.height + 4));
    label.setAttribute('font-size', '2.3');
    label.setAttribute('fill', '#69786b');
    g.append(label);
    svg.append(g);
    x += b.width + gap;
    totalW = Math.max(totalW, x - gap);
    rowH = Math.max(rowH, b.height);
    maxH = Math.max(maxH, rowY + b.height + 5);
  });
  svg.setAttribute('viewBox', `-3 -3 ${totalW + 6} ${maxH + 6}`);
  $('sheet-view').replaceChildren(svg);
}
function init3d() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('three-view').append(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7f735f, 2.4));
    const light = new THREE.DirectionalLight(0xfff3dd, 3);
    light.position.set(-100, -120, 250);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -200;
    light.shadow.camera.right = 200;
    light.shadow.camera.top = 200;
    light.shadow.camera.bottom = -200;
    light.shadow.bias = -0.0003;
    scene.add(light);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    );
    ground.position.z = -0.3;
    ground.receiveShadow = true;
    scene.add(ground);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.addEventListener('change', draw3d);
    new ResizeObserver(resize3d).observe($('three-view'));
    return true;
  } catch {
    renderer = null;
    return false;
  }
}
function draw3d() {
  if (renderer && view === '3d') renderer.render(scene, camera);
}
function resize3d() {
  if (!renderer) return;
  const w = $('three-view').clientWidth,
    h = $('three-view').clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  draw3d();
}
function build3d() {
  if (!result || result.kind !== 'box' || !init3d()) return;
  for (const item of models) {
    scene.remove(item.mesh);
    item.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        Array.isArray(o.material) ? o.material.forEach((m) => m.dispose()) : o.material.dispose();
      }
    });
  }
  models = [];
  const d = result.dimensions,
    W = d.outerWidthMm,
    D = d.outerDepthMm,
    H = d.outerHeightMm,
    loader = new SVGLoader();
  for (const [i, p] of result.panels.entries()) {
    const data = p.contours.map((c) => c.nominal.pathData).join(' ');
    const shapes = loader
      .parse(
        `<svg xmlns="http://www.w3.org/2000/svg"><path d="${data}" fill="#000" fill-rule="evenodd"/></svg>`,
      )
      .paths.flatMap((path) => SVGLoader.createShapes(path));
    const group = new THREE.Group();
    for (const shape of shapes) {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: p.assembly.thicknessMm,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 12,
      });
      const mesh = new THREE.Mesh(geo, [
        new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: '#8a6745', roughness: 1 }),
      ]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 35),
        new THREE.LineBasicMaterial({ color: '#776245', transparent: true, opacity: 0.3 }),
      );
      mesh.add(edges);
      group.add(mesh);
    }
    const a = p.assembly;
    group.matrixAutoUpdate = false;
    const directions: Record<BoxPanel['id'], Vector3> = {
      bottom: [0, 0, -22],
      front: [0, -32, 0],
      back: [0, 32, 0],
      left: [-32, 0, 0],
      right: [32, 0, 0],
    };
    const direction = directions[p.id];
    scene.add(group);
    models.push({ mesh: group, assembly: a, direction, center: [W / 2, D / 2, 0] });
  }
  const extent = Math.max(W, D, H);
  camera.position.set(extent * 1.35, -extent * 1.7, extent * 1.4);
  camera.near = 0.1;
  camera.far = extent * 30;
  if (!controls) return;
  controls.target.set(0, 0, H * 0.45);
  controls.minDistance = extent * 0.5;
  controls.maxDistance = extent * 8;
  controls.update();
  setExplosion(input('explosion').valueAsNumber);
  resize3d();
}
function setExplosion(value: number) {
  input('explosion').value = String(value);
  if (camera) {
    camera.zoom = 1 / (1 + (value / 100) * 0.45);
    camera.updateProjectionMatrix();
  }
  for (const m of models) {
    const a = m.assembly,
      pos = a.originMm.map((v, i) => v - m.center[i] + (m.direction[i] * value) / 100);
    m.mesh.matrix.set(
      a.u[0],
      a.v[0],
      a.normal[0],
      pos[0],
      a.u[1],
      a.v[1],
      a.normal[1],
      pos[1],
      a.u[2],
      a.v[2],
      a.normal[2],
      pos[2],
      0,
      0,
      0,
      1,
    );
    m.mesh.matrixWorldNeedsUpdate = true;
  }
  draw3d();
}
function stop() {
  animating = false;
  cancelAnimationFrame(frame);
  $('animate').setAttribute('aria-pressed', 'false');
  $('animate').textContent = '▶ Explode / assemble';
}
function tick(t: number) {
  if (!animating) return;
  if (!start) start = t;
  setExplosion((1 - Math.cos((t - start) / 1400)) * 50);
  frame = requestAnimationFrame(tick);
}
function setView(next: PreviewMode) {
  view = next === '3d' && kind === 'box' && renderer ? '3d' : 'sheet';
  $('three-view').hidden = view !== '3d';
  $('sheet-view').hidden = view === '3d';
  $('assembly-bar').hidden = view !== '3d';
  $('toolpath-toggle').hidden = view === '3d';
  button('view-3d').disabled = kind !== 'box' || !renderer;
  $('view-3d').setAttribute('aria-pressed', String(view === '3d'));
  $('view-sheet').setAttribute('aria-pressed', String(view === 'sheet'));
  $('stage-caption').textContent =
    view === '3d' ? 'Drag to orbit · Scroll to zoom' : 'Finished parts · Labels are preview-only';
  if (view !== '3d') stop();
  resize3d();
}
function render() {
  stop();
  $('clearance-value').textContent =
    `${input('clearance').valueAsNumber >= 0 ? '+' : ''}${input('clearance').valueAsNumber.toFixed(2)} mm`;
  try {
    const generated = generate();
    options = generated.options;
    result = generated.result;
    $('stage-error').hidden = true;
    $('status').classList.remove('error');
    $('status').textContent = 'Geometry ready';
    button('download-svg').disabled = false;
    button('download-json').disabled = false;
    button('calibration').disabled = false;
    $('preview-title').textContent = configs[kind].title;
    $('preview-kicker').textContent = configs[kind].kicker;
    const m = result.kind === 'box' ? {} : result.measurements;
    const metrics: Array<[string, number, string]> =
      result.kind === 'box'
        ? [
            ['Inside width', f(result.dimensions.innerWidthMm), 'mm'],
            ['Inside depth', f(result.dimensions.innerDepthMm), 'mm'],
            ['Inside height', f(result.dimensions.innerHeightMm), 'mm'],
          ]
        : [
            ['Parts', 2, ''],
            ['Total clearance', f(options.clearanceMm), 'mm'],
            [
              kind === 'keyed'
                ? 'Narrowest finger'
                : kind === 'finger'
                  ? 'Fingers'
                  : kind === 'tab-slot'
                    ? 'Slot height'
                    : kind === 'dovetail'
                      ? 'Flare angle'
                      : 'Notch depth',
              f(
                kind === 'keyed'
                  ? m.minimumFingerWidthMm
                  : kind === 'finger'
                    ? m.fingerCount
                    : kind === 'tab-slot'
                      ? m.slotHeightMm
                      : kind === 'dovetail'
                        ? m.flareAngleDeg
                        : m.depthMm,
              ),
              kind === 'finger' ? '' : kind === 'dovetail' ? '°' : 'mm',
            ],
          ];
    $('metrics').replaceChildren(
      ...metrics.map(([name, value, unit]) => {
        const div = document.createElement('div');
        div.className = 'metric';
        const label = document.createElement('span');
        label.textContent = name;
        const num = document.createElement('strong');
        num.textContent = String(value) + ' ';
        const u = document.createElement('small');
        u.textContent = unit;
        num.append(u);
        div.append(label, num);
        return div;
      }),
    );
    $('issues').replaceChildren(
      ...result.issues
        .filter((i) => i.code !== 'SHARP_INTERNAL_CORNERS')
        .map((i) => {
          const p = document.createElement('p');
          p.textContent = i.message;
          return p;
        }),
    );
    $('preview-foot').textContent =
      kind === 'dovetail'
        ? 'Assemble coplanar pieces from above. A flared head cannot slide through its narrower neck. Ideal geometry does not model beam rounding or strength.'
        : kind === 'keyed'
          ? 'The same key reproduces both sides. Asymmetric finger widths help identify direction; keys are not a universal guarantee against mismatched assembly.'
          : result.kind === 'tab-slot' && result.measurements.slotEndReliefMm > 0
            ? 'Rounded slot ends leave space for square tab corners. Relief also adds lateral play; the JSON reports the larger width clearance.'
            : options.compensation === 'cam'
              ? 'Nominal contours: apply the reported half-kerf offset in CAM. The preview shows ideal finished geometry.'
              : 'Nominal finished geometry. Downloaded toolpaths include kerf compensation; use zero additional CAM offset.';
    $('code').textContent =
      `import { ${configs[kind].name}, toSvg }\n  from '@mylasertools/laser-joints';\n\nconst result = ${configs[kind].name}(${JSON.stringify(options, null, 2)});\n\nconst svg = toSvg(result);`;
    renderSheet();
    if (kind === 'box') build3d();
    setView(view);
  } catch (error) {
    result = null;
    stop();
    $('stage-error').textContent =
      `${error instanceof JointError ? error.code : 'PREVIEW_ERROR'} — ${errorMessage(error)}`;
    $('stage-error').hidden = false;
    $('status').classList.add('error');
    $('status').textContent = 'Check dimensions';
    button('download-svg').disabled = true;
    button('download-json').disabled = true;
    button('calibration').disabled = true;
    $('metrics').replaceChildren();
    $('issues').replaceChildren();
    $('code').textContent = 'Correct the dimensions to generate an example.';
  }
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((button) =>
  button.addEventListener('click', () => {
    const next = button.dataset.kind;
    if (!next || !Object.hasOwn(configs, next)) throw new Error('Unknown joint selector.');
    kind = next as Kind;
    document
      .querySelectorAll('[data-kind]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    view = kind === 'box' ? '3d' : 'sheet';
    fields();
    render();
  }),
);
$('settings').addEventListener('submit', (e) => e.preventDefault());
$('settings').addEventListener('input', render);
$('view-3d').addEventListener('click', () => setView('3d'));
$('view-sheet').addEventListener('click', () => setView('sheet'));
$('show-toolpath').addEventListener('change', renderSheet);
$('explosion').addEventListener('input', () => {
  stop();
  setExplosion(input('explosion').valueAsNumber);
});
$('animate').addEventListener('click', () => {
  if (animating) stop();
  else {
    animating = true;
    start = 0;
    $('animate').setAttribute('aria-pressed', 'true');
    $('animate').textContent = 'Ⅱ Pause';
    frame = requestAnimationFrame(tick);
  }
});
$('download-svg').addEventListener('click', () => {
  if (result) download(`laser-joints-${kind}.svg`, toSvg(result), 'image/svg+xml');
});
$('download-json').addEventListener('click', () => {
  if (result)
    download(`laser-joints-${kind}.json`, JSON.stringify(result, null, 2), 'application/json');
});
$('calibration').addEventListener('click', () => {
  if (!options) return;
  try {
    const r = createFitTest({
      thicknessMm: options.thicknessMm,
      kerfMm: options.kerfMm,
      tabWidthMm: 12,
      clearancesMm: [-0.1, -0.05, 0, 0.05, 0.1, 0.15],
      ...(options.compensation ? { compensation: options.compensation } : {}),
    });
    download('laser-joints-fit-test.svg', r.svg, 'image/svg+xml');
    $('copy-status').textContent =
      'Fit-test pairs run left to right: −0.10, −0.05, 0, +0.05, +0.10, +0.15 mm. Labels and pair positions are stored in SVG metadata.';
  } catch (e) {
    $('copy-status').textContent = errorMessage(e);
  }
});
$('copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code').textContent ?? '');
    $('copy-status').textContent = 'Copied.';
  } catch {
    $('copy-status').textContent = 'Select the example text to copy it.';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
fields();
render();
// Deterministic preview controls used by the checked-in browser tests and GIF capture.
window.laserJointsDemo = { getResult: () => result, setExplosion, render, getView: () => view };
