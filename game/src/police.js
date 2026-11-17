// The Porto Luna PD: wanted stars, cruiser pursuit with line-of-sight
// sighting, foot cops who make busts, evasion, and the spray shop.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeHumanoid } from './characters.js';

export function createPolice(scene, city, vehicles, rng, effects, audio, hooks) {
  const cruisers = [];
  const cops = [];
  let wanted = 0;
  let evadeT = 0;
  let bustT = 0;
  let seen = false;
  let sprayT = 0;

  function setWanted(n, quiet) {
    const next = Math.max(0, Math.min(CFG.police.maxStars, n));
    if (next !== wanted) {
      wanted = next;
      evadeT = 0;
      if (!quiet && next > 0) hooks.onFeed(`Wanted level ${'★'.repeat(next)}`);
      if (next === 0) {
        for (const c of [...cruisers]) vehicles.removeCar(c);
        cruisers.length = 0;
        for (const c of cops) scene.remove(c.rig.group);
        cops.length = 0;
        bustT = 0;
      }
    }
  }
  function addWanted(n) { setWanted(wanted + n); }

  function spawnCruiser(player) {
    // On a road, ahead-ish of the player, at pursuit distance.
    const vertical = rng.chance(0.5);
    const road = CFG.roadAt(rng.int(0, CFG.blocks));
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = (vertical ? player.z : player.x) + dir * CFG.police.spawnRange;
    const x = vertical ? road : along;
    const z = vertical ? along : road;
    const car = vehicles.spawnCar('cruiser', 0, x, z, Math.atan2(player.x - x, player.z - z), 'cruiser');
    car.stuckT = 0; car.reverseT = 0;
    cruisers.push(car);
    return car;
  }
  function spawnCop(player) {
    const ang = rng.range(0, Math.PI * 2);
    const d = rng.range(16, 26);
    const rig = makeHumanoid({ shirt: 0x2a3a6a, pants: 0x222a3a, skin: rng.pick([0xd9a37a, 0xb87a4e, 0x8a5a34]), hair: 0x222222, hat: 0x1c2a4a });
    const x = player.x + Math.sin(ang) * d, z = player.z + Math.cos(ang) * d;
    rig.group.position.set(x, 0, z);
    scene.add(rig.group);
    const cop = { rig, x, z, heading: ang + Math.PI, speed: 0, down: false, downT: 0 };
    cops.push(cop);
    return cop;
  }

  function update(dt, player, cash, t) {
    sprayT -= dt;
    // Maintain pursuit force for the current wanted level.
    const wantCruisers = wanted === 0 ? 0 : Math.min(4, 1 + Math.floor(wanted / 2));
    while (cruisers.length < wantCruisers) spawnCruiser(player);
    while (cruisers.length > wantCruisers) vehicles.removeCar(cruisers.pop());
    const wantCops = wanted < 2 ? 0 : Math.min(3, wanted - 1);
    while (cops.filter((c) => !c.down).length < wantCops) spawnCop(player);
    while (cops.length > wantCops + 2) { const c = cops.pop(); scene.remove(c.rig.group); }

    seen = false;
    let nearestSiren = 1e9;
    for (const car of cruisers) {
      const dx = player.x - car.x, dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      nearestSiren = Math.min(nearestSiren, dist);
      if (dist < CFG.police.sightRange && !city.segmentBlocked(car.x, car.z, player.x, player.z)) seen = true;
      // Pursuit steering: aim at the player, reverse out of trouble.
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      let throttle = 1;
      if (car.reverseT > 0) { car.reverseT -= dt; throttle = -1; }
      else if (dist < CFG.police.chaseStop && !player.inCar) throttle = 0;
      else if (Math.abs(car.speed) < 1 && throttle > 0) {
        car.stuckT += dt;
        if (car.stuckT > 2.5) { car.reverseT = 0.9; car.stuckT = 0; }
      } else car.stuckT = 0;
      vehicles.stepCar(car, throttle, steer, false, dt);
      if (dist < 3.5 && player.inCar && Math.abs(car.speed) > CFG.police.ramSpeed) {
        effects.addShake(0.25);
      }
    }
    for (const cop of cops) {
      if (cop.down) {
        cop.downT += dt;
        cop.rig.animate(dt, 0, false, true, cop.downT);
        continue;
      }
      const dx = player.x - cop.x, dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist < CFG.police.sightRange && !city.segmentBlocked(cop.x, cop.z, player.x, player.z)) seen = true;
      if (dist > 2.2) {
        cop.heading = Math.atan2(dx / dist, dz / dist);
        cop.speed = CFG.police.copSpeed;
        cop.x += (dx / dist) * cop.speed * dt;
        cop.z += (dz / dist) * cop.speed * dt;
        const tmp = { x: cop.x, z: cop.z };
        city.collideCircle(tmp, 0.5);
        cop.x = tmp.x; cop.z = tmp.z;
      } else cop.speed = 0;
      cop.rig.group.position.set(cop.x, 0, cop.z);
      cop.rig.group.rotation.y = cop.heading;
      cop.rig.animate(dt, cop.speed, false, false, 0);
    }
    audio.setSiren(wanted > 0 ? Math.max(0, 1 - nearestSiren / 90) : 0);

    // Bust: a standing cop next to a slow player fills the bust meter.
    const playerSlow = player.speed < 1.5;
    const copClose = cops.some((c) => !c.down && Math.hypot(c.x - player.x, c.z - player.z) < CFG.police.bustRange);
    if (wanted > 0 && copClose && playerSlow && !player.dead) {
      bustT += dt;
      if (bustT >= CFG.police.bustTime) { bustT = 0; hooks.onBusted(); }
    } else bustT = Math.max(0, bustT - dt * 2);

    // Evasion: unseen for long enough, one star at a time.
    if (wanted > 0) {
      if (seen) evadeT = 0;
      else {
        evadeT += dt;
        if (evadeT >= CFG.police.evadeTime) {
          setWanted(wanted - 1, true);
          hooks.onFeed(wanted === 0 ? 'You lost them.' : 'The heat is cooling off…');
        }
      }
    }

    // Spray shop: drive in with heat and cash, leave clean with new paint.
    if (wanted > 0 && player.inCar && sprayT <= 0) {
      const s = city.places.spray;
      if (Math.hypot(player.x - s.x, player.z - s.z) < 7) {
        if (cash >= CFG.economy.sprayCost) {
          sprayT = 3;
          hooks.onSpray();
        } else {
          sprayT = 3;
          hooks.onFeed('Spray shop: $100. Not enough cash.');
          audio.denied();
        }
      }
    }
  }

  function repaint(car) {
    const color = rng.pick(CFG.carPaint);
    const mat = new THREE.MeshLambertMaterial({ color });
    car.mesh.body.material = mat;
    car.mesh.nose.material = mat;
    car.color = color;
  }

  function hitCop(cop) {
    if (cop.down) return;
    cop.down = true; cop.downT = 0;
    addWanted(1);
  }

  function reset() {
    setWanted(0, true);
    for (const c of cops) scene.remove(c.rig.group);
    cops.length = 0;
  }

  return {
    get wanted() { return wanted; },
    get seen() { return seen; },
    get bustProgress() { return bustT / CFG.police.bustTime; },
    cruisers, cops, addWanted, setWanted, update, repaint, hitCop, reset,
  };
}
