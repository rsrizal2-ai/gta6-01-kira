// Fists, the pistol, armed guards and cash drops for Porto Luna.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeHumanoid } from './characters.js';

const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14);
const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd94c });
const billGeo = new THREE.BoxGeometry(0.7, 0.08, 0.4);
const billMat = new THREE.MeshLambertMaterial({ color: 0x4a9a5a });

export function createCombat(scene, city, effects, audio) {
  const guards = [];
  const pickups = [];

  function makeGuard(x, z, heading, opts = {}) {
    const rig = makeHumanoid({
      shirt: opts.shirt || 0x5a2a2a, pants: 0x2c2c2c,
      skin: 0xd9a37a, hair: 0x111111, hat: opts.hat ?? null,
    });
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = heading;
    scene.add(rig.group);
    const guard = {
      rig, x, z, heading, health: CFG.combat.guardHealth,
      state: 'idle', shootT: 0, strafeDir: 1, strafeT: 0,
      dead: false, deadTime: 0, drop: opts.drop ?? 60, home: { x, z },
    };
    guards.push(guard);
    return guard;
  }

  function removeGuard(guard) {
    scene.remove(guard.rig.group);
    const i = guards.indexOf(guard);
    if (i >= 0) guards.splice(i, 1);
  }
  function clearGuards() { for (const g of [...guards]) removeGuard(g); }

  function spawnPickup(x, z, amount) {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2.4;
    coin.position.y = 0.8;
    g.add(coin);
    const bill = new THREE.Mesh(billGeo, billMat);
    bill.position.y = 0.15;
    bill.rotation.y = 0.6;
    g.add(bill);
    g.position.set(x, 0, z);
    scene.add(g);
    pickups.push({ mesh: g, x, z, amount, t: 0, life: 30 });
  }
  function clearPickups() {
    for (const pk of pickups) scene.remove(pk.mesh);
    pickups.length = 0;
  }

  // Melee: an arc in front of the attacker; hits characters and startles crowds.
  function punch(px, pz, heading, targets, onCrime) {
    let hitAny = false;
    for (const t of targets) {
      if (t.dead || t.state === 'down' || t.down) continue;
      const dx = t.x - px, dz = t.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > CFG.player.punchRange) continue;
      const ang = Math.abs(Math.atan2(dx, dz) - heading);
      if (ang > CFG.player.punchArc && ang < Math.PI * 2 - CFG.player.punchArc) continue;
      t.hit(CFG.player.punchDmg, px, pz);
      hitAny = true;
    }
    if (hitAny) { audio.punch(); onCrime && onCrime(px, pz); }
    return hitAny;
  }

  // Hitscan pistol: nearest character or car along the ray, walls block it.
  function shoot(origin, dir, characters, cars, onCrime) {
    const range = CFG.combat.pistolRange;
    let best = null, bestD = range;
    const end = { x: origin.x + dir.x * range, z: origin.z + dir.z * range };
    for (const c of characters) {
      if (c.dead || c.state === 'down' || c.down) continue;
      const dx = c.x - origin.x, dz = c.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0.5 || along > bestD) continue;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp > 0.75) continue;
      if (city.segmentBlocked(origin.x, origin.z, c.x, c.z)) continue;
      best = { kind: 'char', target: c, d: along };
      bestD = along;
    }
    for (const car of cars) {
      const dx = car.x - origin.x, dz = car.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0.5 || along > bestD) continue;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp > 2.0) continue;
      best = { kind: 'car', target: car, d: along };
      bestD = along;
    }
    // Walls stop the bullet even with no target: march the ray.
    let wallD = range;
    for (let d = 2; d < range; d += 2) {
      const q = { x: origin.x + dir.x * d, z: origin.z + dir.z * d };
      const before = { ...q };
      city.collideCircle(q, 0.05);
      if (q.x !== before.x || q.z !== before.z) { wallD = d; break; }
    }
    const hitD = Math.min(bestD, wallD);
    const hitPoint = new THREE.Vector3(origin.x + dir.x * hitD, origin.y, origin.z + dir.z * hitD);
    effects.tracer(new THREE.Vector3(origin.x, origin.y, origin.z), hitPoint);
    effects.burst(hitPoint.x, hitPoint.y, hitPoint.z, { color: 0xffc860, count: 5, speed: 3, life: 0.3 });
    audio.shot();
    effects.addShake(0.12);
    if (best && bestD <= wallD) {
      if (best.kind === 'char') best.target.hit(CFG.combat.pistolDmg, origin.x, origin.z);
      else {
        best.target.health -= CFG.combat.pistolDmg;
        if (best.target.health <= 0) { best.target.health = 0; best.target.dead = true; }
      }
    }
    onCrime && onCrime(origin.x, origin.z);
    return best;
  }

  function updateGuards(dt, player, onPlayerHit) {
    for (const g of guards) {
      if (g.dead) {
        g.deadTime += dt;
        g.rig.animate(dt, 0, false, true, g.deadTime);
        continue;
      }
      const dx = player.x - g.x, dz = player.z - g.z;
      const dist = Math.hypot(dx, dz);
      const los = dist < CFG.combat.guardRange + 8 && !city.segmentBlocked(g.x, g.z, player.x, player.z);
      if (g.state === 'idle') {
        if (los && dist < 18) g.state = 'chase';
        else {
          g.heading += dt * 0.25;
          g.rig.group.rotation.y = g.heading;
          g.rig.animate(dt, 0, false, false, 0);
          continue;
        }
      }
      g.heading = Math.atan2(dx, dz);
      let speed = 0;
      if (dist > 13) {
        speed = 3.6;
        g.x += (dx / dist) * speed * dt;
        g.z += (dz / dist) * speed * dt;
      } else {
        // Strafe slowly while shooting.
        g.strafeT -= dt;
        if (g.strafeT <= 0) { g.strafeDir *= -1; g.strafeT = 1.4; }
        const sx = Math.cos(g.heading) * g.strafeDir, sz = -Math.sin(g.heading) * g.strafeDir;
        g.x += sx * 1.2 * dt;
        g.z += sz * 1.2 * dt;
        speed = 1.2;
      }
      const tmp = { x: g.x, z: g.z };
      city.collideCircle(tmp, 0.5);
      g.x = tmp.x; g.z = tmp.z;
      g.shootT -= dt;
      if (g.shootT <= 0 && los && dist < CFG.combat.guardRange && !player.dead) {
        g.shootT = CFG.combat.guardCooldown * (0.9 + Math.random() * 0.4);
        const from = new THREE.Vector3(g.x, 1.4, g.z);
        const to = new THREE.Vector3(player.x, 1.2, player.z);
        effects.tracer(from, to);
        audio.shot();
        if (Math.random() < 0.55) onPlayerHit(CFG.combat.guardDmg, g.x, g.z);
      }
      g.rig.setAim(true);
      g.rig.group.position.set(g.x, 0, g.z);
      g.rig.group.rotation.y = g.heading;
      g.rig.animate(dt, speed, true, false, 0);
    }
  }

  function updatePickups(dt, player, onCollect) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.t += dt; pk.life -= dt;
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = Math.sin(pk.t * 3) * 0.08;
      if (pk.life <= 0) {
        scene.remove(pk.mesh);
        pickups.splice(i, 1);
        continue;
      }
      if (Math.hypot(pk.x - player.x, pk.z - player.z) < 1.7 && !player.inCar) {
        scene.remove(pk.mesh);
        pickups.splice(i, 1);
        onCollect(pk.amount);
      }
    }
  }

  return {
    guards, pickups, makeGuard, removeGuard, clearGuards,
    spawnPickup, clearPickups, punch, shoot, updateGuards, updatePickups,
  };
}
