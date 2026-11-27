import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { stations, socials } from './content.js';
import {
  ARENA_HALF,
  ROAD_LIFT,
  TRACK_SCALE,
  TUNNEL_U,
  createTrack,
  poseAt,
  buildTrack,
  buildRoundabout,
  roundaboutLayout,
  ICON_MOUND_H,
  buildTunnels,
  buildScenery,
  buildWater,
  buildBridge,
  buildMountains,
  inWater,
  heightAt,
  createDebris,
  collideCar,
} from './world.js';
import './style.css';

const N = stations.length;
const ASSETS = import.meta.env.BASE_URL;
const SOCIAL_RADIUS = 3.5;
const CAR_LENGTH = 3;
const MAX_SPEED = 26;
const WATER_MAX_SPEED = 9;
const MAX_REVERSE = 7;
const GRAVITY = 30;
const APPROACH = 12;
const STATION_COLOR = 0xe07b22;

// Ruedas: se llenan al armar el auto y se animan cada frame.
let wheelRigs = [];
let steerDir = 0;
let steerAngle = 0;
let carLights = { head: [], tail: [], reverse: [] };

const canvas = document.getElementById('scene');
const card = document.getElementById('card');
const gearEl = document.getElementById('gear');
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

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);

scene.add(new THREE.HemisphereLight(0x5a6fa8, 0x0b120b, 0.8));
const moon = new THREE.DirectionalLight(0xaebfff, 1.7);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
moon.shadow.bias = -0.0008;
moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);

const weatherParticles = { rain: null, snow: null };
function buildWeatherParticles() {
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(900 * 3);
  for (let i = 0; i < rainPositions.length; i += 3) {
    rainPositions[i] = (Math.random() - 0.5) * 140;
    rainPositions[i + 1] = 4 + Math.random() * 28;
    rainPositions[i + 2] = (Math.random() - 0.5) * 140;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  weatherParticles.rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0x9fd1ff, size: 0.18, transparent: true, opacity: 0.75 })
  );
  weatherParticles.rain.visible = false;
  scene.add(weatherParticles.rain);

  const snowGeo = new THREE.BufferGeometry();
  const snowPositions = new Float32Array(700 * 3);
  for (let i = 0; i < snowPositions.length; i += 3) {
    snowPositions[i] = (Math.random() - 0.5) * 110;
    snowPositions[i + 1] = 4 + Math.random() * 32;
    snowPositions[i + 2] = (Math.random() - 0.5) * 110;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  weatherParticles.snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({ color: 0xf3f7ff, size: 0.22, transparent: true, opacity: 0.85 })
  );
  weatherParticles.snow.visible = false;
  scene.add(weatherParticles.snow);
}
buildWeatherParticles();

// Hojas que el viento empuja alrededor del auto y pájaros que cruzan el cielo; solo de día (ver updateWeather).
const LEAF_COUNT = 90;
const LEAF_COLORS = [0xc8642a, 0xd9a13c, 0x9c4a1e, 0xb8862b, 0xa8432a].map((c) => new THREE.Color(c));
const leafShape = new THREE.Shape();
leafShape.moveTo(0, -0.12);
leafShape.quadraticCurveTo(0.1, 0, 0, 0.12);
leafShape.quadraticCurveTo(-0.1, 0, 0, -0.12);
const leafMesh = new THREE.InstancedMesh(
  new THREE.ShapeGeometry(leafShape),
  new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
  LEAF_COUNT
);
const leaves = [];
const leafDummy = new THREE.Object3D();
for (let i = 0; i < LEAF_COUNT; i++) {
  leafMesh.setColorAt(i, LEAF_COLORS[i % LEAF_COLORS.length]);
  leaves.push({ x: 0, y: -5, z: 0, phase: Math.random() * Math.PI * 2, fall: 1 + Math.random() * 0.8 });
}
leafMesh.visible = false;
leafMesh.frustumCulled = false;
scene.add(leafMesh);

const BIRD_COUNT = 5;
const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2f38, side: THREE.DoubleSide });
function birdWingGeo(side) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.15, 0, 0.9 * side, 0.25, 0, 0.35 * side], 3));
  return g;
}
const birds = [];
for (let i = 0; i < BIRD_COUNT; i++) {
  const group = new THREE.Group();
  const wingL = new THREE.Mesh(birdWingGeo(1), birdMat);
  const wingR = new THREE.Mesh(birdWingGeo(-1), birdMat);
  group.add(wingL, wingR, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), birdMat));
  group.scale.setScalar(1.8);
  group.visible = false;
  scene.add(group);
  birds.push({ group, wingL, wingR, live: false, phase: Math.random() * Math.PI * 2, speed: 6 + Math.random() * 4 });
}

function spawnBird(b) {
  const a = Math.random() * Math.PI * 2;
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const side = (Math.random() - 0.5) * 80;
  b.x = car.x + dx * 110 - dz * side;
  b.z = car.z + dz * 110 + dx * side;
  b.y = 12 + Math.random() * 10;
  b.vx = -dx * b.speed;
  b.vz = -dz * b.speed;
  b.group.rotation.y = Math.atan2(-b.vz, b.vx);
  b.live = true;
}

function updateBirds(dt, active) {
  for (const b of birds) {
    b.group.visible = active;
    if (!active) continue;
    if (!b.live || Math.hypot(b.x - car.x, b.z - car.z) > 170) spawnBird(b);
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.group.position.set(b.x, b.y + Math.sin(elapsed * 1.6 + b.phase) * 0.5, b.z);
    const flap = Math.sin(elapsed * 10 + b.phase) * 0.6;
    b.wingL.rotation.x = flap;
    b.wingR.rotation.x = -flap;
  }
}

function updateLeaves(dt, active) {
  leafMesh.visible = active;
  if (!active) return;
  const windX = 1.4 + Math.sin(elapsed * 0.3) * 0.8;
  const windZ = Math.sin(elapsed * 0.21) * 0.9;
  for (let i = 0; i < LEAF_COUNT; i++) {
    const l = leaves[i];
    l.x += (windX + Math.sin(elapsed * 1.7 + l.phase) * 0.9) * dt;
    l.z += (windZ + Math.cos(elapsed * 1.3 + l.phase) * 0.6) * dt;
    l.y -= (l.fall + 0.6 * Math.sin(elapsed * 2.6 + l.phase)) * dt;
    if (l.y < 0.3 || Math.hypot(l.x - car.x, l.z - car.z) > 55) {
      l.x = car.x + (Math.random() - 0.5) * 90;
      l.z = car.z + (Math.random() - 0.5) * 90;
      l.y = 4 + Math.random() * 14;
    }
    leafDummy.position.set(l.x, l.y, l.z);
    leafDummy.rotation.set(elapsed * 1.6 + l.phase, elapsed * 0.9 + l.phase * 2, Math.sin(elapsed * 2.3 + l.phase) * 1.2);
    leafDummy.scale.setScalar(1.3);
    leafDummy.updateMatrix();
    leafMesh.setMatrixAt(i, leafDummy.matrix);
  }
  leafMesh.instanceMatrix.needsUpdate = true;
}

// Icono plano para el suelo: disco o etiqueta oscura con texto blanco; 'badge' es un cuadrado de marca.
function iconTexture(text, shape, fill = '#251f2b') {
  const w = shape === 'pill' ? 512 : shape === 'badge' ? 512 : 256;
  const h = shape === 'badge' ? 512 : 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = fill;
  g.beginPath();
  if (shape === 'pill') g.roundRect(8, 8, w - 16, h - 16, 60);
  else if (shape === 'badge') g.roundRect(8, 8, w - 16, h - 16, 90);
  else g.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (shape === 'badge') g.font = '800 104px Nunito, system-ui, sans-serif';
  else g.font = shape === 'pill' ? '700 110px Nunito, system-ui, sans-serif' : '900 120px Nunito, system-ui, sans-serif';
  g.fillText(text, w / 2, h / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Logo oficial (ruta SVG de simple-icons, 24×24) sobre fondo blanco, en el color de la marca.
function logoTexture(path, color) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  const k = (s * 0.6) / 24;
  g.translate((s - 24 * k) / 2, (s - 24 * k) / 2);
  g.scale(k, k);
  g.fillStyle = color;
  g.fill(new Path2D(path));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Pista lineal (ver world.js). La estación 0 es el inicio; las demás son cajas sobre la pista.
const curve = createTrack();
const TRACK_LEN = curve.getLength();
// El ciclo de clima sigue a la distancia original de la pista, así que su ritmo no cambia al acortarla.
const WEATHER_CYCLE_LEN = (TRACK_LEN / TRACK_SCALE) * 0.85;
const roundabout = roundaboutLayout(curve);
const tunnelU = TUNNEL_U;
const tunnelPos = tunnelU.map((u) => poseAt(curve, u));
const STATION_U = stations.map((_, i) => (i === 0 ? 0 : 0.12 + (i - 1) * 0.14));
const stationPos = STATION_U.map((u) => poseAt(curve, u));
const approachPos = STATION_U.map((u) => poseAt(curve, Math.max(0, u - APPROACH / TRACK_LEN)));

// Marcadores del suelo.
let stationDiscs = [];
let socialItems = [];
// Obstáculos (sólidos o rompibles) y partículas al romperse.
let obstacles = [];
let ramps = [];
let waterZones = [];
let waterTextures = [];
let splashTimer = 0;
// Intensidad 0..1 del movimiento sobre el agua; sube y baja suave al entrar y salir.
let wetness = 0;
const MOUNTAIN_BASE = new THREE.Color(0x4f4478);
const mountainMaterial = buildMountains(scene);
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

  // Redes de la rotonda: cubos 3D con el logo oficial en el centro hueco; se rompen al pasar, como las cajas.
  socialItems = socials.map((s, i) => {
    const { x, z } = roundabout.icons[i];
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4).translate(0, 2, 0),
      new THREE.MeshStandardMaterial({ map: logoTexture(s.logo, s.color), roughness: 0.5 })
    );
    const y = ROAD_LIFT + ICON_MOUND_H;
    cube.position.set(x, y, z);
    cube.castShadow = true;
    scene.add(cube);
    obstacles.push({ x, y: y + 2, z, r: 2.4, solid: false, drag: 0.7, group: cube, kind: 'social' });
    return { ...s, x, z };
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

// Auto: piezas del juego 2019 de Bruno Simon, adaptadas por Roy. Vienen con Z hacia arriba y el frente en +X;
// se giran para que el frente quede en +Z, que es el sentido de marcha de carPivot.
const carPivot = new THREE.Group();
// Yaw al final, así el balanceo y el cabeceo se aplican en el marco del auto.
carPivot.rotation.order = 'YXZ';
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

// Halo suave de luz: textura radial compartida y aditiva para que no tape la escena.
let glowTexture = null;
function glowSprite(rgb, scale) {
  if (!glowTexture) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    glowTexture = new THREE.CanvasTexture(cv);
  }
  const mat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: new THREE.Color(`rgb(${rgb})`),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return sprite;
}

// Las piezas del auto no tienen UV, así que el grano y la mancha se calculan en espacio del modelo.
function addPaintGrain(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCarPos;
float carHash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float carNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(carHash(i), carHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(carHash(i + vec3(0.0, 1.0, 0.0)), carHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(carHash(i + vec3(0.0, 0.0, 1.0)), carHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(carHash(i + vec3(0.0, 1.0, 1.0)), carHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float paintGrain = carNoise(vCarPos * 60.0);
  float paintMottle = carNoise(vCarPos * 6.0);
  diffuseColor.rgb *= 0.93 + 0.07 * paintGrain + 0.08 * (paintMottle - 0.5);`
      );
  };
  material.customProgramCacheKey = () => 'car-paint-grain';
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

  const headLensGeo = new THREE.CircleGeometry(0.1, 16).rotateY(Math.PI / 2);
  const tailLensGeo = new THREE.CircleGeometry(0.12, 16).rotateY(-Math.PI / 2);
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c7, side: THREE.DoubleSide });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff332d, side: THREE.DoubleSide });
  const frontLeft = new THREE.Mesh(headLensGeo, headLightMat);
  frontLeft.name = 'head-light-left';
  const frontRight = new THREE.Mesh(headLensGeo, headLightMat);
  frontRight.name = 'head-light-right';
  const rearLeft = new THREE.Mesh(tailLensGeo, tailLightMat);
  rearLeft.name = 'tail-light-left';
  const rearRight = new THREE.Mesh(tailLensGeo, tailLightMat);
  rearRight.name = 'tail-light-right';
  const headL = new THREE.PointLight(0xfff0bf, 0, 18, 2);
  const headR = new THREE.PointLight(0xfff0bf, 0, 18, 2);
  const tailL = new THREE.PointLight(0xff332d, 0, 14, 2);
  const tailR = new THREE.PointLight(0xff332d, 0, 14, 2);
  const headGlow = [glowSprite('255, 240, 190', 0.9), glowSprite('255, 240, 190', 0.9)];
  const tailGlow = [glowSprite('255, 60, 50', 0.7), glowSprite('255, 60, 50', 0.7)];
  const reverseL = new THREE.PointLight(0xfff6d6, 0, 12, 2);
  const reverseR = new THREE.PointLight(0xfff6d6, 0, 12, 2);
  const reverseGlow = [glowSprite('255, 246, 214', 0.6), glowSprite('255, 246, 214', 0.6)];
  reverseGlow.forEach((s) => (s.visible = false));

  const lightMeshes = [frontLeft, frontRight, rearLeft, rearRight, ...headGlow, ...tailGlow, ...reverseGlow];
  [
    { obj: frontLeft, pos: [1.05, -0.45, 0.8] },
    { obj: frontRight, pos: [1.05, 0.45, 0.8] },
    { obj: rearLeft, pos: [-1.05, -0.45, 0.6] },
    { obj: rearRight, pos: [-1.05, 0.45, 0.6] },
    { obj: headGlow[0], pos: [1.2, -0.45, 0.8] },
    { obj: headGlow[1], pos: [1.2, 0.45, 0.8] },
    { obj: tailGlow[0], pos: [-1.2, -0.45, 0.6] },
    { obj: tailGlow[1], pos: [-1.2, 0.45, 0.6] },
    { obj: headL, pos: [1.1, -0.45, 0.8] },
    { obj: headR, pos: [1.1, 0.45, 0.8] },
    { obj: tailL, pos: [-1.1, -0.45, 0.6] },
    { obj: tailR, pos: [-1.1, 0.45, 0.6] },
    { obj: reverseL, pos: [-1.1, -0.3, 0.6] },
    { obj: reverseR, pos: [-1.1, 0.3, 0.6] },
    { obj: reverseGlow[0], pos: [-1.2, -0.3, 0.6] },
    { obj: reverseGlow[1], pos: [-1.2, 0.3, 0.6] },
  ].forEach(({ obj, pos }) => {
    obj.position.set(...pos);
    parts.add(obj);
  });
  carLights = {
    head: [frontLeft, frontRight, headL, headR, ...headGlow],
    tail: [rearLeft, rearRight, tailL, tailR, ...tailGlow],
    reverse: [reverseL, reverseR, ...reverseGlow],
  };

  const mats = {};
  parts.traverse((o) => {
    if (!o.isMesh) return;
    if (['head-light-left', 'head-light-right', 'tail-light-left', 'tail-light-right'].includes(o.name)) return;
    const c = matcapColor(o);
    if (!mats[c]) {
      // Detalles grises y blancos un poco más oscuros; el rojo se satura más: el tinte multiplica el matcap.
      const tint = { gray: 0x9a9a9a, white: 0xb4b4b4, red: 0xff1a10 };
      mats[c] = new THREE.MeshMatcapMaterial({ matcap: matcaps[c], color: tint[c] ?? 0xffffff });
      addPaintGrain(mats[c]);
    }
    o.material = mats[c];
    o.castShadow = true;
  });

  // Escala y apoyo calculados solo con carrocería y ruedas, sin las esferas de luz.
  const bodyBox = () => {
    pose.updateMatrixWorld(true);
    const b = new THREE.Box3();
    for (const ch of parts.children) if (!lightMeshes.includes(ch)) b.expandByObject(ch);
    return b;
  };
  const s = CAR_LENGTH / bodyBox().getSize(new THREE.Vector3()).z;
  parts.scale.setScalar(s);
  const box = bodyBox();
  const c = box.getCenter(new THREE.Vector3());
  // Las ruedas quedan sobre la pista: el borde inferior va a la altura de la cinta.
  pose.position.set(-c.x, ROAD_LIFT - box.min.y, -c.z);
  carPivot.add(pose);
  carPivot.updateMatrixWorld(true);

  wheelRigs = wheels.map((w) => ({ ...w, radius: w.radius * s }));
}

// Ruedas: las delanteras giran al doblar y todas ruedan según la velocidad.
function animateWheels(dt) {
  steerAngle += (-steerDir * 0.8 - steerAngle) * Math.min(1, dt * 12);
  for (const r of wheelRigs) {
    if (r.steer) r.steer.rotation.z = steerAngle;
    r.spin.rotation.y += (car.speed * dt) / r.radius;
  }
}

function updateVehicleLights(isDark) {
  if (!carLights || !carLights.head.length) return;
  for (const light of carLights.head) {
    if (light.isPointLight) light.intensity = isDark ? 2.6 : 0;
    else light.visible = isDark;
  }
  for (const light of carLights.tail) {
    if (light.isPointLight) light.intensity = isDark ? 1.4 : 0;
    else light.visible = isDark;
  }
}

// Reversa: luces blancas traseras y el indicador R solo mientras el auto va hacia atrás.
let reversing = false;
function updateReverse() {
  const on = started && car.speed < -0.5;
  if (on === reversing) return;
  reversing = on;
  for (const light of carLights.reverse) {
    if (light.isPointLight) light.intensity = on ? 2 : 0;
    else light.visible = on;
  }
  gearEl.classList.toggle('on', on);
}

const car = { x: 0, z: 0, y: 0, yaw: 0, speed: 0, vy: 0, groundY: 0 };

// Controles: teclado (flechas o WASD) y joystick táctil.
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
  releaseJoy();
});

// Joystick táctil: tocar acelera, arrastrar a los lados gira (analógico) y arrastrar hacia abajo frena.
// El origen aparece donde se apoya el dedo; el pulgar se limita a JOY_RADIUS.
const JOY_RADIUS = 52;
const JOY_DEAD = 0.12;
const JOY_BRAKE = 0.6;
const JOY_UI = 'button, a, input, #start, #card, .nav, .social';
const joyEl = document.getElementById('joy');
const joyKnob = joyEl.querySelector('.joy-knob');
const joy = { id: null, ox: 0, oy: 0, steer: 0, pull: 0 };

function joyAxis(v) {
  const a = Math.abs(v);
  return a < JOY_DEAD ? 0 : (Math.sign(v) * (a - JOY_DEAD)) / (1 - JOY_DEAD);
}

function moveJoy(x, y) {
  const dx = x - joy.ox;
  const dy = y - joy.oy;
  const k = Math.min(1, JOY_RADIUS / Math.hypot(dx, dy));
  const kx = dx * k;
  const ky = dy * k;
  joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
  joy.steer = joyAxis(kx / JOY_RADIUS);
  joy.pull = ky / JOY_RADIUS;
}

function releaseJoy() {
  joy.id = null;
  joy.steer = 0;
  joy.pull = 0;
  joyEl.classList.remove('on');
}

window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || joy.id !== null || !started) return;
  if (e.target instanceof Element && e.target.closest(JOY_UI)) return;
  joy.id = e.pointerId;
  joy.ox = e.clientX;
  joy.oy = e.clientY;
  joyEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  joyEl.classList.add('on');
  moveJoy(e.clientX, e.clientY);
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) moveJoy(e.clientX, e.clientY);
});
const endJoy = (e) => {
  if (e.pointerId === joy.id) releaseJoy();
};
window.addEventListener('pointerup', endJoy);
window.addEventListener('pointercancel', endJoy);

// Mojado: dentro del río/lagos, pero no sobre el puente (car.groundY alto).
function isWet() {
  return inWater(waterZones, car.x, car.z) && car.groundY < 0.5;
}

function drive(dt) {
  if (!started) return;
  const pulling = joy.id !== null && joy.pull > JOY_BRAKE;
  const gas = input.gas || (joy.id !== null && !pulling);
  const brake = input.brake || pulling;
  if (gas) car.speed += 16 * dt;
  if (brake) car.speed -= (car.speed > 0.5 ? 26 : 10) * dt;
  if (!gas && !brake && car.speed !== 0) {
    const drag = Math.min(Math.abs(car.speed), 8 * dt);
    car.speed -= Math.sign(car.speed) * drag;
  }
  car.speed = Math.min(isWet() ? WATER_MAX_SPEED : MAX_SPEED, Math.max(-MAX_REVERSE, car.speed));

  const grip = Math.min(1.15, 0.42 + Math.abs(car.speed) / 16);
  const keys = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const steer = Math.max(-1, Math.min(1, keys + joy.steer));
  steerDir = steer;
  const turnRate = 0.74 * (0.34 + grip);
  if (steer) car.yaw -= steer * turnRate * Math.sign(car.speed || 1) * dt;

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
    setCardShown(true);
  };
  if (instant) {
    show();
    return;
  }
  setCardShown(false);
  setTimeout(() => {
    if (token === cardToken) show();
  }, CARD_EXIT_MS);
}

// La salida con animación solo arranca desde "mostrada": updateCardVisibility corre cada frame.
const CARD_EXIT_MS = 380;
let cardExitTimer = 0;

function setCardShown(shown) {
  if (shown) {
    clearTimeout(cardExitTimer);
    card.classList.remove('leave');
    card.classList.add('show');
  } else if (card.classList.contains('show')) {
    card.classList.remove('show');
    card.classList.add('leave');
    cardExitTimer = setTimeout(() => card.classList.remove('leave'), CARD_EXIT_MS);
  }
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
  updateCardVisibility();
}

function updateCardVisibility() {
  const target = stationPos[index];
  const d = Math.hypot(car.x - target.x, car.z - target.z);
  setCardShown(d < 18);
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
  const inTunnel = tunnelPos.some((p) => Math.hypot(car.x - p.x, car.z - p.z) < 10);
  const back = inTunnel ? 2.2 : 9;
  const lift = inTunnel ? 2.1 : 4.5;
  const tx = car.x - Math.sin(car.yaw) * back;
  const tz = car.z - Math.cos(car.yaw) * back;
  const ty = car.y + lift;
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
  camLook.set(
    car.x + Math.sin(car.yaw) * (inTunnel ? 9 : 3),
    car.y + (inTunnel ? 1.1 : 1.2),
    car.z + Math.cos(car.yaw) * (inTunnel ? 9 : 3),
  );
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
let travelDistance = 0;
let started = false;
let startRings = [];
const startEl = document.getElementById('start');
document.body.classList.add('idle');

const currentWeather = {
  sky: new THREE.Color(0xcfe5ff),
  fog: new THREE.Color(0x9ec7ff),
  moonIntensity: 0.35,
  rainActive: false,
  snowActive: false,
};

function updateWeather(dt) {
  if (started) travelDistance += Math.abs(car.speed) * dt;
  const cycle = (travelDistance / WEATHER_CYCLE_LEN) % 1;
  let targetSky = new THREE.Color(0xcfe5ff);
  let targetFog = new THREE.Color(0x9ec7ff);
  let targetMoon = 0.35;
  let rainActive = false;
  let snowActive = false;

  if (cycle < 0.24) {
    targetSky = new THREE.Color(0xbfe2ff);
    targetFog = new THREE.Color(0x9cc3ff);
    targetMoon = 0.25;
  } else if (cycle < 0.42) {
    targetSky = new THREE.Color(0xf1b47a);
    targetFog = new THREE.Color(0xc98862);
    targetMoon = 0.45;
  } else if (cycle < 0.6) {
    targetSky = new THREE.Color(0x1d2346);
    targetFog = new THREE.Color(0x131a2f);
    targetMoon = 1.7;
  } else if (cycle < 0.82) {
    targetSky = new THREE.Color(0x243a4d);
    targetFog = new THREE.Color(0x182535);
    targetMoon = 1.2;
    rainActive = true;
  } else {
    targetSky = new THREE.Color(0xeaf1fb);
    targetFog = new THREE.Color(0xc7d5ea);
    targetMoon = 0.9;
    snowActive = true;
  }

  const blend = 1 - Math.exp(-dt * 1.4);
  currentWeather.sky.lerp(targetSky, blend);
  currentWeather.fog.lerp(targetFog, blend);
  currentWeather.moonIntensity = THREE.MathUtils.lerp(currentWeather.moonIntensity, targetMoon, blend);
  currentWeather.rainActive = rainActive;
  currentWeather.snowActive = snowActive;

  scene.background = currentWeather.sky;
  scene.fog.color.copy(currentWeather.fog);
  mountainMaterial.color.copy(currentWeather.fog).lerp(MOUNTAIN_BASE, 0.6);
  moon.intensity = currentWeather.moonIntensity;
  updateVehicleLights(cycle >= 0.24 && cycle < 0.82);
  weatherParticles.rain.visible = currentWeather.rainActive;
  weatherParticles.snow.visible = currentWeather.snowActive;
  const daylight = cycle < 0.42;
  updateLeaves(dt, daylight);
  updateBirds(dt, daylight);

  if (rainActive) {
    const arr = weatherParticles.rain.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= 16 * dt;
      if (arr[i + 1] <= 1.5) {
        arr[i] = (Math.random() - 0.5) * 130;
        arr[i + 1] = 18 + Math.random() * 24;
        arr[i + 2] = (Math.random() - 0.5) * 130;
      }
    }
    weatherParticles.rain.geometry.attributes.position.needsUpdate = true;
  }

  if (snowActive) {
    const arr = weatherParticles.snow.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= 7 * dt;
      arr[i] += Math.sin((elapsed + i) * 0.2) * 0.02;
      if (arr[i + 1] <= 1.5) {
        arr[i] = (Math.random() - 0.5) * 110;
        arr[i + 1] = 8 + Math.random() * 28;
        arr[i + 2] = (Math.random() - 0.5) * 110;
      }
    }
    weatherParticles.snow.geometry.attributes.position.needsUpdate = true;
  }
}

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

// Halo de luz alrededor del punto de inicio, visible hasta empezar. Usa un degradado radial
// para que el borde se difumine en lugar de verse como aros sólidos.
function buildStartRing() {
  const s = stationPos[0];
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.74, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xb48cff,
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), mat);
  halo.position.set(s.x, 0.12, s.z);
  scene.add(halo);
  startRings = [halo];
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  drive(dt);
  updateReverse();
  updateWeather(dt);
  updateVertical(dt);
  animateWheels(dt);
  if (started) {
    collideCar(car, obstacles, debris, onStationBreak);
    updateSocials();
    updateCardVisibility();
  } else {
    const pulse = 1 + Math.sin(elapsed * 3) * 0.04;
    startRings.forEach((r) => (r.scale.setScalar(pulse)));
  }
  debris.update(dt);
  if (started && isWet() && car.speed > 4) {
    splashTimer -= dt;
    if (splashTimer <= 0) {
      splashTimer = 0.09;
      const c = Math.cos(car.yaw);
      const s = Math.sin(car.yaw);
      for (const side of [-1, 1]) {
        debris.splash(car.x + c * 1.1 * side, car.y + 0.6, car.z - s * 1.1 * side, c * side, -s * side);
      }
    }
  }

  wetness += ((started && isWet() ? 1 : 0) - wetness) * Math.min(1, dt * 5);
  const bob = Math.abs(Math.sin(elapsed * 4.2)) * 0.12 * wetness;
  const roll = Math.sin(elapsed * 2.2) * 0.05 * wetness;
  const pitch = Math.sin(elapsed * 3.1 + 1) * 0.03 * wetness;
  const sway = Math.sin(elapsed * 2.6) * 0.05 * wetness;
  carPivot.position.set(car.x, car.y + bob, car.z);
  carPivot.rotation.set(pitch, car.yaw + sway, roll);
  moon.position.set(car.x - 40, 80, car.z - 30);
  moon.target.position.set(car.x, 0, car.z);
  updateCamera(dt);

  for (const tex of waterTextures) tex.offset.y = elapsed * 0.04;
  stationDiscs.forEach((d, i) => d.scale.setScalar(1 + Math.sin(elapsed * 2 + i) * 0.03));

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Carga de assets del juego de Bruno Simon, adaptado por Roy, y arranque del juego.
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
  const moundRamps = buildRoundabout(scene, roundabout);
  buildTunnels(scene, curve);
  const water = buildWater(scene, curve, [...stationPos, ...socialItems], roundabout);
  waterZones = water.zones;
  waterTextures = water.textures;
  buildMarkers();
  buildStationCrates();
  const scenery = buildScenery(scene, curve, [...stationPos, ...socialItems], roundabout, waterZones);
  obstacles.push(...scenery.obstacles);
  ramps = [...scenery.ramps, ...moundRamps, buildBridge(scene, curve)];
  debris = createDebris(scene);
  buildStartRing();
  setupCar({ chassis, antena, brake, reverse, wheel }, matcaps);

  resize();
  teleport(0);
  setIndex(0, true);
  requestAnimationFrame(frame);
});

