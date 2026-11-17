// Mia Torres on foot and behind the wheel: walking, sprinting, jumping,
// stealing and driving cars, and taking damage.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeHumanoid } from './characters.js';

export function createPlayer(scene, city, vehicles, effects, audio) {
  const rig = makeHumanoid({ shirt: 0x2a9a8a, pants: 0x2c3240, skin: 0xc98a5a, hair: 0x1c1410, hat: 0x222528 });
  scene.add(rig.group);
  const start = city.places.garage;
  const p = {
    x: start.x, z: start.z, y: 0, vy: 0, heading: Math.PI,
    health: CFG.player.health, speed: 0, inCar: null, grounded: true,
    punchT: 0, hurtT: 0, dead: false, deadTime: 0, walkPhase: 0,
  };

  function enterCar(car) {
    p.inCar = car;
    car.kind = 'player';
    rig.group.visible = false;
    audio.click();
  }
  function exitCar() {
    const car = p.inCar;
    if (!car) return;
    car.kind = 'parked';
    const side = car.heading + Math.PI / 2;
    p.x = car.x + Math.sin(side) * 2.2;
    p.z = car.z + Math.cos(side) * 2.2;
    city.collideCircle(p, CFG.player.radius);
    p.y = 0; p.vy = 0;
    p.heading = car.heading;
    p.inCar = null;
    rig.group.visible = true;
  }

  function damage(amount, fromX, fromZ) {
    if (p.dead) return;
    p.health -= amount;
    p.hurtT = 0.4;
    effects.burst(p.x, 1.2, p.z, { color: 0xc23b2e, count: 8, speed: 3, life: 0.4 });
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      p.deadTime = 0;
      if (p.inCar) { p.inCar.kind = 'parked'; p.inCar = null; rig.group.visible = true; }
    }
  }
  function heal(amount) { p.health = Math.min(CFG.player.health, p.health + amount); }
  function respawn(place) {
    p.x = place.x; p.z = place.z; p.y = 0; p.vy = 0;
    p.health = CFG.player.health; p.dead = false; p.deadTime = 0;
    p.inCar = null; rig.group.visible = true;
  }

  // On-foot step: camera-relative movement, jump, gravity, collision.
  function stepOnFoot(dt, input, camYaw) {
    if (p.dead) { p.deadTime += dt; rig.animate(dt, 0, false, true, p.deadTime); return; }
    const fwd = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    const strafe = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const maxSpeed = sprint ? CFG.player.sprint : CFG.player.walk;
    let mx = 0, mz = 0;
    if (fwd !== 0 || strafe !== 0) {
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      mx = sin * fwd + cos * strafe;
      mz = cos * fwd - sin * strafe;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      p.heading = Math.atan2(mx, mz);
    }
    const tx = mx * maxSpeed, tz = mz * maxSpeed;
    p.vx = (p.vx || 0) + (tx - (p.vx || 0)) * Math.min(1, CFG.player.accel * dt / Math.max(1, maxSpeed));
    p.vz = (p.vz || 0) + (tz - (p.vz || 0)) * Math.min(1, CFG.player.accel * dt / Math.max(1, maxSpeed));
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    city.collideCircle(p, CFG.player.radius);
    p.speed = Math.hypot(p.vx, p.vz);
    if (input.wasPressed('Space') && p.grounded) {
      p.vy = CFG.player.jump;
      p.grounded = false;
    }
    p.vy -= CFG.player.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
    p.punchT -= dt;
    p.hurtT -= dt;
    rig.group.position.set(p.x, p.y, p.z);
    rig.group.rotation.y = p.heading;
    rig.animate(dt, p.speed, false, false, 0);
  }

  function stepDriving(dt, input) {
    const car = p.inCar;
    const throttle = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    const steer = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const handbrake = input.isDown('Space');
    car.braking = throttle < 0 && car.speed > 0.5;
    vehicles.stepCar(car, Math.max(-1, Math.min(1, throttle)), steer, handbrake, dt);
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    p.speed = Math.abs(car.speed);
    p.hurtT -= dt;
    if (handbrake && Math.abs(car.speed) > 6 && Math.random() < 0.5) {
      effects.smoke(car.x - Math.sin(car.heading) * 1.6, 0.3, car.z - Math.cos(car.heading) * 1.6, 0xd8d8d8);
    }
    if (input.wasPressed('KeyH')) audio.horn();
  }

  function update(dt, input, camYaw) {
    if (p.inCar) stepDriving(dt, input);
    else stepOnFoot(dt, input, camYaw);
  }

  return {
    state: p, rig, enterCar, exitCar, damage, heal, respawn, update,
    get pos() { return new THREE.Vector3(p.x, p.y, p.z); },
  };
}
