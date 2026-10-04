import * as THREE from 'three';

/**
 * STELLA — the flux trace.
 *
 * The signature element: one canvas carrying ingest → impact, scrubbed
 * by scroll. The point cloud a depth sensor returns and a flare time
 * series have more in common than it first appears: both are a dense
 * set of measurements that arrive over time, both have a near/far
 * structure, and both resolve from noise into something readable once
 * you know what to look for. So the hero is built the same way, and the
 * colour ramp does the same job: near is hot, mid is identified, far is
 * settled.
 *
 * Every number the scene draws is either a named GOES/SOLEXS class
 * threshold or a value derived from the procedural trace itself, which
 * is generated from a fixed seed so the field is identical on every
 * reload and resize. Nothing here is a benchmark, and the readout
 * labels it as samples rather than events.
 */

export const STAGES = [
  ['01', 'Ingest', 'Aditya-L1 SoLEXS and HEL1OS counts stream in at one-minute cadence.'],
  ['02', 'Nowcast', 'The CNN labels each sample against the A/B/C/M/X flux tiers.'],
  ['03', 'Hardness', 'The soft-to-hard ratio isolates the pre-flare signature.'],
  ['04', 'Forecast', 'The TCN projects probability three hours ahead.'],
  ['05', 'Impact', 'Regional risk propagates to ground infrastructure.'],
  ['06', 'Record', 'The event is written to the catalog with its lead time.'],
];

/* The detector's running log. Accumulates, never overwrites: each line
   is a conclusion the pipeline actually reached, in order. */
export const PLAN_LOG = [
  'solexs · sdd1+sdd2 · soft x-ray',
  'hel1os · cdte+czt · hard x-ray',
  'z-score against rolling mad baseline',
  'hardness ratio crossing 0.06',
  'tcn-8l · 3h causal context',
  'noaa scale r reassessed per region',
  'event written · lead time recorded',
];

/* GOES flux tiers in W/m². Named constants, not tuned numbers. */
const TIER_A = 1e-8;
const TIER_B = 1e-7;
const TIER_C = 1e-6;
const TIER_M = 1e-5;
const TIER_X = 1e-4;

export const HARDNESS_THRESHOLD = 0.06;

/** Deterministic RNG — the trace must look identical on every reload. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Log-spaced flux, so a quiet-Sun sample at 1e-9 and a strong flare at
   1e-5 land at readable heights instead of the first collapsing into
   the floor. This is the same scaling a real X-ray plot uses. */
const LOG_FLOOR = -9;
const LOG_CEIL = -4.5;

function fluxToUnit(flux) {
  const l = Math.log10(Math.max(1e-12, flux));
  return Math.min(1, Math.max(0, (l - LOG_FLOOR) / (LOG_CEIL - LOG_FLOOR)));
}

/**
 * Build the trace. A quiet-Sun floor with stochastic jitter, two
 * flaring regions of differing intensity, and the impulsive rise and
 * exponential decay each real flare shows.
 */
function buildTrace() {
  const rand = mulberry32(20260915);
  const n = 5400;
  const pts = new Float32Array(n * 4); // x, y, z, class-rank
  const times = new Float32Array(n);
  const fluxes = new Float32Array(n);
  const hardness = new Float32Array(n);

  // Two flaring regions, in sample indices.
  const events = [
    { at: 1180, width: 210, peak: 2.4e-5, hard: 0.052 },
    { at: 3260, width: 340, peak: 3.1e-4, hard: 0.081 },
    { at: 4380, width: 150, peak: 8.6e-6, hard: 0.044 },
  ];

  for (let i = 0; i < n; i++) {
    // Quiet-Sun baseline: an order of magnitude below B, with jitter.
    let flux = TIER_A * 0.55 * (0.55 + rand() * 0.9);
    let hard = 0.031 + rand() * 0.008;

    for (const ev of events) {
      const d = (i - ev.at) / ev.width;
      if (Math.abs(d) < 3.2) {
        // Neupert-style profile: fast rise, exponential decay.
        const shape =
          d < 0 ? Math.exp(-Math.pow(d * 2.1, 2)) : Math.exp(-d * 1.45);
        flux += ev.peak * shape;
        // Hard X-rays rise ahead of the soft peak, which is the whole
        // basis of the pre-flare warning.
        const hardLead = d + 0.42;
        hard += ev.hard * Math.exp(-Math.pow(hardLead * 2.6, 2)) * 0.9;
      }
    }

    const u = fluxToUnit(flux);
    const y = u * 10 - 4.5;
    const z = (i / (n - 1)) * 52 - 26;
    // A slow drift on x so the band is a ribbon, not a wall.
    const x = Math.sin(i * 0.004) * 2.2 + (rand() - 0.5) * 0.5;

    let rank = 0;
    if (flux >= TIER_X) rank = 5;
    else if (flux >= TIER_M) rank = 4;
    else if (flux >= TIER_C) rank = 3;
    else if (flux >= TIER_B) rank = 2;
    else if (flux >= TIER_A) rank = 1;

    pts[i * 4 + 0] = x;
    pts[i * 4 + 1] = y;
    pts[i * 4 + 2] = z;
    pts[i * 4 + 3] = rank;

    times[i] = i * 60 * 1000; // one-minute cadence
    fluxes[i] = flux;
    hardness[i] = hard;
  }

  return { pts, times, fluxes, hardness, n };
}

export const TRACE = buildTrace();

/* ------------------------------------------------------------------ materials */

/**
 * Signal colours are unlit. A colour that a light bounces off is a
 * colour the scene's lighting can change, and then the Measured Colour
 * Rule quietly stops being true — orange would start meaning "lit from
 * above" as well as "happening now". toneMapped:false keeps the token
 * values exactly as specified.
 */
function makePointMaterial(size, near, mid, far, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size },
      uNear: { value: new THREE.Color(near) },
      uMid: { value: new THREE.Color(mid) },
      uFar: { value: new THREE.Color(far) },
      uOpacity: { value: opacity },
      uReveal: { value: 0 },
      uProgress: { value: 0 },
    },
    vertexShader: `
      attribute float aRank;
      attribute float aIndex;
      uniform float uSize;
      uniform float uReveal;
      uniform float uProgress;
      varying float vRank;
      varying float vFade;

      void main() {
        vRank = aRank;

        vec3 p = position;

        // The trace assembles in time: each sample rises from the floor
        // as the sweep reaches it, so the ingest reads as a sweep.
        float reached = step(aIndex / uReveal, 1.0);
        p.y = mix(-4.5, p.y, reached);
        vFade = reached;

        // The forecast band lifts off the trace ahead of the sweep.
        float horizon = uProgress;
        p.y += smoothstep(horizon, horizon + 0.12, 1.0 - aIndex) * 1.6;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (18.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uNear;
      uniform vec3 uMid;
      uniform vec3 uFar;
      uniform float uOpacity;
      varying float vRank;
      varying float vFade;

      void main() {
        // Circular point: a sample is a point in space, so it may be a
        // circle where a container may not.
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;

        // Measured Colour: rank maps to class, class maps to tone.
        // 5 X / 4 M -> the hot end, 3 C -> identified, <=2 -> settled.
        vec3 col = uFar;
        if (vRank >= 4.5)      col = uNear;
        else if (vRank >= 3.5) col = uNear;
        else if (vRank >= 2.5) col = uMid;
        else                   col = uFar;

        float a = uOpacity * vFade;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/* --------------------------------------------------------------------- scene */

export function createScene(canvas) {
  if (!canvas) return { render: () => ({ phase: 0, samples: 0 }), resize() {}, dispose() {} };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xeef0ea, 0.014);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
  camera.position.set(0, 3.2, 30);

  const { pts, n, fluxes, hardness } = TRACE;

  const positions = new Float32Array(n * 3);
  const ranks = new Float32Array(n);
  const indices = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    positions[i * 3 + 0] = pts[i * 4 + 0];
    positions[i * 3 + 1] = pts[i * 4 + 1];
    positions[i * 3 + 2] = pts[i * 4 + 2];
    ranks[i] = pts[i * 4 + 3];
    indices[i] = i / (n - 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRank', new THREE.BufferAttribute(ranks, 1));
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));

  const material = makePointMaterial(2.6, '#ff5b2e', '#14b09a', '#22307e', 0.92);
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /* The floor rule. A drawing sits on a sheet, and this is the sheet the
     trace sits on: hairline gridlines in rule grey, no fill, no shadow. */
  const grid = new THREE.GridHelper(120, 48, 0xcbd1c7, 0xcbd1c7);
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  grid.position.y = -4.5;
  scene.add(grid);

  /* The A/B/C/M/X tier planes. These are the thresholds the nowcast
     classifies against, so drawing them is showing the work rather
     than decorating it. */
  const tierGroup = new THREE.Group();
  for (const [flux, tone] of [
    [TIER_A, '#22307e'],
    [TIER_B, '#22307e'],
    [TIER_C, '#14b09a'],
    [TIER_M, '#ff5b2e'],
    [TIER_X, '#ff5b2e'],
  ]) {
    const y = fluxToUnit(flux) * 10 - 4.5;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, y, -26),
      new THREE.Vector3(0, y, 26),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(tone),
        transparent: true,
        opacity: flux === TIER_M || flux === TIER_X ? 0.42 : 0.16,
      })
    );
    tierGroup.add(line);
  }
  scene.add(tierGroup);

  /* The sweep head: the instrument's current position on the trace. A
     point in space, so it is a circle. */
  const sweep = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#ff5b2e', toneMapped: false })
  );
  scene.add(sweep);

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /**
   * Six phases across the scrub, each named in STAGES so the caption and
   * the geometry cannot drift apart. The camera path is one continuous
   * move: it starts looking at the quiet floor, rises with the sweep, and
   * pulls back as the forecast band lifts off.
   */
  function render(progress) {
    const p = Math.min(1, Math.max(0, progress));
    const phase = Math.min(STAGES.length - 1, Math.floor(p * STAGES.length));

    const reveal = Math.min(1, p * 1.35);
    material.uniforms.uReveal.value = reveal;
    material.uniforms.uProgress.value = p;

    // The forecast band only exists from phase 3 on.
    const forecastOn = p > 0.5;
    material.uniforms.uOpacity.value = forecastOn ? 0.95 : 0.88;

    // Sweep head rides the trace at the reveal frontier.
    const headIdx = Math.min(n - 1, Math.floor(reveal * (n - 1)));
    sweep.position.set(pts[headIdx * 4 + 0], pts[headIdx * 4 + 1], pts[headIdx * 4 + 2]);
    sweep.visible = p > 0.01 && p < 0.985;

    // Camera: rise and pull back across the scrub.
    const eased = p * p * (3 - 2 * p);
    camera.position.y = 2.0 + eased * 3.4;
    camera.position.z = 30 - eased * 9;
    camera.lookAt(0, -1.2 + eased * 2.6, -6);

    grid.material.opacity = 0.42 * (1 - eased * 0.55);
    tierGroup.rotation.y = eased * 0.16;

    renderer.render(scene, camera);

    // Counted from the trace, not asserted: samples at or above the
    // flare threshold, and how many of those cleared the hardness gate.
    let above = 0;
    let hardened = 0;
    const upto = Math.floor(reveal * n);
    for (let i = 0; i < upto; i++) {
      if (fluxes[i] >= TIER_C) {
        above++;
        if (hardness[i] >= HARDNESS_THRESHOLD) hardened++;
      }
    }

    /* The decision log's per-line opacity. Each line arrives once the sweep
       has cleared the stage that produces it and holds, so the block reads as
       an accumulating record rather than a status line overwriting itself. */
    const plan = PLAN_LOG.map((_, i) => {
      const at = (i + 0.5) / PLAN_LOG.length;
      return Math.min(1, Math.max(0, (p - at) * 6));
    });

    return { phase, samples: upto, above, hardened, plan, rest: p < 0.005 };
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    grid.geometry.dispose();
    grid.material.dispose();
    tierGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    sweep.geometry.dispose();
    sweep.material.dispose();
    renderer.dispose();
  }

  return { render, resize, dispose };
}