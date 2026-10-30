import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { stations, socials } from './content.js';
import {
  ARENA_HALF,
  createTrack,
  poseAt,
  buildTrack,
  buildScenery,
  heightAt,
  createDebris,
  collideCar,
} from './world.js';
import './style.css';

const N = stations.length;
const ASSETS = import.meta.env.BASE_URL;
const SOCIAL_RADIUS = 3.5;
const SOCIAL_ARC = 7;
const CAR_LENGTH = 3;
const MAX_SPEED = 26;
const MAX_REVERSE = 7;
const GRAVITY = 30;
const APPROACH = 12;
const STATION_COLOR = 0xe07b22;

// Ruedas: se llenan al armar el auto y se animan cada frame.
let wheelRigs = [];
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

// Pista lineal (ver world.js). La estación 0 es el inicio; las demás son cajas sobre la pista.
const curve = createTrack();
const TRACK_LEN = curve.getLength();
const STATION_U = stations.map((_, i) => (i === 0 ? 0 : 0.12 + (i - 1) * 0.14));
const stationPos = STATION_U.map((u) => poseAt(curve, u));
const approachPos = STATION_U.map((u) => poseAt(curve, Math.max(0, u - APPROACH / TRACK_LEN)));

// Marcadores del suelo.
let stationDiscs = [];
let socialItems = [];
// Obstáculos (sólidos o rompibles) y partículas al romperse.
let obstacles = [];
let ramps = [];
let debris = null;

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

// Cajas naranjas sobre la pista: cada una lleva el número de la sección y se rompe al pasar.
function buildStationCrates() {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const mat = new THREE.MeshStandardMaterial({ color: STATION_COLOR, roughness: 0.8 });
  const signGeo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
  stations.forEach((_, i) => {
    if (i === 0) return;
    const { x, z } = stationPos[i];
    const g = new THREE.Group();
    g.position.set(x, 1, z);
    const box = new THREE.Mesh(geo, mat);
    box.castShadow = true;
    g.add(box);
    const sign = new THREE.Mesh(
      signGeo,
      new THREE.MeshBasicMaterial({ map: iconTexture(String(i + 1), 'disc'), transparent: true, depthWrite: false })
    );
    sign.position.y = 1.01;
    g.add(sign);
    scene.add(g);
    obstacles.push({ x, z, r: 1.2, solid: false, drag: 0.6, group: g, kind: 'station', index: i, color: STATION_COLOR });
  });
}

// Auto: piezas del juego 2019 de Bruno (MIT, ver README). Vienen con Z hacia arriba y el frente en +X;
// se giran para que el frente quede en +Z, que es el sentido de marcha de carPivot.
const carPivot = new THREE.Group();
scene.add(carPivot);

// Color de matcap según el nombre de la pieza (o de su nodo padre); lo no reconocido es gris.
function matcapColor(obj) {
  for (let o = obj; o; o = o.parent) {
    const n = o.name;
    if (n.startsWith('shadeBlack')) return 'black';
    if (n.startsWith('shadeWhite')) return 'white';
    if (n.startsWith('shadeRed') || n.startsWith('pureRed')) return 'red';
    if (n.startsWith('pureYellow')) return 'yellow';
  }
  return 'gray';
}

function setupCar({ chassis, antena, brake, reverse, wheel }, matcaps) {
  const parts = new THREE.Group();
  const up = new THREE.Group();
  up.rotation.x = -Math.PI / 2;
  const pose = new THREE.Group();
  pose.rotation.y = -Math.PI / 2;
  pose.add(up);
  up.add(parts);

  for (const g of [chassis, antena, brake, reverse]) parts.add(g.scene);

  // Una sola rueda en el archivo: se clona en las cuatro esquinas. Cada una gira
  // en dos niveles: el de dirección (eje vertical, solo delanteras) y el de rodado (eje de la rueda).
  const wheelBox = new THREE.Box3().setFromObject(wheel.scene);
  const wc = wheelBox.getCenter(new THREE.Vector3());
  const wheelR = wheelBox.getSize(new THREE.Vector3()).x / 2;
  const wheels = [];
  for (const [sx, sy, front] of [[1, 1, true], [1, -1, true], [-1, 1, false], [-1, -1, false]]) {
    const steer = new THREE.Group();
    steer.position.set(sx * wc.x, sy * wc.y, wc.z);
    const spin = new THREE.Group();
    const mirror = new THREE.Group();
    mirror.scale.y = sy;
    const holder = wheel.scene.clone(true);
    holder.position.copy(wc).negate();
    mirror.add(holder);
    spin.add(mirror);
    steer.add(spin);
    parts.add(steer);
    wheels.push({ steer: front ? steer : null, spin, radius: wheelR });
  }

  const mats = {};
  parts.traverse((o) => {
    if (!o.isMesh) return;
    const c = matcapColor(o);
    mats[c] ??= new THREE.MeshMatcapMaterial({ matcap: matcaps[c] });
    o.material = mats[c];
    o.castShadow = true;
  });

  // Escala por largo, luego centrado en X/Z y apoyado en el suelo.
  let box = new THREE.Box3().setFromObject(pose);
  const s = CAR_LENGTH / box.getSize(new THREE.Vector3()).z;
  parts.scale.setScalar(s);
  box = new THREE.Box3().setFromObject(pose);
  const c = box.getCenter(new THREE.Vector3());
  pose.position.set(-c.x, -box.min.y, -c.z);
  carPivot.add(pose);

  wheelRigs = wheels.map((w) => ({ ...w, radius: w.radius * s }));
}

// Ruedas: las delanteras giran al doblar y todas ruedan según la velocidad.
function animateWheels(dt) {
  steerAngle += (-steerDir * 0.5 - steerAngle) * Math.min(1, dt * 10);
  for (const r of wheelRigs) {
    if (r.steer) r.steer.rotation.z = steerAngle;
    r.spin.rotation.y += (car.speed * dt) / r.radius;
  }
}

const car = { x: 0, z: 0, y: 0, yaw: 0, speed: 0, vy: 0, groundY: 0 };

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

// Altura del auto: sigue las rampas y, al bajar de una, sale volando con la velocidad de subida.
function updateVertical(dt) {
  const ground = heightAt(ramps, car.x, car.z);
  const rise = ground - car.groundY;
  if (car.y <= car.groundY + 0.05 && rise >= 0) {
    car.vy = rise / dt;
    car.y = ground;
  } else {
    car.vy -= GRAVITY * dt;
    car.y += car.vy * dt;
    if (car.y <= ground) {
      car.y = ground;
      car.vy = 0;
    }
  }
  car.groundY = ground;
}

// Choque con árboles, llantas, arbustos y cajas (ver world.js).
function onStationBreak(i) {
  if (i !== index) setIndex(i);
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

// Progreso: cada sección visitada cambia de color y actualiza el contador.
const visited = new Set();
const progressEl = document.getElementById('progress');

function updateProgress() {
  const done = visited.size === N;
  progressEl.textContent = done
    ? '¡Pista completada! Revisa las redes abajo'
    : `Secciones: ${visited.size}/${N}`;
  progressEl.classList.toggle('done', done);
  stationDiscs.forEach((d, i) => d.material.color.set(visited.has(i) ? 0x7fd67f : 0xffffff));
}

function setIndex(i, instant = false) {
  index = i;
  visited.add(i);
  renderCard(i, instant);
  updateDots();
  updateProgress();
}

// Lleva el auto a una sección (botones y puntos), unos metros antes de su caja.
function teleport(i) {
  const next = Math.min(N - 1, Math.max(0, i));
  const s = approachPos[next];
  car.x = s.x;
  car.z = s.z;
  car.yaw = s.yaw;
  car.speed = 0;
  car.y = 0;
  car.vy = 0;
  car.groundY = heightAt(ramps, car.x, car.z);
  car.y = car.groundY;
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
  updateVertical(dt);
  animateWheels(dt);
  if (started) {
    collideCar(car, obstacles, debris, onStationBreak);
    updateSocials();
  } else {
    const pulse = 1 + Math.sin(elapsed * 3) * 0.04;
    startRings.forEach((r) => (r.scale.setScalar(pulse)));
  }
  debris.update(dt);

  carPivot.position.set(car.x, car.y, car.z);
  carPivot.rotation.y = car.yaw;
  moon.position.set(car.x - 40, 80, car.z - 30);
  moon.target.position.set(car.x, 0, car.z);
  updateCamera(dt);

  stationDiscs.forEach((d, i) => d.scale.setScalar(1 + Math.sin(elapsed * 2 + i) * 0.03));

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Carga de assets de Bruno (MIT, ver FOLIO-2025-LICENSE.md y README) y arranque del juego.
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const CAR_DIR = `${ASSETS}vehicle/2019/`;
const MATCAP_DIR = `${ASSETS}vehicle/matcaps/`;
const MATCAP_NAMES = ['black', 'white', 'red', 'yellow', 'gray'];
const CAR_PARTS = ['chassis', 'antena', 'backLightsBrake', 'backLightsReverse', 'wheel'];

Promise.all([
  Promise.all(CAR_PARTS.map((p) => loader.loadAsync(`${CAR_DIR}${p}.glb`))),
  Promise.all(MATCAP_NAMES.map((m) => texLoader.loadAsync(`${MATCAP_DIR}${m}.png`))),
]).then(([[chassis, antena, brake, reverse, wheel], maps]) => {
  const matcaps = {};
  MATCAP_NAMES.forEach((name, i) => {
    maps[i].colorSpace = THREE.SRGBColorSpace;
    matcaps[name] = maps[i];
  });

  buildTrack(scene, curve);
  buildMarkers();
  buildStationCrates();
  const scenery = buildScenery(scene, curve, [...stationPos, ...socialItems]);
  obstacles.push(...scenery.obstacles);
  ramps = scenery.ramps;
  debris = createDebris(scene);
  buildStartRing();
  setupCar({ chassis, antena, brake, reverse, wheel }, matcaps);

  resize();
  teleport(0);
  setIndex(0, true);
  requestAnimationFrame(frame);
});

