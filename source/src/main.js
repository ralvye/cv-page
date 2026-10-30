import * as THREE from 'three';
import { stations } from './content.js';
import './style.css';

const N = stations.length;
const STEP = 16;
const PATH_Y = 0.3;
const SEA_Y = -1.2;
const WATER_Y = -0.5;
const STATION_RADIUS = 5;
const MAX_SPEED = 24;
const MAX_REVERSE = 6;

const PATH_COLOR = 0x2b2d33;
const SAND_COLOR = 0x5a4d36;
const GRASS_COLOR = 0x2f4a2c;
const HILL_COLOR = 0x203522;
const MARKER_COLORS = [0x22d3ee, 0xf472b6, 0xfacc15, 0x4ade80, 0xa78bfa, 0xfb7185, 0x38bdf8, 0xfb923c];

const canvas = document.getElementById('scene');
const card = document.getElementById('card');
const dotsEl = document.getElementById('dots');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.Fog(0x070b14, 60, 190);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

scene.add(new THREE.HemisphereLight(0x5a6fa8, 0x0b120b, 1.0));
const moon = new THREE.DirectionalLight(0xaebfff, 1.4);
moon.position.set(-40, 80, -30);
scene.add(moon);

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

// Trazado de la carretera: las estaciones se ubican sobre esta curva.
const controlPoints = stations.map((_, i) => new THREE.Vector3(i * STEP, PATH_Y, Math.sin(i * 0.9) * 10));
const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.5);
const samples = curve.getSpacedPoints(360);
const cx = ((N - 1) * STEP) / 2;

const stationPos = stations.map((_, i) => {
  const p = curve.getPointAt(i / (N - 1));
  const t = curve.getTangentAt(i / (N - 1));
  return { x: p.x, z: p.z, yaw: Math.atan2(t.x, t.z) };
});

// Altura del terreno y distancia a la carretera en el plano XZ.
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
  if (d < 2.6) tmpColor.setHex(PATH_COLOR);
  else if (h < 0.7) tmpColor.setHex(SAND_COLOR);
  else tmpColor.setHex(h < 3.2 ? GRASS_COLOR : HILL_COLOR);
  groundColors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
groundGeo.computeVertexNormals();
scene.add(
  new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x0c2a44, roughness: 0.4, metalness: 0.1 })
);
water.position.set(cx, WATER_Y, 0);
scene.add(water);

// Árboles con InstancedMesh.
const treeSpots = [];
for (let attempt = 0; attempt < 2000 && treeSpots.length < 90; attempt++) {
  const x = -20 + rand() * (cx * 2 + 40);
  const z = (rand() - 0.5) * 80;
  const { h, d } = landInfo(x, z);
  if (h > 0.9 && d > 6 && rand() < 0.5) {
    treeSpots.push({ x, z, h, s: 0.8 + rand() * 0.6, r: rand() * Math.PI * 2 });
  }
}
const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6);
trunkGeo.translate(0, 0.8, 0);
const leafGeo = new THREE.ConeGeometry(1.4, 3.2, 7);
leafGeo.translate(0, 2.9, 0);
const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x3b2a1a }), treeSpots.length);
const leaves = new THREE.InstancedMesh(
  leafGeo,
  new THREE.MeshLambertMaterial({ color: 0x1d3d25, flatShading: true }),
  treeSpots.length
);
const matrix = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
treeSpots.forEach((t, i) => {
  q.setFromAxisAngle(up, t.r);
  matrix.compose(new THREE.Vector3(t.x, t.h, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
  trunks.setMatrixAt(i, matrix);
  leaves.setMatrixAt(i, matrix);
});
scene.add(trunks, leaves);

// Estaciones: anillo luminoso en el suelo y un icosaedro flotante.
const markers = [];
const rings = [];
stations.forEach((_, i) => {
  const { x, z } = stationPos[i];
  const color = MARKER_COLORS[i % MARKER_COLORS.length];

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 0.4, 40),
    new THREE.MeshLambertMaterial({ color: 0x1a1d26 })
  );
  base.position.set(x, PATH_Y + 0.02, z);
  scene.add(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(STATION_RADIUS - 1, 0.18, 8, 48).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true })
  );
  ring.position.set(x, PATH_Y + 0.1, z);
  scene.add(ring);
  rings.push(ring);

  const markerY = PATH_Y + 5;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, flatShading: true })
  );
  mesh.position.set(x, markerY, z);
  scene.add(mesh);
  markers.push({ mesh, y: markerY, phase: i * 0.7 });
});

// Auto: carrocería, cabina, alerón, ruedas y faros.
function buildCar() {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0xe63946 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1f2a3a });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.4), paint);
  lower.position.y = 0.6;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.7), glass);
  cabin.position.set(0, 1.15, -0.1);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), dark);
  spoiler.position.set(0, 1.0, -1.6);
  g.add(lower, cabin, spoiler);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14).rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [-0.9, 1.15],
    [0.9, 1.15],
    [-0.9, -1.15],
    [0.9, -1.15],
  ]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.42, z);
    g.add(w);
  }

  const headGeo = new THREE.BoxGeometry(0.3, 0.18, 0.05);
  for (const x of [-0.55, 0.55]) {
    const lampMesh = new THREE.Mesh(headGeo, lamp);
    lampMesh.position.set(x, 0.7, 1.72);
    g.add(lampMesh);
  }
  return g;
}

const carMesh = buildCar();
scene.add(carMesh);
const car = { x: 0, z: 0, y: PATH_Y, yaw: 0, speed: 0 };

// Controles: teclado (flechas o WASD) y botones táctiles.
const KEY_ACTIONS = {
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};
const input = { gas: false, brake: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
  const act = KEY_ACTIONS[e.code];
  if (!act) return;
  e.preventDefault();
  input[act] = true;
});
window.addEventListener('keyup', (e) => {
  const act = KEY_ACTIONS[e.code];
  if (act) input[act] = false;
});
window.addEventListener('blur', () => {
  for (const k of Object.keys(input)) input[k] = false;
});

for (const btn of document.querySelectorAll('[data-act]')) {
  const act = btn.dataset.act;
  const on = (e) => {
    e.preventDefault();
    input[act] = true;
  };
  const off = () => {
    input[act] = false;
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
}

function drive(dt) {
  const { gas, brake, left, right } = input;
  if (gas) car.speed += 16 * dt;
  if (brake) car.speed -= (car.speed > 0.5 ? 26 : 10) * dt;
  if (!gas && !brake && car.speed !== 0) {
    const drag = Math.min(Math.abs(car.speed), 8 * dt);
    car.speed -= Math.sign(car.speed) * drag;
  }
  car.speed = Math.min(MAX_SPEED, Math.max(-MAX_REVERSE, car.speed));

  const grip = Math.min(1, Math.abs(car.speed) / 8);
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  if (steer) car.yaw += steer * 2.2 * grip * Math.sign(car.speed) * dt;

  const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
  // El mar bloquea el paso: el auto rebota.
  if (landInfo(nx, nz).h < 0) {
    car.speed *= -0.3;
  } else {
    car.x = nx;
    car.z = nz;
  }
  car.y = landInfo(car.x, car.z).h;
}

function checkStations() {
  for (let i = 0; i < N; i++) {
    if (i === index) continue;
    const dx = car.x - stationPos[i].x;
    const dz = car.z - stationPos[i].z;
    if (dx * dx + dz * dz < STATION_RADIUS * STATION_RADIUS) {
      setIndex(i);
      break;
    }
  }
}

// Navegación de tarjetas.
let index = 0;
let cardToken = 0;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildCard(st, i) {
  const frag = document.createDocumentFragment();
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
  b.addEventListener('click', () => teleport(i));
  return b;
});
dotsEl.replaceChildren(...dots);

function updateDots() {
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
}

function setIndex(i, instant = false) {
  index = i;
  renderCard(i, instant);
  updateDots();
}

// Lleva el auto a una estación (botones y puntos).
function teleport(i) {
  const next = Math.min(N - 1, Math.max(0, i));
  const s = stationPos[next];
  car.x = s.x;
  car.z = s.z;
  car.yaw = s.yaw;
  car.speed = 0;
  car.y = landInfo(car.x, car.z).h;
  if (next !== index) setIndex(next);
}

prevBtn.addEventListener('click', () => teleport(index - 1));
nextBtn.addEventListener('click', () => teleport(index + 1));

// Cámara: sigue al auto desde atrás.
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camReady = false;
function updateCamera(dt) {
  const back = 9;
  const tx = car.x - Math.sin(car.yaw) * back;
  const tz = car.z - Math.cos(car.yaw) * back;
  const ty = car.y + 4.5;
  if (!camReady) {
    camPos.set(tx, ty, tz);
    camReady = true;
  } else {
    const k = Math.min(1, dt * 5);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
  }
  camera.position.copy(camPos);
  camLook.set(car.x + Math.sin(car.yaw) * 3, car.y + 1.2, car.z + Math.cos(car.yaw) * 3);
  camera.lookAt(camLook);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (w >= 760) {
    camera.setViewOffset(w, h, w * 0.18, 0, w, h);
  } else {
    camera.setViewOffset(w, h, 0, h * 0.18, w, h);
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let last = performance.now();
let elapsed = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  drive(dt);
  checkStations();

  carMesh.position.set(car.x, car.y, car.z);
  carMesh.rotation.y = car.yaw;
  updateCamera(dt);

  for (const m of markers) {
    m.mesh.rotation.y += dt * 0.8;
    m.mesh.position.y = m.y + Math.sin(elapsed * 1.6 + m.phase) * 0.25;
  }
  rings.forEach((r, i) => {
    r.material.opacity = 0.7 + Math.sin(elapsed * 2 + i) * 0.3;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
teleport(0);
setIndex(0, true);
requestAnimationFrame(frame);
