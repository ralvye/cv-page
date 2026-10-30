import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { stations, socials } from './content.js';
import './style.css';

const N = stations.length;
const ASSETS = import.meta.env.BASE_URL;
const TRACK_RX = 30;
const TRACK_RZ = 24;
const ROAD_HALF = 2.4;
const ROAD_LIFT = 0.1;
const WATER_Y = -0.55;
const STATION_RADIUS = 4;
const SOCIAL_RADIUS = 3.5;
const SOCIAL_ARC = 7;
const CAR_LENGTH = 3;
const MAX_SPEED = 26;
const MAX_REVERSE = 7;

// Terreno de Bruno: malla de 129x129 vértices sobre ±96 unidades.
const VERTS = 129;
const HALF = 96;
const CELL = (HALF * 2) / (VERTS - 1);
let heights = null;

const canvas = document.getElementById('scene');
const card = document.getElementById('card');
const dotsEl = document.getElementById('dots');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const socialEl = document.getElementById('social');
const socialName = document.getElementById('social-name');
const socialOpen = document.getElementById('social-open');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.Fog(0x070b14, 60, 190);
// Entorno suave para reflejos en el auto y el agua.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

scene.add(new THREE.HemisphereLight(0x5a6fa8, 0x0b120b, 0.8));
const moon = new THREE.DirectionalLight(0xaebfff, 1.7);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
moon.shadow.bias = -0.0008;
moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);

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

// Campo de estrellas en el cielo.
{
  const count = 700;
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = rand() * Math.PI * 2;
    const ph = rand() * Math.PI * 0.42;
    pts.set([300 * Math.cos(th) * Math.cos(ph), 300 * Math.sin(ph) + 20, 300 * Math.sin(th) * Math.cos(ph)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcbd5ff, size: 1.4, sizeAttenuation: false, fog: false })));
}

// Texturas procedurales: asfalto y etiquetas de los iconos del suelo.
function noiseTexture(base, speckles, draw) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 8; i++) {
    g.fillStyle = speckles[Math.floor(rand() * speckles.length)];
    g.globalAlpha = 0.1 + rand() * 0.3;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  g.globalAlpha = 1;
  draw?.(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
const asphaltTex = noiseTexture('#3a3d45', ['#1b1d22', '#5a5e68'], (g, s) => {
  g.fillStyle = 'rgba(232,232,232,0.85)';
  g.fillRect(10, 0, 6, s);
  g.fillRect(s - 16, 0, 6, s);
  g.fillStyle = '#d9b44a';
  for (let y = 0; y < s; y += 64) g.fillRect(s / 2 - 4, y, 8, 36);
});

// Icono plano para el suelo: disco o etiqueta oscura con texto blanco (estilo Bruno).
function iconTexture(text, shape) {
  const w = shape === 'pill' ? 512 : 256;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#251f2b';
  g.beginPath();
  if (shape === 'pill') g.roundRect(8, 8, w - 16, h - 16, 60);
  else g.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = shape === 'pill' ? '700 110px Nunito, system-ui, sans-serif' : '900 120px Nunito, system-ui, sans-serif';
  g.fillText(text, w / 2, h / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Colores del suelo como en Bruno: el canal azul elige el degradado (arena, agua turquesa, mar profundo)
// y el canal verde mezcla el color de hierba. Se hornea una vez en una textura normal.
const GRADIENT_STOPS = [
  { t: 0.1, c: [0xff, 0xa9, 0x4e] },
  { t: 0.3, c: [0x5b, 0xc2, 0xb9] },
  { t: 0.9, c: [0x13, 0x37, 0x5f] },
];
const GRASS = [0xb8, 0xb6, 0x2e];

function gradientAt(t) {
  if (t <= GRADIENT_STOPS[0].t) return GRADIENT_STOPS[0].c;
  const last = GRADIENT_STOPS[GRADIENT_STOPS.length - 1];
  if (t >= last.t) return last.c;
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    const a = GRADIENT_STOPS[i];
    const b = GRADIENT_STOPS[i + 1];
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return a.c.map((v, j) => v + (b.c[j] - v) * k);
    }
  }
  return last.c;
}

function bakeTerrainColors(src) {
  const w = src.image.width;
  const h = src.image.height;
  const src2d = document.createElement('canvas');
  src2d.width = w;
  src2d.height = h;
  const sg = src2d.getContext('2d', { willReadFrequently: true });
  sg.drawImage(src.image, 0, 0);
  const data = sg.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = px[i + 1] / 255;
    const base = gradientAt(1 - px[i + 2] / 255);
    for (let j = 0; j < 3; j++) {
      px[i + j] = base[j] + (GRASS[j] - base[j]) * g;
    }
    px[i + 3] = 255;
  }
  sg.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(src2d);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Altura del terreno: interpolación bilineal de la malla de Bruno.
function heightAt(x, z) {
  const fx = Math.min(VERTS - 1.001, Math.max(0, (x + HALF) / CELL));
  const fz = Math.min(VERTS - 1.001, Math.max(0, (z + HALF) / CELL));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * VERTS + ix;
  const top = heights[i] * (1 - tx) + heights[i + 1] * tx;
  const bottom = heights[i + VERTS] * (1 - tx) + heights[i + VERTS + 1] * tx;
  return top * (1 - tz) + bottom * tz;
}

// Circuito cerrado sobre la isla; las estaciones se reparten a lo largo de él.
const trackPoints = Array.from({ length: 16 }, (_, i) => {
  const t = (i / 16) * Math.PI * 2;
  return new THREE.Vector3(TRACK_RX * Math.cos(t), 0, TRACK_RZ * Math.sin(t));
});
const curve = new THREE.CatmullRomCurve3(trackPoints, true, 'centripetal');

const stationPos = stations.map((_, i) => {
  const u = i / N;
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u);
  return { x: p.x, z: p.z, yaw: Math.atan2(t.x, t.z) };
});

// Mapa del suelo: el terreno real de Bruno, con su textura.
function buildTerrain(gltf, texture) {
  let geo = null;
  gltf.scene.traverse((o) => {
    if (!geo && o.isMesh) geo = o.geometry;
  });
  const pos = geo.attributes.position;
  heights = new Float32Array(VERTS * VERTS);
  for (let v = 0; v < pos.count; v++) {
    const ix = Math.round((pos.getX(v) + HALF) / CELL);
    const iz = Math.round((pos.getZ(v) + HALF) / CELL);
    heights[iz * VERTS + ix] = pos.getY(v);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0f2740, roughness: 0.25, metalness: 0.1 })
  );
  water.position.y = WATER_Y;
  scene.add(water);
}

// Carretera: cinta de asfalto que sigue la altura del terreno.
function buildRoad() {
  const SEG = 400;
  const pos = [];
  const uv = [];
  const index = [];
  let len = 0;
  let prev = null;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    if (prev) len += p.distanceTo(prev);
    prev = p;
    const l = Math.hypot(tan.x, tan.z);
    const nx = (-tan.z / l) * ROAD_HALF;
    const nz = (tan.x / l) * ROAD_HALF;
    const yl = heightAt(p.x + nx, p.z + nz) + ROAD_LIFT;
    const yr = heightAt(p.x - nx, p.z - nz) + ROAD_LIFT;
    pos.push(p.x + nx, yl, p.z + nz, p.x - nx, yr, p.z - nz);
    uv.push(0, len / 9, 1, len / 9);
    if (i < SEG) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide })
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// Marcadores del suelo (se crean cuando el terreno ya está cargado, porque usan su altura).
let stationDiscs = [];
let socialItems = [];

function buildMarkers() {
  // Estaciones: icono plano en el suelo; al pasar encima se abre su sección.
  stationDiscs = stations.map((_, i) => {
    const { x, z } = stationPos[i];
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: iconTexture(String(i + 1), 'disc'), transparent: true, depthWrite: false })
    );
    mesh.position.set(x, heightAt(x, z) + 0.12, z);
    scene.add(mesh);
    return mesh;
  });

  // Redes sociales: etiquetas en un arco frente al inicio, con su propio botón al estar cerca.
  socialItems = socials.map((s, i) => {
    const a = -Math.PI * 0.8 + (i / (socials.length - 1)) * Math.PI * 0.6;
    const x = SOCIAL_ARC * Math.cos(a);
    const z = SOCIAL_ARC * Math.sin(a);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: iconTexture(s.label, 'pill'), transparent: true, depthWrite: false })
    );
    mesh.position.set(x, heightAt(x, z) + 0.12, z);
    scene.add(mesh);
    return { ...s, x, z, mesh };
  });
}

// Auto: modelo de Bruno, centrado, con el frente en +X y ajustado al suelo.
const carPivot = new THREE.Group();
scene.add(carPivot);
let carYawOffset = 0;

function setupCar(gltf) {
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  carPivot.add(model);

  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  model.scale.multiplyScalar(CAR_LENGTH / box.getSize(new THREE.Vector3()).x);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  model.updateMatrixWorld(true);

  // Los faros van delante de las luces traseras: eso define el sentido de marcha.
  const back = new THREE.Box3().setFromObject(model.getObjectByName('backLights')).getCenter(new THREE.Vector3());
  const front = new THREE.Box3().setFromObject(model.getObjectByName('headlights001')).getCenter(new THREE.Vector3());
  carYawOffset = front.x > back.x ? -Math.PI / 2 : Math.PI / 2;
}

const car = { x: 0, z: 0, y: 0, yaw: 0, speed: 0 };

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
  if (e.code === 'Enter' && activeSocial && !(e.target instanceof HTMLButtonElement)) {
    openSocial(activeSocial);
    return;
  }
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
  // El agua bloquea el paso: el auto rebota.
  if (heightAt(nx, nz) < WATER_Y + 0.1) {
    car.speed *= -0.3;
  } else {
    car.x = nx;
    car.z = nz;
  }
  car.y = heightAt(car.x, car.z);
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

// Redes sociales: al estar cerca aparece la etiqueta con el botón para abrirlas.
let activeSocial = null;
const _v = new THREE.Vector3();

function openSocial(s) {
  const a = document.createElement('a');
  a.href = s.href;
  if (s.href.startsWith('http')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  a.click();
}

function setActiveSocial(s) {
  if (s === activeSocial) return;
  activeSocial = s;
  socialEl.hidden = !s;
  if (s) socialName.textContent = s.label;
}

function updateSocials() {
  let near = null;
  for (const s of socialItems) {
    const dx = car.x - s.x;
    const dz = car.z - s.z;
    if (dx * dx + dz * dz < SOCIAL_RADIUS * SOCIAL_RADIUS) {
      near = s;
      break;
    }
  }
  setActiveSocial(near);
  if (near) {
    _v.set(near.x, heightAt(near.x, near.z) + 1.8, near.z).project(camera);
    const px = ((_v.x + 1) / 2) * window.innerWidth;
    const py = ((1 - _v.y) / 2) * window.innerHeight;
    socialEl.style.transform = `translate(${px}px, ${py}px)`;
  }
}
socialOpen.addEventListener('click', () => {
  if (activeSocial) openSocial(activeSocial);
});

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
  car.y = heightAt(car.x, car.z);
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
  updateSocials();

  carPivot.position.set(car.x, car.y, car.z);
  carPivot.rotation.y = car.yaw + carYawOffset;
  moon.position.set(car.x - 40, 80, car.z - 30);
  moon.target.position.set(car.x, 0, car.z);
  updateCamera(dt);

  stationDiscs.forEach((d, i) => d.scale.setScalar(1 + Math.sin(elapsed * 2 + i) * 0.03));

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Carga de assets de Bruno (MIT, ver FOLIO-2025-LICENSE.md) y arranque del juego.
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
Promise.all([
  loader.loadAsync(`${ASSETS}terrain/terrain.glb`),
  textureLoader.loadAsync(`${ASSETS}terrain/terrain.png`),
  loader.loadAsync(`${ASSETS}vehicle/default.glb`),
]).then(([terrainGltf, terrainTex, carGltf]) => {
  terrainTex.flipY = false;
  terrainTex.colorSpace = THREE.SRGBColorSpace;
  terrainTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  buildTerrain(terrainGltf, bakeTerrainColors(terrainTex));
  buildRoad();
  buildMarkers();
  setupCar(carGltf);

  resize();
  teleport(0);
  setIndex(0, true);
  requestAnimationFrame(frame);
});
