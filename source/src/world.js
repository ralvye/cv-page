import * as THREE from 'three';

// Pista lineal de F1: de inicio a fin, con rectas, curvas cerradas y horquillas.
const TRACK_POINTS = [
  [0, 0], [0, 90], [30, 160], [110, 190], [170, 150], [190, 80], [240, 40], [280, -10],
  [250, -70], [190, -80], [150, -120], [80, -130], [20, -170], [-40, -160], [-100, -120],
  [-130, -60], [-90, -20], [-150, 20], [-200, -30], [-250, -10], [-270, 60], [-230, 130],
  [-180, 160], [-150, 230], [-90, 260], [-30, 240],
];

export const ROAD_HALF = 2.4;
export const ROAD_LIFT = 0.1;
export const ARENA_HALF = 340;
export const CAR_RADIUS = 1.4;

export function createTrack() {
  const points = TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
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

function frameAt(curve, u) {
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u);
  const l = Math.hypot(t.x, t.z);
  return { p, t, yaw: Math.atan2(t.x, t.z), nx: -t.z / l, nz: t.x / l };
}

// Posición y rumbo del auto en el punto u (0..1) de la pista.
export function poseAt(curve, u) {
  const { p, yaw } = frameAt(curve, u);
  return { x: p.x, z: p.z, yaw };
}

// Pasto: plano grande que se funde con la niebla morada.
function buildGround(scene) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 40, ARENA_HALF * 2 + 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2b4d25, roughness: 1 })
  );
  grass.receiveShadow = true;
  scene.add(grass);
}

// Cinta plana que sigue la pista entre los desplazamientos a y b (perpendiculares al eje).
function buildStrip(scene, curve, a, b, material, uRepeat = 1, lift = ROAD_LIFT) {
  const SEG = 1200;
  const pos = [];
  const uv = [];
  const index = [];
  let len = 0;
  let prev = null;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const p = curve.getPointAt(t);
    const { nx, nz } = frameAt(curve, t);
    if (prev) len += p.distanceTo(prev);
    prev = p;
    pos.push(p.x + nx * a, lift, p.z + nz * a, p.x + nx * b, lift, p.z + nz * b);
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
function kerbTexture() {
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
}

export function buildTrack(scene, curve) {
  buildGround(scene);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.7, side: THREE.DoubleSide });
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x3f4248, roughness: 0.9, side: THREE.DoubleSide });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, side: THREE.DoubleSide });
  buildStrip(scene, curve, -ROAD_HALF, ROAD_HALF, asphaltMat);
  buildStrip(scene, curve, ROAD_HALF - 0.6, ROAD_HALF, lineMat, 1, ROAD_LIFT + 0.04);
  buildStrip(scene, curve, -ROAD_HALF, -ROAD_HALF + 0.6, lineMat, 1, ROAD_LIFT + 0.04);
  buildStrip(scene, curve, ROAD_HALF, ROAD_HALF + 0.9, kerbMat, 4);
  buildStrip(scene, curve, -ROAD_HALF - 0.9, -ROAD_HALF, kerbMat, 4);
}

// Árboles, arbustos, llantas, cajas y rampas. Cada obstáculo es un círculo en el suelo.
// solid: bloquea al auto. Si no es sólido, se destruye al chocar (drag = freno al romperse).
const TREE_FOLIAGE = 0x1d4a26;
const BUSH_COLOR = 0x23501f;
const TRUNK_COLOR = 0x4a3524;
const WOOD_COLOR = 0x9c6b3a;
const TIRE_COLOR = 0x1b1b1d;
const RAMP_COLOR = 0x8a8f99;

export function buildScenery(scene, curve, avoid) {
  const rnd = mulberry32(20250);
  const between = (a, b) => a + (b - a) * rnd();
  const obstacles = [];
  const ramps = [];

  // Muestras de la pista para medir distancias (evita poner cosas sobre el asfalto).
  const SAMPLES = 2000;
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => curve.getPointAt(i / SAMPLES));
  const distToTrack = (x, z) => {
    let best = Infinity;
    for (const s of samples) {
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const inArena = (x, z) => Math.abs(x) < ARENA_HALF - 10 && Math.abs(z) < ARENA_HALF - 10;
  const farFrom = (x, z, pts, r) => pts.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r);

  const treeShared = {
    trunk: new THREE.CylinderGeometry(0.45, 0.65, 4, 8).translate(0, 2, 0),
    cone1: new THREE.ConeGeometry(3.6, 5, 9).translate(0, 5.2, 0),
    cone2: new THREE.ConeGeometry(2.8, 4.2, 9).translate(0, 7.6, 0),
    cone3: new THREE.ConeGeometry(2, 3.4, 9).translate(0, 9.6, 0),
    trunkMat: new THREE.MeshStandardMaterial({ color: TRUNK_COLOR, roughness: 1 }),
    foliageMat: new THREE.MeshStandardMaterial({ color: TREE_FOLIAGE, roughness: 1 }),
  };
  const bushGeo = new THREE.SphereGeometry(1.2, 8, 6).scale(1.1, 0.75, 1.1).translate(0, 0.6, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: BUSH_COLOR, roughness: 1 });
  const tireGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.55, 14);
  const tireMat = new THREE.MeshStandardMaterial({ color: TIRE_COLOR, roughness: 0.9 });
  const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const crateMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.9 });

  // Árboles grandes: fuera de la pista, bloquean el paso.
  for (let k = 0, placed = 0; placed < 170 && k < 3000; k++) {
    const { p, nx, nz } = frameAt(curve, rnd());
    const o = (rnd() < 0.5 ? -1 : 1) * between(ROAD_HALF + 4, ROAD_HALF + 60);
    const x = p.x + nx * o;
    const z = p.z + nz * o;
    if (!inArena(x, z) || distToTrack(x, z) < ROAD_HALF + 5 || !farFrom(x, z, avoid, 14)) continue;
    const s = between(0.9, 1.4);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = rnd() * Math.PI * 2;
    const trunk = new THREE.Mesh(treeShared.trunk, treeShared.trunkMat);
    const f1 = new THREE.Mesh(treeShared.cone1, treeShared.foliageMat);
    const f2 = new THREE.Mesh(treeShared.cone2, treeShared.foliageMat);
    const f3 = new THREE.Mesh(treeShared.cone3, treeShared.foliageMat);
    for (const m of [trunk, f1, f2, f3]) m.castShadow = true;
    g.add(trunk, f1, f2, f3);
    scene.add(g);
    obstacles.push({ x, z, r: 1.1 * s, solid: true, group: g });
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
    const mesh = new THREE.Mesh(bushGeo, bushMat);
    mesh.position.set(x, 0, z);
    mesh.scale.setScalar(s);
    scene.add(mesh);
    obstacles.push({ x, z, r: 1.1 * s, solid: false, drag: 0.92, group: mesh, color: BUSH_COLOR });
    placed++;
  }

  // Llantas apiladas en los bordes de la pista: bloquean el paso.
  for (let k = 0, placed = 0; placed < 36 && k < 2000; k++) {
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

  return { obstacles, ramps };
}

// Altura del suelo en (x, z): sube por la rampa y cae al terminarla.
export function heightAt(ramps, x, z) {
  for (const r of ramps) {
    const dx = x - r.x;
    const dz = z - r.z;
    const s = dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw);
    const lat = dx * Math.cos(r.yaw) - dz * Math.sin(r.yaw);
    if (s >= 0 && s <= r.len && Math.abs(lat) <= ROAD_HALF) return (r.h * s) / r.len;
  }
  return 0;
}

// Partículas que salen al romper un obstáculo.
export function createDebris(scene) {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mats = new Map();
  const parts = [];
  const matFor = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    return mats.get(color);
  };
  return {
    burst(x, y, z, color, count = 10, power = 8) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, matFor(color));
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
        });
      }
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.vel.y -= 28 * dt;
        q.mesh.position.addScaledVector(q.vel, dt);
        if (q.mesh.position.y < 0.25) {
          q.mesh.position.y = 0.25;
          q.vel.y *= -0.35;
          q.vel.x *= 0.7;
          q.vel.z *= 0.7;
        }
        q.mesh.rotation.x += q.spin.x * dt;
        q.mesh.rotation.y += q.spin.y * dt;
        q.mesh.rotation.z += q.spin.z * dt;
        q.life -= dt;
        if (q.life <= 0) {
          scene.remove(q.mesh);
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
    } else {
      debris.burst(o.x, 0.6, o.z, o.color, 10, 7);
    }
  }
}
