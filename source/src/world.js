import * as THREE from 'three';

// Pista lineal de F1: de inicio a fin, con rectas, curvas cerradas y horquillas.
const TRACK_POINTS = [
  [0, 0], [0, 90], [30, 160], [110, 190], [170, 150], [190, 80], [240, 40], [280, -10],
  [250, -70], [190, -80], [150, -120], [80, -130], [20, -170], [-40, -160], [-100, -120],
  [-130, -60], [-90, -20], [-150, 20], [-200, -30], [-250, -10], [-270, 60], [-230, 130],
  [-180, 160], [-205, 190], [-168, 205], [-150, 230], [-90, 260], [-30, 240],
];

export const ROAD_HALF = 2.4;
export const ROAD_LIFT = 0.1;
export const ARENA_HALF = 340;
export const CAR_RADIUS = 1.4;
// Posiciones (fracción de la pista) de los túneles; las cercas no se ponen cerca de ellos.
export const TUNNEL_U = [0.22, 0.46, 0.66, 0.84];
// Escala de los puntos de la pista: acorta el recorrido sin cambiar su forma.
export const TRACK_SCALE = 0.75;

export function createTrack() {
  const points = TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x * TRACK_SCALE, 0, z * TRACK_SCALE));
  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

// Generador pseudoaleatorio con semilla: el paisaje queda igual en cada carga.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Ruido de valor sobre una rejilla de cellsX × cellsY celdas: al envolver la textura no hay costuras.
function valueNoise(S, cellsX, cellsY, rand) {
  const grid = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * cellsY;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const r0 = (y0 % cellsY) * cellsX;
    const r1 = ((y0 + 1) % cellsY) * cellsX;
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * cellsX;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const c0 = x0 % cellsX;
      const c1 = (x0 + 1) % cellsX;
      out[y * S + x] = mix(mix(grid[r0 + c0], grid[r0 + c1], tx), mix(grid[r1 + c0], grid[r1 + c1], tx), ty);
    }
  }
  return out;
}

// Suma de octavas: manchas grandes con detalle fino encima. Valores 0..1.
function fbm(S, cellsX, cellsY, octaves, rand) {
  const out = new Float32Array(S * S);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(S, cellsX << o, cellsY << o, rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function makeTexture(S, pixels, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  c.getContext('2d').putImageData(new ImageData(pixels, S, S), 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Mapa de normales a partir de una altura 0..1: da relieve sin geometría extra.
function normalMapTexture(S, height, strength, repeat = [1, 1]) {
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    const up = ((y + S - 1) % S) * S;
    const down = ((y + 1) % S) * S;
    for (let x = 0; x < S; x++) {
      const left = (x + S - 1) % S;
      const right = (x + 1) % S;
      const dx = (height[y * S + left] - height[y * S + right]) * strength;
      const dy = (height[down + x] - height[up + x]) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      px[i] = (dx * inv * 0.5 + 0.5) * 255;
      px[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      px[i + 2] = (inv * 0.5 + 0.5) * 255;
      px[i + 3] = 255;
    }
  }
  return makeTexture(S, px, repeat, false);
}

function frameAt(curve, u) {
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u);
  const l = Math.hypot(t.x, t.z);
  return { p, t, yaw: Math.atan2(t.x, t.z), nx: -t.z / l, nz: t.x / l };
}

// Seno del giro de la pista alrededor de u (positivo = la curva se cierra hacia +normal).
function turnSine(curve, u, d = 0.004) {
  const a = frameAt(curve, Math.max(0, u - d)).t;
  const b = frameAt(curve, Math.min(1, u + d)).t;
  return (a.x * b.z - a.z * b.x) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z));
}

// Posición y rumbo del auto en el punto u (0..1) de la pista.
export function poseAt(curve, u) {
  const { p, yaw } = frameAt(curve, u);
  return { x: p.x, z: p.z, yaw };
}

// Pasto: parches de tono, hojas finas en vertical y zonas secas; el relieve va en el mapa de normales.
function grassMaps() {
  const S = 512;
  const rand = mulberry32(11);
  const patch = fbm(S, 3, 3, 4, rand);
  const grain = fbm(S, 48, 48, 2, rand);
  const blades = valueNoise(S, 160, 10, rand);
  const dark = [0.08, 0.17, 0.06];
  const light = [0.28, 0.45, 0.18];
  const dry = [0.3, 0.29, 0.14];
  const height = new Float32Array(S * S);
  const px = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const h = 0.5 * grain[i] + 0.5 * blades[i];
    height[i] = h;
    const v = 0.5 * patch[i] + 0.5 * h + (rand() - 0.5) * 0.06;
    const t = clamp01((v - 0.3) / 0.5);
    const drySpot = clamp01((patch[i] - 0.6) * 6) * 0.5;
    for (let c = 0; c < 3; c++) {
      px[i * 4 + c] = mix(mix(dark[c], light[c], t), dry[c], drySpot) * 255;
    }
    px[i * 4 + 3] = 255;
  }
  return {
    map: makeTexture(S, px, [18, 18]),
    normalMap: normalMapTexture(S, height, 3, [18, 18]),
  };
}

// Asfalto: base gris azulado, manchas de betún y piedrecillas claras con grano fino.
function asphaltMaps() {
  const S = 512;
  const rand = mulberry32(23);
  const tar = fbm(S, 4, 4, 3, rand);
  const grit = valueNoise(S, 256, 256, rand);
  const stones = valueNoise(S, 64, 64, rand);
  const base = [0.24, 0.25, 0.28];
  const stone = [0.46, 0.47, 0.49];
  const height = new Float32Array(S * S);
  const px = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const pebble = clamp01((stones[i] - 0.62) * 5);
    const v = 0.5 + (tar[i] - 0.5) * 0.6 + (grit[i] - 0.5) * 0.25;
    height[i] = 0.5 * grit[i] + pebble;
    for (let c = 0; c < 3; c++) {
      px[i * 4 + c] = mix(base[c] * (0.8 + 0.4 * v), stone[c], pebble * 0.7) * 255;
    }
    px[i * 4 + 3] = 255;
  }
  return {
    map: makeTexture(S, px, [14, 10]),
    normalMap: normalMapTexture(S, height, 4, [14, 10]),
  };
}

// Madera de granja: tablones horizontales con juntas oscuras y vetas alargadas.
function woodMaps() {
  const S = 256;
  const PLANKS = 4;
  const plankH = S / PLANKS;
  const rand = mulberry32(31);
  const grain = valueNoise(S, 4, 32, rand);
  const fibers = valueNoise(S, 8, 128, rand);
  const tints = Array.from({ length: PLANKS }, () => 0.85 + rand() * 0.3);
  const base = [0.6, 0.42, 0.24];
  const height = new Float32Array(S * S);
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    const plank = Math.floor(y / plankH);
    const seam = y % plankH < 2;
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const g = 0.6 * grain[i] + 0.4 * fibers[i];
      const shade = tints[plank] * (0.8 + 0.4 * g) * (seam ? 0.45 : 1);
      for (let c = 0; c < 3; c++) px[i * 4 + c] = base[c] * shade * 255;
      px[i * 4 + 3] = 255;
      height[i] = g - (seam ? 0.5 : 0);
    }
  }
  return {
    map: makeTexture(S, px),
    normalMap: normalMapTexture(S, height, 6),
  };
}

function buildGround(scene) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 40, ARENA_HALF * 2 + 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ ...grassMaps(), roughness: 1 })
  );
  grass.receiveShadow = true;
  scene.add(grass);
}

// Cinta plana que sigue la pista entre los desplazamientos a y b (perpendiculares al eje).
// t0..t1 limita el tramo de la pista que se dibuja (0..1).
// alphaAt(t), si se pasa, da la opacidad (0..1) en cada punto para difuminar la cinta.
function buildStrip(scene, curve, a, b, material, uRepeat = 1, lift = ROAD_LIFT, t0 = 0, t1 = 1, alphaAt = null) {
  const SEG = Math.max(1, Math.ceil(1200 * (t1 - t0)));
  const pos = [];
  const uv = [];
  const index = [];
  const rgba = [];
  let len = 0;
  let prev = null;
  for (let i = 0; i <= SEG; i++) {
    const t = t0 + ((t1 - t0) * i) / SEG;
    const p = curve.getPointAt(t);
    const { nx, nz } = frameAt(curve, t);
    if (prev) len += p.distanceTo(prev);
    prev = p;
    pos.push(p.x + nx * a, lift, p.z + nz * a, p.x + nx * b, lift, p.z + nz * b);
    uv.push(0, len / 9, uRepeat, len / 9);
    const alpha = alphaAt === null ? 1 : alphaAt(t);
    rgba.push(1, 1, 1, alpha, 1, 1, 1, alpha);
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
  if (alphaAt !== null) {
    geo.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
    material = material.clone();
    Object.assign(material, { vertexColors: true, transparent: true, depthWrite: false });
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// Bloques rojos y blancos alternos a lo largo de la curva, con borde irregular y algo de suciedad.
const KERB_BLOCKS = 22;
function kerbTexture() {
  const S = 128;
  const rand = mulberry32(41);
  const wear = fbm(S, 8, 8, 3, rand);
  const red = [0.72, 0.13, 0.12];
  const white = [0.9, 0.9, 0.88];
  const grime = [0.42, 0.38, 0.33];
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const isRed = (Math.floor(((y + (wear[i] - 0.5) * 4) / S) * KERB_BLOCKS) & 1) === 0;
      const dirt = clamp01((wear[i] - 0.45) * 1.8) * 0.35;
      for (let c = 0; c < 3; c++) {
        px[i * 4 + c] = mix(isRed ? red[c] : white[c], grime[c], dirt) * 255;
      }
      px[i * 4 + 3] = 255;
    }
  }
  return makeTexture(S, px);
}

// Tramos de la pista con curva cerrada: ahí van los bordillos rojos y blancos.
const KERB_TURN = 0.25;
const KERB_D = 0.006;
function curveRanges(curve, tMax) {
  const raw = [];
  let start = null;
  for (let t = 0; t <= tMax; t += 0.002) {
    const on = Math.abs(turnSine(curve, t, KERB_D)) > KERB_TURN;
    if (on && start === null) start = t;
    if (!on && start !== null) {
      raw.push([start, t]);
      start = null;
    }
  }
  if (start !== null) raw.push([start, tMax]);
  const merged = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < 0.02) last[1] = r[1];
    else merged.push(r);
  }
  return merged;
}

// Fracción de la pista donde el centro entra al borde externo de la rotonda; la pista termina ahí.
function ringCutT(curve) {
  const ring = roundaboutLayout(curve);
  let t = 1;
  while (t > 0) {
    const p = curve.getPointAt(t);
    if (Math.hypot(p.x - ring.x, p.z - ring.z) >= RING_OUT) break;
    t -= 0.0005;
  }
  return t;
}

// Inicio difuminado: la pista sube desde transparente hasta opaca en este tramo (0..1).
const START_FADE_T = 0.05;
// Distancia (en t) entre la meta y el punto donde la pista entra a la rotonda.
const FINISH_GAP_T = 0.012;
const FINISH_SQUARE = 0.6;

// Cuadros blancos y negros: 2×2 cuadros por repetición de la textura.
function checkerTexture() {
  const S = 64;
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const white = (Math.floor(x / (S / 2)) + Math.floor(y / (S / 2))) % 2 === 0;
      const c = white ? 245 : 20;
      px.set([c, c, c, 255], (y * S + x) * 4);
    }
  }
  return makeTexture(S, px);
}

// Línea de meta a cuadros que cruza toda la pista en t.
function buildFinishLine(scene, curve, t) {
  const p = curve.getPointAt(t);
  const { nx, nz } = frameAt(curve, t);
  const half = FINISH_SQUARE;
  // Ancho en la dirección lateral (nx, nz); profundidad en la dirección de la pista (nz, -nx).
  const at = (d, s) => [p.x + nx * s + nz * d, ROAD_LIFT + 0.06, p.z + nz * s - nx * d];
  const pos = [];
  for (const d of [-half, half]) {
    for (const s of [-ROAD_HALF, ROAD_HALF]) pos.push(...at(d, s));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 4, 0, 0, 1, 4, 1], 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const mat = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function buildTrack(scene, curve) {
  buildGround(scene);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.7, side: THREE.DoubleSide });
  const asphaltMat = new THREE.MeshStandardMaterial({ ...asphaltMaps(), roughness: 0.95, side: THREE.DoubleSide });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, side: THREE.DoubleSide });
  const cut = ringCutT(curve);
  const startIn = (t) => clamp01(t / START_FADE_T);
  // Tramo final difuminado: la pista se funde con el asfalto de la rotonda.
  const endOut = (t) => clamp01((1 - t) / (1 - cut));
  buildStrip(scene, curve, -ROAD_HALF, ROAD_HALF, asphaltMat, 1, ROAD_LIFT, 0, cut, startIn);
  buildStrip(scene, curve, ROAD_HALF - 0.22, ROAD_HALF, lineMat, 1.4, ROAD_LIFT + 0.04, 0, cut, startIn);
  buildStrip(scene, curve, -ROAD_HALF, -ROAD_HALF + 0.22, lineMat, 1.4, ROAD_LIFT + 0.04, 0, cut, startIn);
  buildStrip(scene, curve, -ROAD_HALF, ROAD_HALF, asphaltMat, 1, ROAD_LIFT, cut, 1, endOut);
  buildStrip(scene, curve, ROAD_HALF - 0.22, ROAD_HALF, lineMat, 1.4, ROAD_LIFT + 0.04, cut, 1, endOut);
  buildStrip(scene, curve, -ROAD_HALF, -ROAD_HALF + 0.22, lineMat, 1.4, ROAD_LIFT + 0.04, cut, 1, endOut);
  buildFinishLine(scene, curve, cut - FINISH_GAP_T);
  for (const [t0, t1] of curveRanges(curve, cut)) {
    buildStrip(scene, curve, ROAD_HALF + 0.02, ROAD_HALF + 0.22, kerbMat, 1, ROAD_LIFT, t0, t1);
    buildStrip(scene, curve, -ROAD_HALF - 0.22, -ROAD_HALF - 0.02, kerbMat, 1, ROAD_LIFT, t0, t1);
  }
}

// Rotonda al final de la pista: anillo hueco que la pista toca tangencialmente.
const RING_IN = 9;
const RING_OUT = 19;
const RING_MID = (RING_IN + RING_OUT) / 2;
// Separación entre los tres cubos con logo (GitHub, LinkedIn, correo), a lo largo de la línea de la rotonda.
const ICON_SPREAD = 5;

export function roundaboutLayout(curve) {
  const end = curve.getPointAt(1);
  const dir = curve.getTangentAt(1).normalize();
  const n = { x: -dir.z, z: dir.x };
  const x = end.x + n.x * RING_MID;
  const z = end.z + n.z * RING_MID;
  const at = (s) => ({ x: x + n.x * s, z: z + n.z * s });
  return { x, z, rIn: RING_IN, rOut: RING_OUT, icons: [at(-ICON_SPREAD), at(0), at(ICON_SPREAD)] };
}

// Altura del pequeño cerro bajo cada icono social; los cubos se apoyan en su cima.
export const ICON_MOUND_H = 1.4;
const ICON_MOUND_TOP = 2.4;
const ICON_MOUND_BASE = 3.6;

// Devuelve las plataformas de los cerros para que heightAt suba al auto por encima de ellos.
export function buildRoundabout(scene, layout) {
  const asphaltMat = new THREE.MeshStandardMaterial({ ...asphaltMaps(), roughness: 0.95, side: THREE.DoubleSide });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, side: THREE.DoubleSide });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.95, flatShading: true });
  const place = (geo, mat, lift) => {
    const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), mat);
    m.position.set(layout.x, lift, layout.z);
    scene.add(m);
  };
  place(new THREE.RingGeometry(layout.rIn, layout.rOut, 96), asphaltMat, ROAD_LIFT);
  place(new THREE.RingGeometry(layout.rIn, layout.rIn + 0.22, 96), lineMat, ROAD_LIFT + 0.04);
  place(new THREE.RingGeometry(layout.rOut - 0.22, layout.rOut, 96), lineMat, ROAD_LIFT + 0.04);
  return layout.icons.map((icon) => {
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(ICON_MOUND_TOP, ICON_MOUND_BASE, ICON_MOUND_H, 20), grassMat);
    mound.position.set(icon.x, ROAD_LIFT + ICON_MOUND_H / 2, icon.z);
    scene.add(mound);
    return { x: icon.x, z: icon.z, mound: true, h: ICON_MOUND_H, top: ICON_MOUND_TOP, base: ICON_MOUND_BASE };
  });
}

// Charcos que cruzan la pista: tramos rectos donde el agua tapa el asfalto.
const WATER_WINDOWS = [[0.045, 0.06], [0.565, 0.58], [0.745, 0.76]];
const WATER_HALF = ROAD_HALF + 0.22;
const WATER_LIFT = ROAD_LIFT + 0.12;

// Agua: degradé periódico (sin costuras) con relieve de ondas y crestas que se repiten.
function waterMaps() {
  const S = 256;
  const rand = mulberry32(61);
  const ripples = fbm(S, 8, 1, 3, rand);
  const light = [0.165, 0.525, 0.72];
  const dark = [0.078, 0.314, 0.494];
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    const band = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / S);
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const shade = 0.9 + 0.2 * ripples[i];
      for (let c = 0; c < 3; c++) px[i * 4 + c] = mix(light[c], dark[c], band) * shade * 255;
      px[i * 4 + 3] = 255;
    }
  }
  const map = makeTexture(S, px);
  const g = map.image.getContext('2d');
  g.strokeStyle = 'rgba(210, 240, 255, 0.6)';
  g.lineWidth = 2;
  for (let i = 0; i < 46; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 6 + rand() * 16;
    g.globalAlpha = 0.25 + rand() * 0.45;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        g.beginPath();
        g.arc(x + dx, y + dy, r, Math.PI * 0.1, Math.PI * 0.9);
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  map.needsUpdate = true;
  return { map, normalMap: normalMapTexture(S, ripples, 3) };
}

function buildWaterStrip(scene, curve, uA, uB, material) {
  const SEG = 160;
  const pos = [];
  const uv = [];
  const index = [];
  let len = 0;
  let prev = null;
  for (let i = 0; i <= SEG; i++) {
    const t = uA + ((uB - uA) * i) / SEG;
    const p = curve.getPointAt(t);
    const { nx, nz } = frameAt(curve, t);
    if (prev) len += p.distanceTo(prev);
    prev = p;
    pos.push(p.x - nx * WATER_HALF, WATER_LIFT, p.z - nz * WATER_HALF, p.x + nx * WATER_HALF, WATER_LIFT, p.z + nz * WATER_HALF);
    uv.push(0, len / 6, 1.6, len / 6);
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
  scene.add(new THREE.Mesh(geo, material));
}

// Ríos y lagos. El río cruza la pista en el puente y termina en dos lagos a los lados.
const BRIDGE_U = 0.356;
const RIVER_ALONG = 8;
const RIVER_LAT = 95;
const LAKE_R = 14;
const FREE_LAKES = 2;
const WATER_TILE = 24;
const MUD_COLOR = 0x5a4632;

// Rectángulo horizontal (a lo largo de yaw) con UV en unidades de mundo.
function rectGeo(cx, cz, yaw, along, lat, y) {
  const ax = Math.sin(yaw);
  const az = Math.cos(yaw);
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const pos = [];
  const uv = [];
  for (const [s, l] of [[-along, -lat], [along, -lat], [along, lat], [-along, lat]]) {
    const x = cx + ax * s + lx * l;
    const z = cz + az * s + lz * l;
    pos.push(x, y, z);
    uv.push(x / WATER_TILE, z / WATER_TILE);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

function discGeo(cx, cz, r, y) {
  const geo = new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2).translate(cx, y, cz);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / WATER_TILE, pos.getZ(i) / WATER_TILE);
  uv.needsUpdate = true;
  return geo;
}

// Zonas de agua: charcos y río como rectángulos (lat = mitad ancho lateral), lagos como círculos (r).
// avoid y ring: lugares que el agua no debe tocar (estaciones y rotonda).
export function waterLayout(curve, avoid = [], ring = null) {
  const trackLen = curve.getLength();
  const zones = WATER_WINDOWS.map(([uA, uB]) => {
    const { p, yaw } = frameAt(curve, (uA + uB) / 2);
    return { x: p.x, z: p.z, yaw, half: ((uB - uA) * trackLen) / 2 + 0.5 };
  });
  const bridge = frameAt(curve, BRIDGE_U);
  const lx = Math.cos(bridge.yaw);
  const lz = -Math.sin(bridge.yaw);
  const river = { x: bridge.p.x, z: bridge.p.z, yaw: bridge.yaw, half: RIVER_ALONG, lat: RIVER_LAT };
  const lakes = [-1, 1].map((sign) => ({
    x: bridge.p.x + lx * sign * RIVER_LAT,
    z: bridge.p.z + lz * sign * RIVER_LAT,
    r: LAKE_R,
  }));
  zones.push(river, ...lakes);

  // Lagos libres con semilla fija: el paisaje queda igual en cada visita.
  const samples = Array.from({ length: 1001 }, (_, i) => curve.getPointAt(i / 1000));
  const trackDist = (x, z) => Math.min(...samples.map((s) => Math.hypot(s.x - x, s.z - z)));
  const rnd = mulberry32(777);
  const freeLakes = [];
  for (let tries = 0; tries < 800 && freeLakes.length < FREE_LAKES; tries++) {
    const r = 12 + rnd() * 8;
    const x = (rnd() * 2 - 1) * (ARENA_HALF - 60);
    const z = (rnd() * 2 - 1) * (ARENA_HALF - 60);
    if (Math.hypot(x, z) < 70) continue;
    if (trackDist(x, z) < r + ROAD_HALF + 16) continue;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < r + 22)) continue;
    if (ring && Math.hypot(x - ring.x, z - ring.z) < ring.rOut + r + 14) continue;
    if (waterDist(zones, x, z) < r + 12) continue;
    const lake = { x, z, r };
    freeLakes.push(lake);
    zones.push(lake);
  }
  return { zones, river, lakes: [...lakes, ...freeLakes] };
}

// Construye los charcos, el río y los lagos. Devuelve zonas y las texturas para animarlas.
export function buildWater(scene, curve, avoid = [], ring = null) {
  const { map, normalMap } = waterMaps();
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Charcos sobre la pista: brillo propio y más reflejo para no confundirse con el asfalto de noche.
  const puddle = material.clone();
  puddle.emissive = new THREE.Color(0x8fd0ff);
  puddle.emissiveMap = map;
  puddle.emissiveIntensity = 1.5;
  puddle.roughness = 0.04;
  const mud = new THREE.MeshStandardMaterial({ color: MUD_COLOR, roughness: 1 });
  const { zones, river, lakes } = waterLayout(curve, avoid, ring);

  WATER_WINDOWS.forEach(([uA, uB]) => buildWaterStrip(scene, curve, uA, uB, puddle));
  scene.add(new THREE.Mesh(rectGeo(river.x, river.z, river.yaw, RIVER_ALONG + 1.4, RIVER_LAT + 1.4, 0.05), mud));
  scene.add(new THREE.Mesh(rectGeo(river.x, river.z, river.yaw, RIVER_ALONG, RIVER_LAT, WATER_LIFT), material));
  for (const lake of lakes) {
    scene.add(new THREE.Mesh(discGeo(lake.x, lake.z, lake.r + 1.8, 0.05), mud));
    scene.add(new THREE.Mesh(discGeo(lake.x, lake.z, lake.r, WATER_LIFT), material));
  }
  return { zones, textures: [map, normalMap] };
}

// Puente sobre el río: rampas suaves, tablero de piedra con calzada de asfalto y pretiles de madera.
const BRIDGE_HALF = 9;
const BRIDGE_RAMP = 6;
const BRIDGE_H = 1.6;
const BRIDGE_W = ROAD_HALF + 0.6;
const BRIDGE_RAIL = 0.9;

// Perfil (x a lo largo, y altura) extruido a lo ancho, centrado en lat y en el tramo de largo span.
function bridgeProfile(points, depth, lat, span, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2).translate(depth / 2 + lat, 0, -span / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildBridge(scene, curve) {
  const { p, yaw } = frameAt(curve, BRIDGE_U);
  const span = 2 * (BRIDGE_HALF + BRIDGE_RAMP);
  const rise = (x) => BRIDGE_H * Math.min(1, Math.max(0, (BRIDGE_HALF + BRIDGE_RAMP - Math.abs(x - span / 2)) / BRIDGE_RAMP));
  const xs = Array.from({ length: 41 }, (_, i) => (i / 40) * span);
  const xsBack = [...xs].reverse();
  const top = xs.map((x) => [x, rise(x)]);
  const topBack = xsBack.map((x) => [x, rise(x)]);

  const stone = new THREE.MeshStandardMaterial({ color: RAMP_COLOR, roughness: 0.8, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ ...asphaltMaps(), roughness: 0.95, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ ...woodMaps(), roughness: 0.9, side: THREE.DoubleSide });

  const group = new THREE.Group();
  group.position.copy(p);
  group.rotation.y = yaw;
  group.add(bridgeProfile([...top, ...xsBack.map((x) => [x, rise(x) - 0.5])], 2 * BRIDGE_W, 0, span, stone));
  group.add(bridgeProfile([...xs.map((x) => [x, rise(x) + 0.04]), ...topBack], 2 * ROAD_HALF, 0, span, asphalt));
  for (const side of [-1, 1]) {
    const lat = side * (BRIDGE_W - 0.15);
    group.add(bridgeProfile([...top, ...xsBack.map((x) => [x, rise(x) + BRIDGE_RAIL])], 0.3, lat, span, wood));
  }
  scene.add(group);

  return { deck: true, x: p.x, z: p.z, yaw, half: BRIDGE_HALF, ramp: BRIDGE_RAMP, h: BRIDGE_H, w: BRIDGE_W };
}

// Distancia del punto a la zona de agua más cercana (0 si está dentro).
export function waterDist(zones, x, z) {
  let best = Infinity;
  for (const w of zones) {
    const dx = x - w.x;
    const dz = z - w.z;
    let d;
    if (w.r) {
      d = Math.max(0, Math.hypot(dx, dz) - w.r);
    } else {
      const s = dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw);
      const lat = dx * Math.cos(w.yaw) - dz * Math.sin(w.yaw);
      d = Math.hypot(Math.max(0, Math.abs(s) - w.half), Math.max(0, Math.abs(lat) - (w.lat ?? WATER_HALF)));
    }
    best = Math.min(best, d);
  }
  return best;
}

export function inWater(zones, x, z) {
  return zones.some((w) => {
    const dx = x - w.x;
    const dz = z - w.z;
    if (w.r) return dx * dx + dz * dz <= w.r * w.r;
    const s = dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw);
    const lat = dx * Math.cos(w.yaw) - dz * Math.sin(w.yaw);
    return Math.abs(s) <= w.half && Math.abs(lat) <= (w.lat ?? WATER_HALF);
  });
}

// Árboles, arbustos, llantas, barriles, cajas y rampas. Cada obstáculo es un círculo en el suelo.
// solid: bloquea al auto. Si no es sólido, se destruye al chocar (drag = freno al romperse).
const FOLIAGE_COLORS = [0x316d3c, 0x224f2c, 0x407f4d, 0x2c5e34, 0x4f7a3a, 0x3d6b45, 0x6b5a2a];
const BUSH_COLOR = 0x23501f;
const TRUNK_COLOR = 0x4a3524;
const ROCK_COLOR = 0x6e737b;
const WOOD_COLOR = 0x9c6b3a;
const TIRE_COLOR = 0x1b1b1d;
const BARREL_COLOR = 0x161a1f;
const RAMP_COLOR = 0x8a8f99;

// Corteza en escala de grises (el color del material la tiñe): surcos verticales y grano fino.
function barkMaps() {
  const S = 256;
  const rand = mulberry32(53);
  const ridge = valueNoise(S, 24, 3, rand);
  const fine = valueNoise(S, 48, 12, rand);
  const height = new Float32Array(S * S);
  const px = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = 0.6 * ridge[i] + 0.4 * fine[i];
    const crack = clamp01(1 - Math.abs(ridge[i] - 0.5) / 0.03);
    const shade = (0.7 + 0.3 * v) * (1 - 0.45 * crack);
    height[i] = v - crack;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = shade * 255;
    px[i * 4 + 3] = 255;
  }
  return {
    map: makeTexture(S, px, [2, 1]),
    normalMap: normalMapTexture(S, height, 5, [2, 1]),
  };
}

// Follaje en escala de grises: manchas de luz y sombra con grano fino; el color del material la tiñe.
function foliageMaps() {
  const S = 256;
  const rand = mulberry32(71);
  const blotch = fbm(S, 6, 6, 3, rand);
  const grain = valueNoise(S, 64, 64, rand);
  const height = new Float32Array(S * S);
  const px = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = 0.55 * blotch[i] + 0.45 * grain[i];
    height[i] = v;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = (0.72 + 0.28 * v) * 255;
    px[i * 4 + 3] = 255;
  }
  return {
    map: makeTexture(S, px, [2, 2]),
    normalMap: normalMapTexture(S, height, 3, [2, 2]),
  };
}

export function buildTunnels(scene, curve) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x18272b, roughness: 0.96, metalness: 0.12 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x111b24, emissive: 0x1d2a39, emissiveIntensity: 0.12, roughness: 0.82, metalness: 0.18 });
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x36414d, emissive: 0x141b25, emissiveIntensity: 0.16, roughness: 0.6, metalness: 0.14 });
  for (const u of TUNNEL_U) {
    const { p, yaw } = frameAt(curve, u);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = yaw;

    const depth = 22;
    const height = 5.2;
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.6, height, depth), wallMat);
    const rightWall = leftWall.clone();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.4, depth), glowMat);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.45, depth), new THREE.MeshStandardMaterial({ color: 0x222d34, roughness: 0.88 }));
    const ceilingLight1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, depth * 0.72), stripMat);
    const ceilingLight2 = ceilingLight1.clone();
    leftWall.position.set(-3.5, height * 0.5, 0);
    rightWall.position.set(3.5, height * 0.5, 0);
    roof.position.set(0, height + 0.45, 0);
    floor.position.set(0, -0.3, 0);
    ceilingLight1.position.set(-2.1, height + 0.6, 0);
    ceilingLight2.position.set(2.1, height + 0.6, 0);
    [leftWall, rightWall, roof, floor, ceilingLight1, ceilingLight2].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    });
    scene.add(g);
  }
}

export function buildScenery(scene, curve, avoid, ring, water = []) {
  const rnd = mulberry32(20250);
  const between = (a, b) => a + (b - a) * rnd();
  const obstacles = [];
  const ramps = [];

  // Muestras de la pista para medir distancias (evita poner cosas sobre el asfalto).
  const SAMPLES = 2000;
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => curve.getPointAt(i / SAMPLES));
  // El disco de la rotonda entero cuenta como pista: no se pone nada dentro ni cerca.
  // El agua también cuenta como pista para que árboles y rocas no caigan dentro.
  const distToTrack = (x, z) => {
    let best = Infinity;
    for (const s of samples) {
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d < best) best = d;
    }
    let d = Math.sqrt(best);
    if (ring) d = Math.min(d, Math.max(0, Math.hypot(x - ring.x, z - ring.z) - ring.rOut));
    if (water.length) d = Math.min(d, waterDist(water, x, z));
    return d;
  };
  const inArena = (x, z) => Math.abs(x) < ARENA_HALF - 10 && Math.abs(z) < ARENA_HALF - 10;
  const farFrom = (x, z, pts, r) => pts.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r);

  const bark = barkMaps();
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.72, 4.3, 10).translate(0, 2.15, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ ...bark, color: TRUNK_COLOR, roughness: 1 });
  const coneGeo = new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0);
  const ballGeo = new THREE.IcosahedronGeometry(1, 1);
  const foliage = foliageMaps();
  const foliageMats = FOLIAGE_COLORS.map((c) => new THREE.MeshStandardMaterial({ ...foliage, color: c, roughness: 1 }));
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: ROCK_COLOR, roughness: 0.95, flatShading: true });
  const logGeo = new THREE.CylinderGeometry(0.55, 0.55, 4, 10).rotateX(Math.PI / 2);
  const logMat = new THREE.MeshStandardMaterial({ ...bark, color: TRUNK_COLOR, roughness: 1 });
  const tireGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.55, 14);
  const tireMat = new THREE.MeshStandardMaterial({ color: TIRE_COLOR, roughness: 0.9 });
  const barrelGeo = new THREE.CylinderGeometry(0.72, 0.78, 1.5, 14);
  const barrelMat = new THREE.MeshStandardMaterial({ color: BARREL_COLOR, roughness: 0.85, metalness: 0.18 });
  const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const crateMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.9 });

  const shadowed = (m) => {
    m.castShadow = true;
    return m;
  };
  const cone = (parent, r, h, y, mat) => {
    const m = shadowed(new THREE.Mesh(coneGeo, mat));
    m.scale.set(r, h, r);
    m.position.y = y;
    parent.add(m);
  };
  const ball = (parent, r, x, y, z, mat) => {
    const m = shadowed(new THREE.Mesh(ballGeo, mat));
    m.scale.setScalar(r);
    m.position.set(x, y, z);
    parent.add(m);
  };
  // Tres especies: pino clásico, abeto alto y copa redonda.
  const makeTree = (kind, mat) => {
    const g = new THREE.Group();
    const trunkH = kind === 'round' ? 3 : kind === 'spruce' ? 3.2 : 4.3;
    const trunk = shadowed(new THREE.Mesh(trunkGeo, trunkMat));
    trunk.scale.y = trunkH / 4.3;
    g.add(trunk);
    if (kind === 'pine') {
      cone(g, 3.8, 5.2, 2.9, mat);
      cone(g, 3, 4.4, 6, mat);
      cone(g, 2.2, 3.6, 8.8, mat);
      ball(g, 1.8, 0.9, 7.4, 0.8, mat);
    } else if (kind === 'spruce') {
      for (let i = 0; i < 5; i++) cone(g, 2.6 - i * 0.42, 3.4, 1.2 + i * 1.6, mat);
    } else {
      ball(g, 2.3, 0, 4.2, 0, mat);
      ball(g, 1.7, 1.2, 5.2, 0.4, mat);
      ball(g, 1.9, -1, 5, -0.6, mat);
      ball(g, 1.4, 0.2, 6.3, -0.5, mat);
    }
    return g;
  };
  const TREE_KINDS = ['pine', 'spruce', 'round'];

  // Árboles grandes: fuera de la pista, bloquean el paso.
  for (let k = 0, placed = 0; placed < 520 && k < 8000; k++) {
    const { p, nx, nz } = frameAt(curve, rnd());
    const o = (rnd() < 0.5 ? -1 : 1) * between(ROAD_HALF + 4, ROAD_HALF + 60);
    const x = p.x + nx * o;
    const z = p.z + nz * o;
    if (!inArena(x, z) || distToTrack(x, z) < ROAD_HALF + 5 || !farFrom(x, z, avoid, 14)) continue;
    const s = between(0.9, 1.4);
    const kind = TREE_KINDS[Math.floor(rnd() * TREE_KINDS.length)];
    const mat = foliageMats[Math.floor(rnd() * foliageMats.length)];
    const g = makeTree(kind, mat);
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = rnd() * Math.PI * 2;
    scene.add(g);
    obstacles.push({ x, z, r: 1.1 * s, solid: true, group: g });
    placed++;
  }

  // Rocas y troncos caídos al borde de la pista: obstáculos sólidos.
  for (let k = 0, placed = 0; placed < 40 && k < 2000; k++) {
    const { p, nx, nz, yaw } = frameAt(curve, rnd());
    const side = rnd() < 0.5 ? -1 : 1;
    const isLog = rnd() < 0.4;
    const o = side * (isLog ? ROAD_HALF + 1.8 : ROAD_HALF + 2 + rnd() * 6);
    const x = p.x + nx * o;
    const z = p.z + nz * o;
    if (!inArena(x, z) || distToTrack(x, z) < ROAD_HALF + 1.2 || !farFrom(x, z, avoid, 12)) continue;
    const s = isLog ? 1 : between(0.9, 1.5);
    const mesh = isLog ? new THREE.Mesh(logGeo, logMat) : new THREE.Mesh(rockGeo, rockMat);
    if (isLog) {
      mesh.position.set(x, 0.55, z);
      mesh.rotation.y = yaw;
    } else {
      mesh.scale.set(s * 1.3, s * 0.9, s * 1.2);
      mesh.position.set(x, 0.5 * s, z);
      mesh.rotation.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push({ x, z, r: isLog ? 1.4 : 1.3 * s, solid: true, group: mesh });
    placed++;
  }

  // Arbustos chicos al borde del pasto: se aplastan al chocar.
  for (let k = 0, placed = 0; placed < 320 && k < 4000; k++) {
    const { p, nx, nz } = frameAt(curve, rnd());
    const o = (rnd() < 0.5 ? -1 : 1) * between(ROAD_HALF + 1.6, ROAD_HALF + 12);
    const x = p.x + nx * o;
    const z = p.z + nz * o;
    if (!inArena(x, z) || distToTrack(x, z) < ROAD_HALF + 0.8 || !farFrom(x, z, avoid, 10)) continue;
    const s = between(0.7, 1.3);
    const bush = new THREE.Group();
    const colors = [0x377c40, 0x235f2f, 0x4a844d];
    for (let i = 0; i < 4; i++) {
      const piece = new THREE.Mesh(new THREE.SphereGeometry(1.15 - i * 0.12, 10, 8), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 1 }));
      piece.position.set((i % 2 === 0 ? -0.7 : 0.7) + (i - 1.5) * 0.12, 0.55 + i * 0.16, i % 2 === 0 ? 0.4 : -0.3);
      bush.add(piece);
    }
    bush.position.set(x, 0, z);
    bush.scale.setScalar(s);
    scene.add(bush);
    obstacles.push({ x, z, r: 1.15 * s, solid: false, drag: 0.92, group: bush, color: BUSH_COLOR });
    placed++;
  }

  // Llantas apiladas en los bordes de la pista: bloquean el paso.
  for (let k = 0, placed = 0; placed < 48 && k < 2000; k++) {
    const { p, nx, nz } = frameAt(curve, rnd());
    const side = rnd() < 0.5 ? -1 : 1;
    const x = p.x + nx * side * (ROAD_HALF + 1.5);
    const z = p.z + nz * side * (ROAD_HALF + 1.5);
    if (distToTrack(x, z) < ROAD_HALF + 1.0 || !farFrom(x, z, avoid, 12)) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    [0.28, 0.83, 1.38].forEach((y) => {
      const t = new THREE.Mesh(tireGeo, tireMat);
      t.position.y = y;
      t.castShadow = true;
      g.add(t);
    });
    scene.add(g);
    obstacles.push({ x, z, r: 1.1, solid: true, group: g });
    placed++;
  }

  // Barriles negros a los lados de la pista: explotan al golpearlos.
  for (let k = 0, placed = 0; placed < 30 && k < 1500; k++) {
    const { p, nx, nz } = frameAt(curve, rnd());
    const side = rnd() < 0.5 ? -1 : 1;
    const x = p.x + nx * side * (ROAD_HALF + 2.5 + rnd() * 2.5);
    const z = p.z + nz * side * (ROAD_HALF + 2.5 + rnd() * 2.5);
    if (distToTrack(x, z) < ROAD_HALF + 0.9 || !farFrom(x, z, avoid, 12)) continue;
    // Lejos de cualquier objeto sólido, para que el auto nunca quede encajado entre ellos.
    if (obstacles.some((o) => o.solid && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + CAR_RADIUS + 3) ** 2)) continue;
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(x, 0.82, z);
    barrel.castShadow = true;
    barrel.rotation.z = rnd() * Math.PI;
    scene.add(barrel);
    obstacles.push({ x, z, r: 1.0, solid: false, drag: 0.45, group: barrel, kind: 'barrel', color: BARREL_COLOR });
    placed++;
  }

  // Cajas de madera sobre la pista: se rompen al pasar encima y frenan un poco.
  for (let k = 0; k < 16; k++) {
    const { p, nx, nz } = frameAt(curve, (k + 0.5) / 16);
    if (!farFrom(p.x, p.z, avoid, 16)) continue;
    for (const lat of [-1.5, 0, 1.5]) {
      const x = p.x + nx * lat;
      const z = p.z + nz * lat;
      const mesh = new THREE.Mesh(crateGeo, crateMat);
      mesh.position.set(x, 0.7, z);
      mesh.castShadow = true;
      scene.add(mesh);
      obstacles.push({ x, z, r: 0.95, solid: false, drag: 0.7, group: mesh, color: WOOD_COLOR });
    }
  }

  // Rampas sobre la pista: el auto salta al salir.
  const RAMP_LEN = 7;
  const RAMP_H = 1.6;
  const rampMat = new THREE.MeshStandardMaterial({ color: RAMP_COLOR, roughness: 0.8, side: THREE.DoubleSide });
  for (const u of [0.18, 0.33, 0.48, 0.62, 0.78]) {
    const { p, yaw } = frameAt(curve, u);
    if (!farFrom(p.x, p.z, avoid, 22)) continue;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(RAMP_LEN, 0);
    shape.lineTo(RAMP_LEN, RAMP_H);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: ROAD_HALF * 2, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2).translate(ROAD_HALF, 0, 0);
    const mesh = new THREE.Mesh(geo, rampMat);
    mesh.position.copy(p);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    ramps.push({ x: p.x, z: p.z, yaw, len: RAMP_LEN, h: RAMP_H });
  }

  // Cercas de granja en el lado externo de las curvas cerradas: postes sólidos (el auto rebota) y tres travesaños.
  const FENCE_OFFSET = ROAD_HALF + 3;
  const FENCE_GAP = 2.2;
  const FENCE_RAILS = [0.35, 0.75, 1.1];
  const L = curve.getLength();
  const postGeo = new THREE.BoxGeometry(0.4, 1.3, 0.4).translate(0, 0.65, 0);
  const fenceMat = new THREE.MeshStandardMaterial({ ...woodMaps(), roughness: 0.95 });
  let prevPost = null;
  for (let u = 0.03; u < 0.97; u += FENCE_GAP / L) {
    const turn = turnSine(curve, u);
    if (Math.abs(turn) < 0.6) {
      prevPost = null;
      continue;
    }
    const { p, nx, nz } = frameAt(curve, u);
    const side = -Math.sign(turn);
    const x = p.x + nx * side * FENCE_OFFSET;
    const z = p.z + nz * side * FENCE_OFFSET;
    const clear =
      inArena(x, z) &&
      distToTrack(x, z) > ROAD_HALF + 2.5 &&
      farFrom(x, z, avoid, 10) &&
      TUNNEL_U.every((tu) => Math.abs(u - tu) * L > 16) &&
      obstacles.every((o) => !o.solid || (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + 0.4 + CAR_RADIUS + 0.5) ** 2);
    if (!clear) {
      prevPost = null;
      continue;
    }
    const post = shadowed(new THREE.Mesh(postGeo, fenceMat));
    post.position.set(x, 0, z);
    scene.add(post);
    obstacles.push({ x, z, r: 0.4, solid: true, group: post });
    if (prevPost && prevPost.side === side) {
      const dx = x - prevPost.x;
      const dz = z - prevPost.z;
      const len = Math.hypot(dx, dz);
      for (const y of FENCE_RAILS) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, len), fenceMat);
        rail.position.set((x + prevPost.x) / 2, y, (z + prevPost.z) / 2);
        rail.rotation.y = Math.atan2(dx, dz);
        rail.castShadow = true;
        scene.add(rail);
      }
    }
    prevPost = { x, z, side };
  }

  return { obstacles, ramps };
}

// Altura del suelo en (x, z): sube por la rampa y cae al terminarla.
// Los cerros solapados usan la mayor altura, así no hay valles entre ellos.
export function heightAt(ramps, x, z) {
  let mound = 0;
  for (const r of ramps) {
    if (!r.mound) continue;
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < r.base) mound = Math.max(mound, r.h * Math.min(1, (r.base - d) / (r.base - r.top)));
  }
  for (const r of ramps) {
    if (r.mound) continue;
    const dx = x - r.x;
    const dz = z - r.z;
    const s = dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw);
    const lat = dx * Math.cos(r.yaw) - dz * Math.sin(r.yaw);
    if (r.deck) {
      const a = Math.abs(s);
      if (Math.abs(lat) <= r.w && a <= r.half + r.ramp) return Math.max(mound, r.h * Math.min(1, (r.half + r.ramp - a) / r.ramp));
      continue;
    }
    if (s >= 0 && s <= r.len && Math.abs(lat) <= ROAD_HALF) return Math.max(mound, (r.h * s) / r.len);
  }
  return mound;
}

// Partículas que salen al romper un obstáculo.
// Montañas lejanas fuera de la arena. Sin niebla, tintadas por el clima (ver updateWeather).
export function buildMountains(scene) {
  const rand = mulberry32(4242);
  const material = new THREE.MeshLambertMaterial({ color: 0x6e6496, flatShading: true, fog: false });
  const group = new THREE.Group();
  const count = 30;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.2;
    const r = 400 + rand() * 50;
    const h = 230 + rand() * 120;
    const base = 90 + rand() * 60;
    const geo = new THREE.ConeGeometry(base, h, 6 + Math.floor(rand() * 3), 1);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    mesh.rotation.y = rand() * Math.PI;
    group.add(mesh);
  }
  scene.add(group);
  return material;
}

export function createDebris(scene) {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const fireGeo = new THREE.SphereGeometry(0.2, 10, 12);
  const mats = new Map();
  const parts = [];
  const matFor = (color, emissiveBoost = 0) => {
    const key = `${color}:${emissiveBoost}`;
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: emissiveBoost,
        roughness: 0.9,
      }));
    }
    return mats.get(key);
  };
  const dropGeo = new THREE.SphereGeometry(0.16, 6, 5);
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.2, transparent: true, opacity: 0.7 });
  return {
    splash(x, y, z, dirX, dirZ) {
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(dropGeo, dropMat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        const side = 3 + Math.random() * 3;
        parts.push({
          mesh,
          vel: new THREE.Vector3(dirX * side + (Math.random() - 0.5) * 2, 3 + Math.random() * 3, dirZ * side + (Math.random() - 0.5) * 2),
          spin: new THREE.Vector3(0, 0, 0),
          life: 0.7 + Math.random() * 0.4,
          fire: false,
          drop: true,
        });
      }
    },
    // Cubo con logo: se parte en trozos que conservan su porción de la textura, así el logo y sus colores no se pierden.
    shatter(x, y, z, material, size = 4, n = 3) {
      const step = size / n;
      const half = (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          for (let k = 0; k < n; k++) {
            const ox = (i - half) * step;
            const oy = (j - half) * step;
            const oz = (k - half) * step;
            const shardGeo = new THREE.BoxGeometry(step * 0.96, step * 0.96, step * 0.96);
            const uv = shardGeo.attributes.uv;
            for (let v = 0; v < uv.count; v++) uv.setXY(v, (i + uv.getX(v)) / n, (j + uv.getY(v)) / n);
            const mesh = new THREE.Mesh(shardGeo, material);
            mesh.position.set(x + ox, y + oy, z + oz);
            mesh.castShadow = true;
            scene.add(mesh);
            const dist = Math.hypot(ox, oy, oz) || 1;
            const power = 6 + Math.random() * 6;
            parts.push({
              mesh,
              vel: new THREE.Vector3(
                (ox / dist) * power + (Math.random() - 0.5) * 2,
                (oy / dist) * power + 5 + Math.random() * 4,
                (oz / dist) * power + (Math.random() - 0.5) * 2
              ),
              spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
              life: 2.2 + Math.random() * 0.8,
              fire: false,
              own: true,
              shrink: true,
            });
          }
        }
      }
    },
    burst(x, y, z, color, count = 10, power = 8) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, matFor(color, color === 0xff8a2a ? 0.8 : 0.12));
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        scene.add(mesh);
        const a = Math.random() * Math.PI * 2;
        const v = power * (0.4 + Math.random() * 0.6);
        parts.push({
          mesh,
          vel: new THREE.Vector3(Math.cos(a) * v, 4 + Math.random() * 5, Math.sin(a) * v),
          spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
          life: 2.5 + Math.random(),
          fire: false,
        });
      }
    },
    fireBurst(x, y, z, color = 0xff8a2a, count = 18, power = 12) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(fireGeo, matFor(color, 1.4));
        mesh.scale.setScalar(0.7 + Math.random() * 1.2);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        scene.add(mesh);
        const a = Math.random() * Math.PI * 2;
        const v = power * (0.5 + Math.random() * 0.8);
        parts.push({
          mesh,
          vel: new THREE.Vector3(Math.cos(a) * v, 5 + Math.random() * 6, Math.sin(a) * v),
          spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
          life: 0.9 + Math.random() * 0.8,
          fire: true,
        });
      }
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.vel.y -= q.fire ? 20 * dt : 28 * dt;
        q.mesh.position.addScaledVector(q.vel, dt);
        if (q.drop) {
          // Las gotas no rebotan: se apagan al caer al agua.
          if (q.mesh.position.y < 0.2 || q.life <= 0) {
            scene.remove(q.mesh);
            parts.splice(i, 1);
            continue;
          }
          q.life -= dt;
          continue;
        }
        if (q.mesh.position.y < 0.25) {
          q.mesh.position.y = 0.25;
          q.vel.y *= -0.3;
          q.vel.x *= 0.7;
          q.vel.z *= 0.7;
        }
        q.mesh.rotation.x += q.spin.x * dt;
        q.mesh.rotation.y += q.spin.y * dt;
        q.mesh.rotation.z += q.spin.z * dt;
        if (q.fire) {
          const s = 1 + Math.sin((q.life * 10) * Math.PI) * 0.35;
          q.mesh.scale.setScalar(Math.max(0.1, s));
        }
        q.life -= dt;
        if (q.shrink) q.mesh.scale.setScalar(Math.min(1, Math.max(0.01, q.life / 0.5)));
        if (q.life <= 0) {
          scene.remove(q.mesh);
          if (q.own) q.mesh.geometry.dispose();
          parts.splice(i, 1);
        }
      }
    },
  };
}

// Choques del auto contra obstáculos. Modifica car (x, z, speed).
// Sólidos: empujan al auto y rebotan. Rompibles: se destruyen y frenan (drag).
// Las cajas de estación (kind 'station') además llaman onStation con su índice.
export function collideCar(car, obstacles, debris, onStation) {
  for (const o of obstacles) {
    if (o.alive === false) continue;
    const dx = car.x - o.x;
    const dz = car.z - o.z;
    const R = o.r + CAR_RADIUS;
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (o.solid) {
      const d = Math.sqrt(d2) || 1e-3;
      car.x = o.x + (dx / d) * R;
      car.z = o.z + (dz / d) * R;
      car.speed *= -0.3;
      continue;
    }
    o.alive = false;
    o.group.visible = false;
    car.speed *= o.drag ?? 1;
    if (o.kind === 'station') {
      debris.burst(o.x, 1, o.z, o.color, 18, 10);
      onStation(o.index);
    } else if (o.kind === 'barrel') {
      // Solo salta y se frena: no gira ni acelera al auto, así no queda encajado contra nada.
      car.vy = 18 + Math.abs(car.speed) * 0.7;
      car.y = Math.max(car.y, 0.9);
      debris.fireBurst(o.x, 1.3, o.z, 0xff8a2a, 20, 14);
      debris.burst(o.x, 1.2, o.z, 0xff8a2a, 18, 11);
    } else if (o.kind === 'social') {
      debris.shatter(o.x, o.y, o.z, o.group.material, 4, 3);
    } else {
      debris.burst(o.x, 0.6, o.z, o.color, 10, 7);
    }
  }
}
