// Sidewalk crowds for Porto Luna: wandering pedestrians who flee from danger
// and report crimes they witness to the police.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeHumanoid } from './characters.js';

const BARKS = ['Help! Somebody call the cops!', 'Did you see that?!', 'Run!', 'My car! Hey!'];

export function createPedestrians(scene, city, rng, effects, audio, onWitness, onFeed) {
  const peds = [];
  const sidewalkAt = (i) => CFG.roadAt(i) + CFG.road / 2 + 2;

  function randomSidewalkPoint(nearX, nearZ, minDist) {
    for (let t = 0; t < 20; t++) {
      const vertical = rng.chance(0.5);
      const line = sidewalkAt(rng.int(0, CFG.blocks)) * (rng.chance(0.5) ? 1 : -1);
      const along = rng.range(-CFG.half + 10, CFG.half - 10);
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      if (minDist && Math.hypot(x - nearX, z - nearZ) < minDist) continue;
      return { x, z };
    }
    return { x: 0, z: 0 };
  }

  function spawnPed(x, z) {
    const rig = makeHumanoid({
      shirt: rng.pick(CFG.clothes), pants: rng.pick([0x2c3240, 0x4a3a28, 0x3a4a3a, 0x5a5a5a]),
      skin: rng.pick([0xd9a37a, 0xb87a4e, 0x8a5a34, 0xe8c09a]),
      hair: rng.pick([0x2a2018, 0x4a3020, 0x111111, 0x8a8a8a, 0xc2a23a]),
      hat: rng.chance(0.25) ? rng.pick(CFG.clothes) : null,
    });
    rig.group.position.set(x, 0, z);
    scene.add(rig.group);
    const ped = {
      rig, x, z, heading: rng.range(0, Math.PI * 2), speed: 0,
      state: 'walk', target: randomSidewalkPoint(x, z, 20), idleT: 0,
      fleeX: 0, fleeZ: 0, downT: 0, respawnT: 0, witnessT: -1, barked: false,
    };
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < CFG.peds.count; i++) {
    const pt = randomSidewalkPoint(0, 0, 0);
    spawnPed(pt.x, pt.z);
  }

  function scare(x, z, radius) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeX = x; ped.fleeZ = z;
        if (!ped.barked && d < radius * 0.6) {
          ped.barked = true;
          onFeed(rng.pick(BARKS));
        }
      }
    }
  }

  // A crime at (x, z): the nearest pedestrian with line of sight calls it in.
  function reportCrime(x, z, delay = 1.6) {
    let best = null, bd = CFG.peds.witnessRange ** 2;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - x, dz = ped.z - z, d2 = dx * dx + dz * dz;
      if (d2 < bd && !city.segmentBlocked(ped.x, ped.z, x, z)) { bd = d2; best = ped; }
    }
    if (best && best.witnessT < 0) {
      best.witnessT = delay;
      best.state = 'flee'; best.fleeX = x; best.fleeZ = z;
    }
  }

  function hit(ped, dmg, fromX, fromZ) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = 0;
    ped.respawnT = 8;
    effects.burst(ped.x, 1.2, ped.z, { color: 0xc23b2e, count: 8, speed: 3, life: 0.4 });
    audio.punch();
    scare(ped.x, ped.z, 18);
  }

  function update(dt, playerX, playerZ) {
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.downT += dt;
        ped.rig.animate(dt, 0, false, true, ped.downT);
        ped.respawnT -= dt;
        if (ped.respawnT <= 0) {
          const pt = randomSidewalkPoint(playerX, playerZ, 60);
          ped.x = pt.x; ped.z = pt.z;
          ped.state = 'walk';
          ped.target = randomSidewalkPoint(pt.x, pt.z, 20);
          ped.rig.group.rotation.x = 0;
          ped.rig.group.position.y = 0;
          ped.barked = false;
          ped.witnessT = -1;
        }
        continue;
      }
      if (ped.witnessT >= 0) {
        ped.witnessT -= dt;
        if (ped.witnessT < 0) {
          onWitness();
          onFeed('A witness called the police!');
        }
      }
      if (ped.state === 'idle') {
        ped.idleT -= dt;
        ped.speed = 0;
        if (ped.idleT <= 0) {
          ped.state = 'walk';
          ped.target = randomSidewalkPoint(ped.x, ped.z, 20);
        }
      } else if (ped.state === 'flee') {
        const dx = ped.x - ped.fleeX, dz = ped.z - ped.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.speed = CFG.peds.flee;
        ped.x += (dx / d) * ped.speed * dt;
        ped.z += (dz / d) * ped.speed * dt;
        if (d > 45) { ped.state = 'idle'; ped.idleT = rng.range(1, 3); }
      } else {
        const dx = ped.target.x - ped.x, dz = ped.target.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          ped.state = 'idle';
          ped.idleT = rng.range(0.5, 4);
          ped.speed = 0;
        } else {
          ped.heading = Math.atan2(dx / d, dz / d);
          ped.speed = CFG.peds.walk;
          ped.x += (dx / d) * ped.speed * dt;
          ped.z += (dz / d) * ped.speed * dt;
        }
      }
      const tmp = { x: ped.x, z: ped.z };
      city.collideCircle(tmp, 0.45);
      ped.x = tmp.x; ped.z = tmp.z;
      ped.rig.group.position.set(ped.x, 0, ped.z);
      ped.rig.group.rotation.y = ped.heading;
      ped.rig.animate(dt, ped.speed, false, false, 0);
    }
  }

  return { peds, update, scare, reportCrime, hit };
}
