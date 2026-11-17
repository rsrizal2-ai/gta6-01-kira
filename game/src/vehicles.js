// Cars for Porto Luna: parametric bodies, arcade driving physics, traffic
// that loops the blocks, parked cars to steal, and police cruisers.
import * as THREE from 'three';
import { CFG } from './config.js';

export const STYLES = {
  sedan: { top: 24, power: 1.0, len: 4.2, w: 1.9, cabin: 0.5 },
  coupe: { top: 28, power: 1.2, len: 4.0, w: 1.85, cabin: 0.42 },
  van: { top: 19, power: 0.8, len: 4.6, w: 2.0, cabin: 0.62 },
  taxi: { top: 24, power: 1.0, len: 4.2, w: 1.9, cabin: 0.5 },
  cruiser: { top: 27, power: 1.15, len: 4.3, w: 1.9, cabin: 0.5 },
  muscle: { top: 30, power: 1.35, len: 4.4, w: 1.95, cabin: 0.4 },
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x222528 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff8d8 });
const paintCache = new Map();
function paint(color) {
  if (!paintCache.has(color)) paintCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return paintCache.get(color);
}

export function makeCarMesh(style, color) {
  const s = STYLES[style];
  const g = new THREE.Group();
  const bodyMat = style === 'cruiser' ? paint(0xf0f0f0) : paint(color);
  const body = new THREE.Mesh(boxGeo, bodyMat);
  body.scale.set(s.w, 0.55, s.len);
  body.position.y = 0.58;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(boxGeo, style === 'cruiser' ? darkMat : glassMat);
  cabin.scale.set(s.w - 0.25, s.cabin, s.len * 0.45);
  cabin.position.set(0, 0.58 + 0.28 + s.cabin / 2, -s.len * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  const nose = new THREE.Mesh(boxGeo, bodyMat);
  nose.scale.set(s.w - 0.2, 0.3, 0.5);
  nose.position.set(0, 0.5, s.len / 2);
  g.add(nose);
  // Headlights and tail lights.
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(boxGeo, headMat);
    h.scale.set(0.32, 0.14, 0.06);
    h.position.set(side * (s.w / 2 - 0.3), 0.62, s.len / 2 + 0.02);
    g.add(h);
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x881111 });
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(boxGeo, brakeMat);
    t.scale.set(0.32, 0.14, 0.06);
    t.position.set(side * (s.w / 2 - 0.3), 0.62, -s.len / 2 - 0.02);
    g.add(t);
  }
  if (style === 'taxi') {
    const sign = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    sign.scale.set(0.7, 0.22, 0.3);
    sign.position.set(0, 1.45, -0.2);
    g.add(sign);
  }
  if (style === 'muscle') {
    const spoiler = new THREE.Mesh(boxGeo, darkMat);
    spoiler.scale.set(s.w - 0.3, 0.1, 0.4);
    spoiler.position.set(0, 0.95, -s.len / 2 + 0.2);
    g.add(spoiler);
  }
  let flashL = null, flashR = null;
  if (style === 'cruiser') {
    const bar = new THREE.Mesh(boxGeo, darkMat);
    bar.scale.set(1.2, 0.12, 0.4);
    bar.position.set(0, 1.42, -0.2);
    g.add(bar);
    flashL = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    flashL.scale.set(0.5, 0.18, 0.36);
    flashL.position.set(-0.32, 1.54, -0.2);
    g.add(flashL);
    flashR = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    flashR.scale.set(0.5, 0.18, 0.36);
    flashR.position.set(0.32, 1.54, -0.2);
    g.add(flashR);
    const stripe = new THREE.Mesh(boxGeo, darkMat);
    stripe.scale.set(s.w + 0.02, 0.2, s.len * 0.5);
    stripe.position.set(0, 0.62, 0);
    g.add(stripe);
  }
  // Wheels: steer pivots at the front, spin groups inside.
  const wheels = [];
  for (const [sx, sz, front] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (s.w / 2 - 0.1), 0.36, sz * (s.len / 2 - 0.8));
    const spin = new THREE.Group();
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    spin.add(w);
    pivot.add(spin);
    g.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  return { group: g, wheels, brakeMat, flashL, flashR, length: s.len, body, nose };
}

const tmpP = new THREE.Vector3();
export function createVehicles(scene, city, rng, effects, audio) {
  const cars = [];
  const lanes = [];
  for (let i = 0; i < CFG.blocks; i++) lanes.push(i);

  function spawnCar(style, color, x, z, heading, kind) {
    const mesh = makeCarMesh(style, color);
    mesh.group.position.set(x, 0, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);
    const car = {
      mesh, style, color, x, z, heading, speed: 0, steer: 0,
      health: CFG.car.maxHealth, kind, loop: null, loopD: 0, loopSpeed: 0,
      smokeT: 0, collideT: 0, dead: false, flashT: rng.next() * 2,
      cruiseSpeed: CFG.traffic.speed * rng.range(0.85, 1.15),
    };
    cars.push(car);
    return car;
  }

  function pickLoop() {
    const bx = rng.int(0, CFG.blocks - 2), bz = rng.int(0, CFG.blocks - 2);
    const x0 = CFG.roadAt(bx), x1 = CFG.roadAt(bx + 1);
    const z0 = CFG.roadAt(bz), z1 = CFG.roadAt(bz + 1);
    return { x0, x1, z0, z1, per: 2 * (x1 - x0 + z1 - z0), clockwise: rng.chance(0.5) };
  }
  function loopPoint(loop, d) {
    const w = loop.x1 - loop.x0, h = loop.z1 - loop.z0;
    const off = 2.3 * (loop.clockwise ? 1 : -1);
    let dd = ((d % loop.per) + loop.per) % loop.per;
    if (dd < w) return { x: loop.x0 + dd, z: loop.z0 + off, h: Math.PI / 2 };
    dd -= w;
    if (dd < h) return { x: loop.x1 - off, z: loop.z0 + dd, h: 0 };
    dd -= h;
    if (dd < w) return { x: loop.x1 - dd, z: loop.z1 - off, h: -Math.PI / 2 };
    dd -= w;
    return { x: loop.x0 + off, z: loop.z1 - dd, h: Math.PI };
  }

  function spawnTraffic() {
    for (let i = 0; i < CFG.traffic.count; i++) {
      const style = rng.pick(['sedan', 'sedan', 'coupe', 'van', 'taxi', 'muscle']);
      const color = style === 'taxi' ? 0xe8c81c : rng.pick(CFG.carPaint);
      const loop = pickLoop();
      const d = rng.range(0, loop.per);
      const p = loopPoint(loop, d);
      const car = spawnCar(style, color, p.x, p.z, p.h, 'traffic');
      car.loop = loop; car.loopD = d;
      car.speed = car.cruiseSpeed;
    }
  }

  function spawnParked() {
    // Curb parking along road edges, clear of intersections, plus lot rows.
    let placed = 0, tries = 0;
    while (placed < 16 && tries++ < 120) {
      const vertical = rng.chance(0.5);
      const road = CFG.roadAt(rng.int(0, CFG.blocks));
      const along = rng.range(-CFG.half + 20, CFG.half - 20);
      // Keep clear of crossings.
      let nearCross = false;
      for (let i = 0; i <= CFG.blocks; i++) if (Math.abs(along - CFG.roadAt(i)) < 9) nearCross = true;
      if (nearCross) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = vertical ? road + side * 4.4 : along;
      const z = vertical ? along : road + side * 4.4;
      const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const style = rng.pick(['sedan', 'sedan', 'coupe', 'van', 'muscle']);
      spawnCar(style, rng.pick(CFG.carPaint), x, z, heading, 'parked');
      placed++;
    }
  }

  function stepCar(car, throttle, steerInput, handbrake, dt) {
    const s = STYLES[car.style];
    if (car.dead) { throttle = 0; steerInput = 0; }
    if (throttle > 0) car.speed += CFG.car.accel * s.power * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed += CFG.car.brake * throttle * dt;
      else car.speed += CFG.car.accel * 0.55 * throttle * dt;
    }
    car.speed -= car.speed * CFG.car.drag * dt;
    car.speed -= Math.sign(car.speed) * CFG.car.rollDrag * dt * (handbrake ? 3 : 1);
    if (Math.abs(car.speed) < 0.06 && throttle === 0) car.speed = 0;
    car.speed = Math.max(-CFG.car.reverseMax, Math.min(s.top * (car.health < 30 ? 0.55 : 1), car.speed));
    car.steer += (steerInput - car.steer) * Math.min(1, 9 * dt);
    const authority = Math.min(1, Math.abs(car.speed) / 6);
    car.heading += car.steer * CFG.car.steer * authority * dt * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.45 : 1);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const impactSpeed = Math.abs(car.speed);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    // Two-circle body collision against the city.
    let hit = false;
    for (const off of [1.4, -1.4]) {
      tmpP.set(car.x + fx * off, 0, car.z + fz * off);
      const ox = tmpP.x, oz = tmpP.z;
      city.collideCircle(tmpP, 1.15);
      const dx = tmpP.x - ox, dz = tmpP.z - oz;
      if (dx !== 0 || dz !== 0) {
        car.x += dx; car.z += dz; hit = true;
      }
    }
    if (hit && car.collideT <= 0) {
      const dmg = Math.max(0, impactSpeed - CFG.car.damageSpeed) * 1.6;
      if (dmg > 0) {
        car.health -= dmg;
        audio.crash(impactSpeed);
        effects.burst(car.x + fx * 1.8, 0.8, car.z + fz * 1.8, { color: 0xffc860, count: 10, speed: 5, life: 0.5 });
        if (car.health <= 0) { car.health = 0; car.dead = true; }
      }
      car.speed *= 0.45;
      car.collideT = CFG.car.collideCooldown;
    }
    car.collideT -= dt;
  }

  function update(dt, player, playerCar, t) {
    for (const car of cars) {
      if (car.kind === 'traffic') {
        // Follow the loop; brake for the car ahead or the player.
        let want = car.cruiseSpeed;
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        for (const other of cars) {
          if (other === car) continue;
          const dx = other.x - car.x, dz = other.z - car.z;
          const ahead = dx * fx + dz * fz;
          const side = Math.abs(dx * fz - dz * fx);
          if (ahead > 0 && ahead < CFG.traffic.minGap + 3 && side < 2.4) {
            want = Math.min(want, Math.max(0, (ahead - 4) * 1.4));
          }
        }
        if (playerCar !== car && player) {
          const dx = player.x - car.x, dz = player.z - car.z;
          const ahead = dx * fx + dz * fz;
          const side = Math.abs(dx * fz - dz * fx);
          if (ahead > 0 && ahead < 9 && side < 2.2 && !player.inCar) want = 0;
        }
        car.speed += (want - car.speed) * Math.min(1, 2.2 * dt);
        car.loopD += car.speed * dt;
        const p = loopPoint(car.loop, car.loopD);
        car.x = p.x; car.z = p.z;
        // Ease into corners instead of snapping 90 degrees at once.
        let diff = p.h - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-4.5 * dt, Math.min(4.5 * dt, diff));
        car.heading += turn;
        // Keep traffic near the player: re-deal far loops close by.
        if (player) {
          const dx = car.x - player.x, dz = car.z - player.z;
          if (dx * dx + dz * dz > CFG.traffic.respawnDist ** 2) {
            car.loop = pickLoop();
            car.loopD = rng.range(0, car.loop.per);
          }
        }
      }
      // Car-car push-apart.
      for (const other of cars) {
        if (other === car) continue;
        const dx = car.x - other.x, dz = car.z - other.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 4.4 * 4.4 && d2 > 1e-4) {
          const d = Math.sqrt(d2), push = (4.4 - d) / 2;
          const nx = dx / d, nz = dz / d;
          car.x += nx * push; car.z += nz * push;
          if (car.kind === 'player' || other.kind === 'player') {
            const rel = Math.abs(car.speed - other.speed);
            if (rel > CFG.car.damageSpeed && car.collideT <= 0) {
              car.health -= (rel - CFG.car.damageSpeed) * 1.2;
              other.health -= (rel - CFG.car.damageSpeed) * 1.2;
              audio.crash(rel);
              car.collideT = CFG.car.collideCooldown;
              if (car.health <= 0) { car.health = 0; car.dead = true; }
              if (other.health <= 0) { other.health = 0; other.dead = true; }
            }
            car.speed *= 0.7; other.speed *= 0.7;
          }
        }
      }
      // Smoke when damaged; flashing light bar on cruisers.
      if (car.health < 55 && !car.dead) {
        car.smokeT -= dt;
        if (car.smokeT <= 0) {
          car.smokeT = car.health < 30 ? 0.05 : 0.16;
          effects.smoke(car.x + Math.sin(car.heading) * 1.8, 1.0, car.z + Math.cos(car.heading) * 1.8);
        }
      }
      if (car.style === 'cruiser' && car.mesh.flashL) {
        car.flashT += dt;
        const on = Math.sin(car.flashT * 9) > 0;
        car.mesh.flashL.visible = on;
        car.mesh.flashR.visible = !on;
      }
      // Sync mesh, wheels, brake lights.
      car.mesh.group.position.set(car.x, 0, car.z);
      car.mesh.group.rotation.y = car.heading;
      const spin = car.speed * dt / 0.36;
      for (const w of car.mesh.wheels) {
        w.spin.rotation.x += spin;
        if (w.front) w.pivot.rotation.y = car.steer * 0.45;
      }
      const braking = car.kind === 'player' && car.braking;
      car.mesh.brakeMat.color.setHex(braking ? 0xff2a2a : 0x881111);
    }
  }

  function nearestCar(x, z, range, kinds) {
    let best = null, bd = range * range;
    for (const car of cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const dx = car.x - x, dz = car.z - z, d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = car; }
    }
    return best;
  }

  function removeCar(car) {
    scene.remove(car.mesh.group);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  return { cars, spawnCar, spawnTraffic, spawnParked, stepCar, update, nearestCar, removeCar };
}
