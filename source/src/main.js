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
const ARENA_HALF = 380;
const STATION_RADIUS = 4;
const SOCIAL_RADIUS = 3.5;
const SOCIAL_ARC = 7;
const CAR_LENGTH = 3;
const MAX_SPEED = 26;
const MAX_REVERSE = 7;

// Ruedas: se llenan al armar el auto y se animan cada frame.
let wheelRigs = [];
let carFrontSign = 1;
let steerDir = 0;
let steerAngle = 0;

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
scene.background = new THREE.Color(0x3b2a6b);
scene.fog = new THREE.Fog(0x3b2a6b, 70, 200);
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

// Circuito cerrado sobre el pasto; las estaciones se reparten a lo largo de él.
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

// Pasto: plano grande que se funde con la niebla morada.
function buildGround() {
  const grassTex = noiseTexture('#4d8a2c', ['#33621c', '#6ca443', '#2c5418', '#8cbc52'], null);
  grassTex.repeat.set(160, 160);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 40, ARENA_HALF * 2 + 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  );
  grass.receiveShadow = true;
  scene.add(grass);
}

// Cinta plana que sigue la pista entre los desplazamientos a y b (perpendiculares al eje).
function buildStrip(a, b, material, uRepeat = 1) {
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
    const nx = -tan.z / l;
    const nz = tan.x / l;
    pos.push(p.x + nx * a, ROAD_LIFT, p.z + nz * a, p.x + nx * b, ROAD_LIFT, p.z + nz * b);
    uv.push(0, len / 9, uRepeat, len / 9);
    if (i < SEG) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// Bordillos rojos y blancos a ambos lados del asfalto.
const kerbTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#d62b2b';
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = '#f2f2f2';
  g.fillRect(32, 0, 32, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

function buildTrack() {
  buildGround();
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, side: THREE.DoubleSide });
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  buildStrip(-ROAD_HALF, ROAD_HALF, asphaltMat);
  buildStrip(ROAD_HALF, ROAD_HALF + 0.9, kerbMat, 4);
  buildStrip(-ROAD_HALF - 0.9, -ROAD_HALF, kerbMat, 4);
}

// Marcadores del suelo.
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
    mesh.position.set(x, 0.12, z);
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
    mesh.position.set(x, 0.12, z);
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

  // El GLB trae una sola rueda: se copia a las cuatro esquinas.
  const wheel = model.getObjectByName('wheelContainer001');
  const corners = wheel ? [wheel] : [];
  if (wheel) {
    const { x, y, z } = wheel.position;
    const ax = Math.abs(x);
    const az = Math.abs(z);
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1]]) {
      const w = wheel.clone();
      w.position.set(sx * ax, y, sz * az);
      if (sx < 0) w.rotation.y = Math.PI;
      model.add(w);
      corners.push(w);
    }
  }
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
  carFrontSign = front.x > back.x ? 1 : -1;
  carYawOffset = carFrontSign > 0 ? -Math.PI / 2 : Math.PI / 2;

  // Cada rueda: su base de orientación, el cilindro que rueda y si es delantera.
  wheelRigs = corners.map((node) => {
    let cyl = null;
    node.traverse((o) => {
      if (!cyl && o.name.startsWith('wheelCylinder')) cyl = o;
    });
    const radius = cyl ? new THREE.Box3().setFromObject(cyl).getSize(new THREE.Vector3()).y / 2 : 0;
    return {
      node,
      base: node.rotation.y,
      cyl,
      radius: radius || 0.3,
      front: Math.sign(node.position.x) === carFrontSign,
    };
  });
}

// Ruedas: las delanteras giran al doblar y todas ruedan según la velocidad.
function animateWheels(dt) {
  steerAngle += (-steerDir * 0.5 - steerAngle) * Math.min(1, dt * 10);
  for (const r of wheelRigs) {
    if (r.front) r.node.rotation.y = r.base + steerAngle;
    if (r.cyl) r.cyl.rotation.z -= (Math.cos(r.base) * carFrontSign * car.speed * dt) / r.radius;
  }
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
  if (!started) return;
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
  steerDir = steer;
  if (steer) car.yaw -= steer * 2.2 * grip * Math.sign(car.speed) * dt;

  const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
  // El borde del pasto frena el auto.
  if (Math.abs(nx) > ARENA_HALF || Math.abs(nz) > ARENA_HALF) {
    car.speed = 0;
  } else {
    car.x = nx;
    car.z = nz;
  }
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
    _v.set(near.x, 1.8, near.z).project(camera);
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
  car.y = 0;
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
let started = false;
let startRings = [];
const startEl = document.getElementById('start');
document.body.classList.add('idle');

function startGame() {
  if (started) return;
  started = true;
  startEl.classList.add('leaving');
  document.body.classList.remove('idle');
  startRings.forEach((r) => (r.visible = false));
}
startEl.addEventListener('click', startGame);
window.addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Enter' || e.code === 'Space' || e.code in KEY_ACTIONS)) {
    e.preventDefault();
    startGame();
  }
});

// Anillo de luz alrededor del punto de inicio, visible hasta empezar.
function buildStartRing() {
  const s = stationPos[0];
  const y = 0.12;
  const mat = (opacity) =>
    new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  startRings = [
    [3.4, 3.8, 0.95],
    [3.8, 5.2, 0.3],
  ].map(([inner, outer, opacity]) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), mat(opacity));
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.x, y, s.z);
    scene.add(m);
    return m;
  });
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  drive(dt);
  animateWheels(dt);
  if (started) {
    checkStations();
    updateSocials();
  } else {
    const pulse = 1 + Math.sin(elapsed * 3) * 0.04;
    startRings.forEach((r) => r.scale.setScalar(pulse));
  }

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
loader.loadAsync(`${ASSETS}vehicle/default.glb`).then((carGltf) => {
  buildTrack();
  buildMarkers();
  buildStartRing();
  setupCar(carGltf);

  resize();
  teleport(0);
  setIndex(0, true);
  requestAnimationFrame(frame);
});
