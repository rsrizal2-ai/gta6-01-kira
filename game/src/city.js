// Porto Luna's city: a seeded procedural grid with a beach, a pier, a park,
// a plaza and seven landmark buildings, built from shared canvas textures.
// It also owns collision (AABB colliders) and line-of-sight tests.
import * as THREE from 'three';
import { CFG } from './config.js';

function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function facadeTexture(base, rng) {
  return canvasTex(128, (g, s) => {
    g.fillStyle = `#${base.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, s, s);
    const cols = 4, rows = 6, ww = s / cols, wh = s / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.28);
      g.fillStyle = lit ? '#ffe9a8' : '#2c3a48';
      g.fillRect(x * ww + ww * 0.22, y * wh + wh * 0.25, ww * 0.56, wh * 0.5);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x * ww + ww * 0.22, y * wh + wh * 0.25, ww * 0.56, 3);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, s, 4);
  }, 1, 2);
}

function signTexture(text, bg, fg, sub) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, s - 16, s - 16);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${text.length > 12 ? 30 : 40}px system-ui, sans-serif`;
    g.fillText(text, s / 2, sub ? s / 2 - 18 : s / 2);
    if (sub) { g.font = '22px system-ui, sans-serif'; g.fillText(sub, s / 2, s / 2 + 34); }
  });
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const coneGeo = new THREE.ConeGeometry(1, 1, 8);
const sphGeo = new THREE.SphereGeometry(1, 10, 8);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.map ? 't' : ''}|${opts.emissive || ''}|${opts.transparent || ''}|${opts.opacity || ''}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
function box(parent, w, h, d, x, y, z, material, shadow = true) {
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}

export function buildCity(scene, rng, lowfx) {
  const C = CFG.colors;
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const addCollider = (x, z, hw, hd) => colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });

  // Sky, light, fog.
  scene.background = new THREE.Color(C.sky);
  scene.fog = new THREE.Fog(C.fog, 260, 520);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(C.sun, 1.9);
  sun.position.set(120, 180, 60);
  sun.castShadow = !lowfx;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun); scene.add(sun.target);

  // Ground layers: grass apron, asphalt city floor, sand, water.
  const half = CFG.half;
  const ground = new THREE.Mesh(planeGeo, mat(C.ground));
  ground.rotation.x = -Math.PI / 2; ground.scale.set(900, 900, 1);
  ground.position.y = -0.06; ground.receiveShadow = true; group.add(ground);
  const asphalt = new THREE.Mesh(planeGeo, mat(C.road));
  asphalt.rotation.x = -Math.PI / 2; asphalt.scale.set(half * 2, half * 2, 1);
  asphalt.position.y = 0; asphalt.receiveShadow = true; group.add(asphalt);
  const sand = new THREE.Mesh(planeGeo, mat(C.sand));
  sand.rotation.x = -Math.PI / 2; sand.scale.set(560, 26, 1);
  sand.position.set(0, 0.02, half + 13); sand.receiveShadow = true; group.add(sand);
  const waterMat = new THREE.MeshPhongMaterial({ color: C.water, transparent: true, opacity: 0.82, shininess: 90 });
  const water = new THREE.Mesh(planeGeo, waterMat);
  water.rotation.x = -Math.PI / 2; water.scale.set(900, 260, 1);
  water.position.set(0, -0.25, half + 26 + 130); group.add(water);

  // Road markings: dashed centre lines on every road.
  const dashMat = mat(0xe8d44c);
  const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 3);
  for (let i = 0; i <= CFG.blocks; i++) {
    const at = CFG.roadAt(i);
    for (let d = -half + 8; d < half - 8; d += 8) {
      const a = new THREE.Mesh(dashGeo, dashMat); a.position.set(at, 0.03, d); group.add(a);
      const b = new THREE.Mesh(dashGeo, dashMat); b.rotation.y = Math.PI / 2; b.position.set(d, 0.03, at); group.add(b);
    }
  }

  // Facade variants shared by all buildings.
  const facadeMats = CFG.facades.slice(0, 4).map((c) =>
    new THREE.MeshLambertMaterial({ map: facadeTexture(c, rng) }));
  const roofMat = mat(0x55504a);
  const walkMat = new THREE.MeshLambertMaterial({
    map: canvasTex(128, (g, s) => {
      g.fillStyle = '#b8b2a4'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, s); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(s, i * 32); g.stroke(); }
    }, 4, 4),
  });

  // Special blocks: plaza, park, garage, spray, hotel, lot, warehouse, office,
  // hospital, police. Everything else is a normal block with 1-2 buildings.
  const special = {
    '4,4': 'plaza', '1,5': 'park', '1,2': 'garage', '1,3': 'spray',
    '6,6': 'hotel', '0,2': 'lot', '0,0': 'warehouse', '5,3': 'office',
    '6,1': 'hospital', '3,5': 'police',
  };
  const places = {};
  const put = (name, x, z) => { places[name] = new THREE.Vector3(x, 0, z); };

  function building(cx, cz, w, d, h, matIdx, sign) {
    const m = box(group, w, h, d, cx, h / 2 + 0.15, cz, facadeMats[matIdx % facadeMats.length]);
    box(group, w + 0.8, 0.5, d + 0.8, cx, h + 0.35, cz, roofMat);
    if (rng.chance(0.6)) box(group, 2.2, 1.2, 2.2, cx + w * 0.22, h + 1.1, cz - d * 0.2, roofMat);
    if (sign) {
      const s = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ map: sign }));
      s.scale.set(Math.min(w * 0.8, 14), 2.2, 0.4);
      s.position.set(cx, h * 0.78, cz + d / 2 + 0.3);
      group.add(s);
    }
    addCollider(cx, cz, w / 2, d / 2);
    return m;
  }

  function tree(x, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, 0.15, z);
    const trunk = new THREE.Mesh(cylGeo, mat(0x6a4a2c));
    trunk.scale.set(0.25 * s, 2.4 * s, 0.25 * s); trunk.position.y = 1.2 * s; trunk.castShadow = true; g.add(trunk);
    const top = new THREE.Mesh(sphGeo, mat(0x4a8a3c));
    top.scale.setScalar(1.9 * s); top.position.y = 3.4 * s; top.castShadow = true; g.add(top);
    group.add(g); addCollider(x, z, 0.4, 0.4);
  }
  function palm(x, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(cylGeo, mat(0x7a5a38));
    trunk.scale.set(0.22 * s, 5.5 * s, 0.22 * s); trunk.position.y = 2.75 * s;
    trunk.rotation.z = 0.08; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(boxGeo, mat(0x3f8a44));
      f.scale.set(2.6 * s, 0.12, 0.5 * s);
      f.position.set(Math.cos(i) * 1.1 * s, 5.5 * s, Math.sin(i) * 1.1 * s);
      f.rotation.y = i; f.rotation.z = -0.35; f.castShadow = true; g.add(f);
    }
    group.add(g); addCollider(x, z, 0.35, 0.35);
  }
  function lamp(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const pole = new THREE.Mesh(cylGeo, mat(0x333333));
    pole.scale.set(0.12, 4.6, 0.12); pole.position.y = 2.3; g.add(pole);
    const head = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    head.scale.setScalar(0.28); head.position.y = 4.7; g.add(head);
    group.add(g); addCollider(x, z, 0.25, 0.25);
  }
  function bench(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0.15, z); g.rotation.y = ry;
    box(g, 2.2, 0.12, 0.6, 0, 0.5, 0, mat(0x8a5a30));
    box(g, 2.2, 0.5, 0.12, 0, 0.85, -0.28, mat(0x8a5a30));
    box(g, 0.12, 0.5, 0.5, -0.9, 0.25, 0, mat(0x444444));
    box(g, 0.12, 0.5, 0.5, 0.9, 0.25, 0, mat(0x444444));
    group.add(g); addCollider(x, z, 1.1, 0.4);
  }
  function billboard(x, z, ry, text, sub, bg, fg) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const pole = new THREE.Mesh(cylGeo, mat(0x555555));
    pole.scale.set(0.3, 6, 0.3); pole.position.y = 3; pole.castShadow = true; g.add(pole);
    const board = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, sub) }));
    board.scale.set(10, 5, 0.4); board.position.y = 8.2; board.castShadow = true; g.add(board);
    group.add(g); addCollider(x, z, 0.5, 0.5);
  }

  for (let bx = 0; bx < CFG.blocks; bx++) for (let bz = 0; bz < CFG.blocks; bz++) {
    const cx = CFG.blockCenter(bx), cz = CFG.blockCenter(bz);
    const kind = special[`${bx},${bz}`];
    // Sidewalk pad.
    const pad = box(group, CFG.block, 0.15, CFG.block, cx, 0.07, cz, walkMat, false);
    pad.receiveShadow = true;
    if (kind === 'plaza') {
      const basin = new THREE.Mesh(cylGeo, mat(0xd8d0c0));
      basin.scale.set(4, 1, 4); basin.position.set(cx, 0.6, cz); basin.castShadow = true; group.add(basin);
      const col = new THREE.Mesh(cylGeo, mat(0xc8c0b0));
      col.scale.set(0.5, 2.4, 0.5); col.position.set(cx, 1.6, cz); group.add(col);
      const drop = new THREE.Mesh(cylGeo, new THREE.MeshPhongMaterial({ color: C.water, transparent: true, opacity: 0.8 }));
      drop.scale.set(3.4, 0.3, 3.4); drop.position.set(cx, 1.05, cz); group.add(drop);
      addCollider(cx, cz, 4.2, 4.2);
      bench(cx - 7, cz - 7, Math.PI / 4); bench(cx + 7, cz + 7, Math.PI / 4);
      tree(cx - 12, cz + 11); tree(cx + 12, cz - 11);
      put('plaza', cx + 8, cz);
    } else if (kind === 'park') {
      const lawn = new THREE.Mesh(planeGeo, mat(C.grass));
      lawn.rotation.x = -Math.PI / 2; lawn.scale.set(CFG.block - 4, CFG.block - 4, 1);
      lawn.position.set(cx, 0.17, cz); lawn.receiveShadow = true; group.add(lawn);
      for (let i = 0; i < 7; i++) tree(cx + rng.range(-13, 13), cz + rng.range(-13, 13), rng.range(0.8, 1.3));
      bench(cx, cz - 6, 0); bench(cx + 5, cz + 8, 2.2);
      put('park', cx, cz);
    } else if (kind === 'garage') {
      building(cx - 4, cz - 6, 20, 12, 6, 1, signTexture('LUNA GARAGE', '#23405a', '#ffd94c', 'Eddie Kwan · Repairs'));
      // Open lot in front of the garage, inside the block.
      put('garage', cx + 8, cz + 8);
      put('garageDoor', cx - 4, cz + 1);
    } else if (kind === 'spray') {
      building(cx, cz - 8, 16, 10, 5, 2, signTexture('SPRAY SHOP', '#5a2323', '#ffffff', 'New paint · No questions'));
      put('spray', cx, cz + 6);
    } else if (kind === 'hotel') {
      building(cx, cz, 18, 16, 34, 0, signTexture('HOTEL MIRAMAR', '#2a4a6a', '#ffe9a8', 'Ocean View Rooms'));
      put('hotel', cx, cz + 12);
    } else if (kind === 'lot') {
      // Fenced repo lot: low wall segments and a hut.
      const wallMat = mat(0x8a8578);
      for (let i = -2; i <= 2; i++) {
        box(group, 5, 1.6, 0.5, cx + i * 6, 0.9, cz - 14, wallMat);
        box(group, 5, 1.6, 0.5, cx + i * 6, 0.9, cz + 14, wallMat);
      }
      box(group, 0.5, 1.6, 28, cx - 15, 0.9, cz, wallMat);
      addCollider(cx, cz - 14, 15, 0.4); addCollider(cx, cz + 14, 15, 0.4); addCollider(cx - 15, cz, 0.4, 14);
      building(cx - 10, cz - 9, 8, 6, 4, 3, null);
      put('lot', cx + 4, cz + 2);
    } else if (kind === 'warehouse') {
      building(cx, cz, 26, 20, 9, 5, signTexture('WAREHOUSE 9', '#3a3a3a', '#ffb84c', 'Moonstone Imports'));
      for (let i = 0; i < 4; i++) {
        const kx = cx - 12 + i * 4, kz = cz + 13;
        box(group, 2.4, 2.4, 2.4, kx, 1.35, kz, mat(0xa8803c));
        addCollider(kx, kz, 1.3, 1.3);
      }
      put('warehouse', cx + 4, cz + 14);
      put('warehouseDoor', cx, cz + 10.5);
    } else if (kind === 'office') {
      building(cx, cz, 16, 14, 24, 2, signTexture('MERIDIAN OFFICES', '#40485a', '#ffffff', 'Suite 400 · Vulture Holdings'));
      put('office', cx, cz + 11);
    } else if (kind === 'hospital') {
      building(cx, cz, 20, 14, 12, 6, signTexture('GENERAL HOSPITAL', '#f0f0f0', '#c23b2e', 'Emergency'));
      put('hospital', cx, cz + 11);
    } else if (kind === 'police') {
      building(cx, cz, 18, 14, 10, 2, signTexture('POLICE', '#2a3a5a', '#ffffff', 'Porto Luna PD'));
      put('police', cx, cz + 11);
    } else {
      // Normal block: one or two buildings plus a corner tree.
      const downtown = bx >= 3 && bx <= 5 && bz >= 2 && bz <= 4;
      const h1 = downtown ? rng.range(18, 42) : rng.range(7, 18);
      building(cx - 6, cz - 4, rng.range(13, 17), rng.range(12, 16), h1, rng.int(0, 3));
      if (rng.chance(0.75)) {
        building(cx + 8, cz + 7, rng.range(9, 13), rng.range(9, 12), downtown ? rng.range(12, 26) : rng.range(6, 12), rng.int(0, 3));
      }
      if (rng.chance(0.5)) tree(cx + 12, cz - 11, 0.9);
    }
  }

  // Boardwalk, pier and beach dressing along the south edge.
  const walk = box(group, 340, 0.2, 6, 0, 0.1, half + 4, mat(0x9a7a4c), false);
  walk.receiveShadow = true;
  for (let x = -160; x <= 160; x += 32) palm(x + rng.range(-4, 4), half + 9, rng.range(0.9, 1.2));
  for (let x = -150; x <= 150; x += 50) bench(x, half + 4, 0);
  // Pier at x = 69: planks out over the water.
  const pierX = 69;
  for (let z = half + 6; z <= half + 58; z += 4) {
    box(group, 6, 0.3, 4, pierX, 0.5, z, mat(0x8a6a42));
    if ((z / 4) % 3 === 0) {
      const p1 = new THREE.Mesh(cylGeo, mat(0x5a4630));
      p1.scale.set(0.3, 2.4, 0.3); p1.position.set(pierX - 2.6, -0.4, z); group.add(p1);
      const p2 = p1.clone(); p2.position.x = pierX + 2.6; group.add(p2);
    }
  }
  box(group, 12, 0.4, 10, pierX, 0.5, half + 62, mat(0x8a6a42));
  lamp(pierX - 4, half + 58); lamp(pierX + 4, half + 58);
  put('pier', pierX, half + 60);
  put('beach', -120, half + 12);

  // Lamps on road corners, billboards, north hills backdrop.
  for (let i = 0; i <= CFG.blocks; i += 2) {
    lamp(CFG.roadAt(i) + 7, CFG.roadAt(1) + 7);
    lamp(CFG.roadAt(i) - 7, CFG.roadAt(6) - 7);
  }
  billboard(-46, -161, 0.4, 'VISIT PORTO LUNA', 'Sun · Sea · Second Chances', '#1c5a8a', '#ffffff');
  billboard(115, 23, -0.5, 'MOONSTONE IMPORTS', 'We move anything', '#222222', '#ffd94c');
  for (let i = 0; i < 5; i++) {
    const hill = new THREE.Mesh(coneGeo, mat(0x5a7a4a));
    const hx = -260 + i * 130;
    hill.scale.set(90, 55, 70); hill.position.set(hx, 12, -half - 60);
    group.add(hill);
  }
  // Lighthouse on the east headland.
  const lh = new THREE.Group(); lh.position.set(half + 26, 0, -half + 30);
  const tower = new THREE.Mesh(cylGeo, mat(0xf0ead8));
  tower.scale.set(3, 22, 3); tower.position.y = 11; tower.castShadow = true; lh.add(tower);
  const topRoom = new THREE.Mesh(cylGeo, mat(0xc23b2e));
  topRoom.scale.set(3.6, 3, 3.6); topRoom.position.y = 23; lh.add(topRoom);
  const lampBall = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  lampBall.scale.setScalar(1.6); lampBall.position.y = 25.5; lh.add(lampBall);
  group.add(lh);
  addCollider(half + 26, -half + 30, 3.5, 3.5);
  put('lighthouse', half + 26, -half + 34);

  // World bounds + water line (gap at the pier corridor).
  addCollider(0, -half - 8, half + 30, 4);
  addCollider(-half - 8, 0, 4, half + 30);
  addCollider(half + 8, 0, 4, half + 30);
  addCollider(-half / 2 - 20, half + 24, half / 2, 3);
  addCollider(half / 2 + 60, half + 24, half / 2, 3);
  addCollider(pierX, half + 68, 8, 2);

  // Charm spots: ten reachable places across the city.
  const charmSpots = [
    [pierX, half + 60], [-23 + 8, 23], [23, 69], [-115, 69 + 6], [-161 + 4, -69 + 2],
    [-120, half + 12], [115, 115 + 12], [0, -184 + 4], [161, -23], [-69, -115],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  function collideCircle(p, r) {
    for (const c of colliders) {
      const nx = Math.max(c.x0, Math.min(p.x, c.x1));
      const nz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest overlap.
        const pushes = [
          [c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0],
          [0, c.z0 - r - p.z], [0, c.z1 + r - p.z],
        ];
        pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += pushes[0][0]; p.z += pushes[0][1];
      }
    }
    return p;
  }

  function segmentBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const c of colliders) {
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < c.x0 || ax > c.x1) continue; }
      else {
        let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az < c.z0 || az > c.z1) continue; }
      else {
        let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      return true;
    }
    return false;
  }

  return {
    colliders, places, charmSpots, sun,
    collideCircle, segmentBlocked,
    update(dt, t) {
      water.position.y = -0.25 + Math.sin(t * 0.7) * 0.06;
    },
  };
}
