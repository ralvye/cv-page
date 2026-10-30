import * as THREE from 'three';
import { stations } from './content.js';
import './style.css';

const N = stations.length;
const STEP = 14;
const PATH_Y = 0.3;
const SEA_Y = -1.2;
const WATER_Y = -0.5;

const PATH_COLOR = 0xe2c48f;
const SAND_COLOR = 0xe9d8a6;
const GRASS_COLOR = 0x7cb342;
const HILL_COLOR = 0x5e9a3a;
const MARKER_COLORS = [0xff6b6b, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0x8338ec, 0xfb8500, 0x3a86ff];

const canvas = document.getElementById('scene');
const card = document.getElementById('card');
const dotsEl = document.getElementById('dots');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ef);
scene.fog = new THREE.Fog(0x9fd8ef, 90, 260);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f3a, 1.6));
const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
sun.position.set(40, 60, 30);
scene.add(sun);

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7);

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Recorrido de la cámara: una línea de estaciones que serpentea.
const controlPoints = stations.map((_, i) => new THREE.Vector3(i * STEP, PATH_Y, Math.sin(i * 0.9) * 9));
const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.5);
const samples = curve.getSpacedPoints(360);
const cx = ((N - 1) * STEP) / 2;

// Altura del terreno y distancia al camino (en el plano XZ).
function landInfo(x, z) {
  let d2 = Infinity;
  for (const p of samples) {
    const dx = p.x - x;
    const dz = p.z - z;
    const v = dx * dx + dz * dz;
    if (v < d2) d2 = v;
  }
  const d = Math.sqrt(d2);
  const shore = smoothstep(16, 26, d);
  const hills = 1.2 + Math.sin(x * 0.31) * Math.cos(z * 0.37) * 1.4 + Math.sin(x * 0.83 + z * 0.61) * 0.35;
  const inland = Math.max(0, hills) * (1 - shore);
  const land = PATH_Y + inland * smoothstep(1.5, 6, d);
  const h = land + (SEA_Y - land) * shore;
  return { h, d };
}

// Terreno con colores por vértice.
const groundGeo = new THREE.PlaneGeometry(340, 180, 170, 90);
groundGeo.rotateX(-Math.PI / 2);
groundGeo.translate(cx, 0, 0);
const groundPos = groundGeo.attributes.position;
const groundColors = new Float32Array(groundPos.count * 3);
const tmpColor = new THREE.Color();
for (let i = 0; i < groundPos.count; i++) {
  const x = groundPos.getX(i);
  const z = groundPos.getZ(i);
  const { h, d } = landInfo(x, z);
  groundPos.setY(i, h);
  if (d < 2.4) tmpColor.setHex(PATH_COLOR);
  else if (h < 0.7) tmpColor.setHex(SAND_COLOR);
  else tmpColor.setHex(h < 3.2 ? GRASS_COLOR : HILL_COLOR);
  groundColors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(
  groundGeo,
  new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
);
scene.add(ground);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x2b8fd6, roughness: 0.35, metalness: 0.05 })
);
water.position.set(cx, WATER_Y, 0);
scene.add(water);

// Árboles con InstancedMesh.
const treeSpots = [];
for (let attempt = 0; attempt < 2000 && treeSpots.length < 90; attempt++) {
  const x = -20 + rand() * (cx * 2 + 40);
  const z = (rand() - 0.5) * 80;
  const { h, d } = landInfo(x, z);
  if (h > 0.9 && d > 5 && rand() < 0.5) {
    treeSpots.push({ x, z, h, s: 0.8 + rand() * 0.6, r: rand() * Math.PI * 2 });
  }
}
const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6);
trunkGeo.translate(0, 0.8, 0);
const leafGeo = new THREE.ConeGeometry(1.4, 3.2, 7);
leafGeo.translate(0, 2.9, 0);
const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a4f2a }), treeSpots.length);
const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x2f8f46, flatShading: true }), treeSpots.length);
const matrix = new THREE.Matrix4();
const q = new THREE.Quaternion();
treeSpots.forEach((t, i) => {
  q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
  matrix.compose(new THREE.Vector3(t.x, t.h, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
  trunks.setMatrixAt(i, matrix);
  leaves.setMatrixAt(i, matrix);
});
scene.add(trunks, leaves);

// Estaciones: una plataforma y un icosaedro flotante por sección.
const markers = [];
stations.forEach((_, i) => {
  const p = curve.getPointAt(i / (N - 1));
  const color = MARKER_COLORS[i % MARKER_COLORS.length];

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.1, 0.5, 40),
    new THREE.MeshLambertMaterial({ color: 0xf4f1ea })
  );
  base.position.set(p.x, PATH_Y + 0.05, p.z);
  scene.add(base);

  const markerY = PATH_Y + 5;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, flatShading: true })
  );
  mesh.position.set(p.x, markerY, p.z);
  scene.add(mesh);
  markers.push({ mesh, y: markerY, phase: i * 0.7 });
});

// Nubes.
const clouds = [];
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
for (let k = 0; k < 10; k++) {
  const g = new THREE.Group();
  for (let j = 0; j < 4; j++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rand() * 2, 12, 10), cloudMat);
    s.position.set(j * 2.4 - 3, rand() * 0.8, rand() * 1.5);
    g.add(s);
  }
  g.position.set(-40 + rand() * (cx * 2 + 80), 20 + rand() * 10, -60 + rand() * 120);
  scene.add(g);
  clouds.push(g);
}

// Navegación.
let index = 0;
let progress = 0;
let lastWheel = 0;
let cardToken = 0;

function buildCard(st, i) {
  const frag = document.createDocumentFragment();
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  frag.append(el('p', 'eyebrow', `${String(i + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')} · ${st.label}`));
  frag.append(el('h1', null, st.title));
  if (st.lead) frag.append(el('p', 'lead', st.lead));

  for (const b of st.blocks) {
    if (b.heading) {
      const item = el('div', 'job');
      item.append(el('h2', null, b.heading));
      if (b.meta) item.append(el('span', 'meta', b.meta));
      if (b.text) item.append(el('p', null, b.text));
      frag.append(item);
    } else if (b.items) {
      const ul = el('ul', 'list');
      for (const t of b.items) ul.append(el('li', null, t));
      frag.append(ul);
    } else if (b.links) {
      const wrap = el('div', 'links');
      for (const l of b.links) {
        const a = el('a', null, l.label);
        a.href = l.href;
        if (l.href.startsWith('http')) {
          a.target = '_blank';
          a.rel = 'noopener';
        }
        wrap.append(a);
      }
      frag.append(wrap);
    } else if (b.text) {
      frag.append(el('p', null, b.text));
    }
  }
  return frag;
}

function renderCard(i, instant = false) {
  const token = ++cardToken;
  const show = () => {
    card.replaceChildren(buildCard(stations[i], i));
    card.scrollTop = 0;
    card.classList.add('show');
  };
  if (instant) {
    show();
    return;
  }
  card.classList.remove('show');
  setTimeout(() => {
    if (token === cardToken) show();
  }, 180);
}

const dots = stations.map((st, i) => {
  const b = document.createElement('button');
  b.className = 'dot';
  b.setAttribute('aria-label', st.label);
  b.addEventListener('click', () => goTo(i));
  return b;
});
dotsEl.replaceChildren(...dots);

function updateDots() {
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
}

function goTo(i, instant = false) {
  const next = Math.min(N - 1, Math.max(0, i));
  if (next === index && !instant) return;
  index = next;
  renderCard(index, instant);
  updateDots();
}

function step(dir) {
  goTo(index + dir);
}

prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));

window.addEventListener(
  'wheel',
  (e) => {
    if (e.target.closest('#card') && card.scrollHeight > card.clientHeight) return;
    e.preventDefault();
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 8) return;
    const now = performance.now();
    if (now - lastWheel < 700) return;
    lastWheel = now;
    step(Math.sign(delta));
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
    e.preventDefault();
    step(1);
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
    e.preventDefault();
    step(-1);
  }
});

let touchStartY = null;
let touchInCard = false;
window.addEventListener(
  'touchstart',
  (e) => {
    touchStartY = e.touches[0].clientY;
    touchInCard = !!e.target.closest('#card');
  },
  { passive: true }
);
window.addEventListener(
  'touchend',
  (e) => {
    if (touchStartY === null || touchInCard) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(dy) > 50) step(Math.sign(dy));
  },
  { passive: true }
);

// Cámara: sigue el camino detrás de la estación activa.
const tmpP = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
function updateCamera() {
  curve.getPointAt(progress, tmpP);
  curve.getTangentAt(progress, tmpT);
  camera.position.copy(tmpP).addScaledVector(tmpT, -10);
  camera.position.y += 7;
  tmpLook.copy(tmpP).addScaledVector(tmpT, 2);
  tmpLook.y += 2.5;
  camera.lookAt(tmpLook);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (w >= 760) {
    camera.setViewOffset(w, h, w * 0.18, 0, w, h);
  } else {
    camera.setViewOffset(w, h, 0, h * 0.2, w, h);
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let lastTime = performance.now();
let elapsed = 0;
function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;
  const goal = index / (N - 1);
  progress += (goal - progress) * Math.min(1, dt * 3.5);

  updateCamera();

  const t = elapsed;
  for (const m of markers) {
    m.mesh.rotation.y += dt * 0.8;
    m.mesh.position.y = m.y + Math.sin(t * 1.6 + m.phase) * 0.25;
  }
  for (const c of clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > cx * 2 + 60) c.position.x = -40;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
goTo(0, true);
frame();
