// Porto Luna — boot, the fixed-step loop, the third-person camera, screens,
// combat wiring, crime reporting, wasted/busted flows and saving.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeRng, hashSeed } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createVehicles } from './vehicles.js';
import { createPlayer } from './player.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const lowfx = params.get('lowfx') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CFG.seedDefault;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowfx ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowfx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 900);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const rng = makeRng(hashSeed(`porto-luna-${seed}`));
const input = createInput(canvas);
const audio = createAudio();
const effects = createEffects(scene);
const city = buildCity(scene, rng, lowfx);
const vehicles = createVehicles(scene, city, rng, effects, audio);
vehicles.spawnTraffic();
vehicles.spawnParked();
const player = createPlayer(scene, city, vehicles, effects, audio);
const hud = createHud(city);

// Shared game state.
const G = {
  cash: CFG.economy.startCash, weapon: 'fists', ammo: CFG.combat.pistolAmmo,
  screen: 'menu', hurtFlash: 0, shootT: 0, overlayT: 0, respawnAt: null,
  storyDone: false, startTime: 0, fromControls: 'menu',
};
const P = player.state;

function feed(msg) { hud.feed(msg); }
const peds = createPedestrians(scene, city, rng, effects, audio,
  () => police.addWanted(1), feed);
const police = createPolice(scene, city, vehicles, rng, effects, audio, {
  onFeed: feed,
  onBusted: () => beginEnd('BUSTED', 'The cops took you in.', city.places.police, CFG.economy.bustFine),
  onSpray: () => {
    G.cash -= CFG.economy.sprayCost;
    police.setWanted(0, true);
    police.repaint(P.inCar);
    feed('Fresh paint. The cops lost your trail.');
    audio.jingle();
  },
});
const combat = createCombat(scene, city, effects, audio);
const missions = createMissions(scene, city, vehicles, combat, rng, {
  onDialogue: (lines) => hud.dialogue(lines),
  onFeed: feed,
  onCrime: (x, z, stars) => police.addWanted(stars),
  onPaid: (amount, why) => {
    G.cash += amount;
    hud.banner(`+$${amount}`, why);
    audio.jingle();
    G.ammo = CFG.combat.pistolAmmo;
    autoSave();
  },
  onCharm: (n) => {
    G.cash += CFG.economy.charmValue;
    effects.sparkle(P.x, 1.6, P.z);
    audio.charm();
    feed(`Moon charm ${n}/${missions.totalCharms}  (+$${CFG.economy.charmValue})`);
  },
  onFailed: () => audio.sting(),
  onStoryDone: () => {
    G.storyDone = true;
    hud.banner('STORY COMPLETE', 'Porto Luna is yours.');
    document.getElementById('complete-stats').textContent =
      `Cash $${Math.floor(G.cash)} · Moon charms ${missions.charms}/${missions.totalCharms} · Time ${Math.floor((performance.now() - G.startTime) / 60000)} min`;
    setTimeout(() => { if (G.screen === 'play') setScreen('complete'); }, 2600);
    autoSave();
  },
});

function reportCrime(x, z) { peds.reportCrime(x, z); }

function damageGuard(g, dmg, fx, fz) {
  if (g.dead) return;
  g.health -= dmg;
  g.state = 'chase';
  if (g.health <= 0) {
    g.dead = true;
    g.deadTime = 0;
    g.rig.setAim(false);
    combat.spawnPickup(g.x, g.z, g.drop);
    effects.burst(g.x, 1.2, g.z, { color: 0xc23b2e, count: 10, speed: 3, life: 0.4 });
  }
}

function combatTargets() {
  const list = [];
  for (const ped of peds.peds) {
    list.push({ x: ped.x, z: ped.z, state: ped.state, hit: (d, fx, fz) => peds.hit(ped, d, fx, fz) });
  }
  for (const cop of police.cops) {
    list.push({ x: cop.x, z: cop.z, down: cop.down, hit: () => police.hitCop(cop) });
  }
  for (const g of combat.guards) {
    list.push({ x: g.x, z: g.z, dead: g.dead, hit: (d, fx, fz) => damageGuard(g, d, fx, fz) });
  }
  return list;
}

function tryPunch() {
  if (P.punchT > 0 || P.inCar || P.dead) return;
  P.punchT = CFG.player.punchCooldown;
  const hit = combat.punch(P.x, P.z, P.heading, combatTargets(), reportCrime);
  if (hit) effects.addShake(0.08);
  else audio.punch();
}

function tryShoot() {
  if (G.shootT > 0 || G.ammo <= 0 || P.inCar || P.dead) return;
  G.shootT = CFG.combat.pistolCooldown;
  G.ammo--;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3(P.x, 1.45, P.z);
  const flat = new THREE.Vector2(dir.x, dir.z).normalize();
  combat.shoot(origin, { x: flat.x, z: flat.y }, combatTargets(), vehicles.cars, (x, z) => {
    peds.scare(x, z, 30);
    reportCrime(x, z);
  });
  P.heading = Math.atan2(flat.x, flat.y);
}

function tryInteract() {
  if (P.inCar) { player.exitCar(); return; }
  if (missions.tryInteract(P)) { audio.click(); return; }
  const car = vehicles.nearestCar(P.x, P.z, CFG.car.enterRange, ['parked', 'traffic']);
  if (car) {
    if (!car.stolen && car.kind !== 'player') {
      car.stolen = true;
      reportCrime(P.x, P.z);
      if (police.seen) police.addWanted(1);
      feed(car.kind === 'traffic' ? 'You jacked a moving car!' : 'You stole a car.');
    }
    if (car.loop) car.loop = null;
    player.enterCar(car);
  }
}

function beginEnd(title, sub, place, fine) {
  if (G.overlayT > 0) return;
  G.overlayT = 2.6;
  G.respawnAt = place;
  G.fine = fine;
  hud.overlay(title, sub, true);
  audio.sting();
  input.unlock();
}

function finishEnd() {
  hud.overlay('', '', false);
  G.cash = Math.max(0, G.cash - (G.fine || 0));
  player.respawn(G.respawnAt);
  police.reset();
  G.ammo = CFG.combat.pistolAmmo;
  G.weapon = 'fists';
  missions.restartCurrent();
  G.overlayT = 0;
  feed(`-$${G.fine || 0}. Back on your feet.`);
}

function autoSave() {
  const ms = missions.saveState();
  saveGame({
    cash: G.cash, mission: ms.index, charms: ms.charms,
    x: P.x, z: P.z, heading: P.heading, health: P.health,
    ammo: G.ammo, weapon: G.weapon, storyDone: G.storyDone,
  });
}

function applySave(saved) {
  G.cash = saved.cash ?? CFG.economy.startCash;
  G.ammo = saved.ammo ?? CFG.combat.pistolAmmo;
  G.weapon = saved.weapon || 'fists';
  G.storyDone = !!saved.storyDone;
  P.x = saved.x ?? city.places.garage.x;
  P.z = saved.z ?? city.places.garage.z;
  P.heading = saved.heading ?? Math.PI;
  P.health = saved.health ?? CFG.player.health;
  missions.loadState({ index: saved.mission ?? 0, charms: saved.charms || [] });
}

// Camera rig.
const cam = { yaw: Math.PI, pitch: 0.32, dist: CFG.camera.dist, zoom: 0, fixed: null };
function updateCamera(dt, t) {
  const m = input.takeMouse();
  if (input.locked) {
    cam.yaw -= m.dx * 0.0026;
    cam.pitch = Math.max(-0.12, Math.min(0.95, cam.pitch + m.dy * 0.0022));
  } else if (G.screen === 'play' && !P.inCar) {
    // Drift behind the player's heading when the mouse is free.
    let diff = P.heading - cam.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cam.yaw += diff * Math.min(1, dt * 1.2);
  }
  cam.zoom = Math.max(-3, Math.min(4, cam.zoom + input.takeWheel() * 0.7));
  let tx, ty, tz, dist;
  if (G.screen === 'menu' || cam.fixed) {
    const a = t * 0.05;
    tx = 0; ty = 6; tz = 0;
    camera.position.set(Math.sin(a) * 130, 46, Math.cos(a) * 130);
    camera.lookAt(0, 4, 0);
    return;
  }
  if (P.inCar) {
    tx = P.x; ty = 1.6; tz = P.z;
    dist = CFG.camera.carDist + cam.zoom;
    let diff = P.heading - cam.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (!input.locked) cam.yaw += diff * Math.min(1, dt * 1.6);
  } else {
    tx = P.x; ty = 1.7; tz = P.z;
    dist = CFG.camera.dist + cam.zoom;
  }
  const shake = effects.shakeOffset(t);
  const cy = Math.sin(cam.pitch) * dist + (P.inCar ? CFG.camera.carHeight : CFG.camera.height);
  const ch = Math.cos(cam.pitch) * dist;
  camera.position.set(
    tx - Math.sin(cam.yaw) * ch + shake.x,
    ty + cy * 0.55 + shake.y,
    tz - Math.cos(cam.yaw) * ch,
  );
  if (camera.position.y < 0.6) camera.position.y = 0.6;
  camera.lookAt(tx, ty, tz);
  // Keep the sun's shadow frustum on the player.
  city.sun.position.set(P.x + 120, 180, P.z + 60);
  city.sun.target.position.set(P.x, 0, P.z);
  city.sun.target.updateMatrixWorld();
}

// One fixed simulation step.
function stepSim(dt, t) {
  if (G.overlayT > 0) {
    G.overlayT -= dt;
    if (G.overlayT <= 0) finishEnd();
  }
  G.shootT -= dt;
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2);
  player.update(dt, input, cam.yaw);
  vehicles.update(dt, P, P.inCar, t);
  peds.update(dt, P.x, P.z);
  police.update(dt, P, G.cash, t);
  combat.updateGuards(dt, P, (dmg, fx, fz) => {
    player.damage(dmg, fx, fz);
    G.hurtFlash = 1;
  });
  combat.updatePickups(dt, P, (amount) => {
    G.cash += amount;
    audio.pickup();
    feed(`+$${amount}`);
  });
  missions.update(dt, P, police.wanted);
  city.update(dt, t);
  effects.update(dt);
  audio.update(dt);
  audio.setEngine(!!P.inCar && !P.inCar.dead, P.inCar ? Math.abs(P.inCar.speed) / 28 : 0);
  // Running over pedestrians with the player's car.
  if (P.inCar && Math.abs(P.inCar.speed) > 3) {
    for (const ped of peds.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - P.x, ped.z - P.z) < 2.4) {
        peds.hit(ped, 100, P.x, P.z);
        reportCrime(P.x, P.z);
        effects.addShake(0.2);
      }
    }
  }
  // Wasted: death can land mid-step (guard fire runs after player.update),
  // so this check runs after every update that can damage the player.
  if (P.dead && G.overlayT <= 0) {
    beginEnd('WASTED', 'Mia wakes up at General Hospital.', city.places.hospital, CFG.economy.wastedFee);
  }
  // Actions.
  if (input.wasPressed('KeyE')) tryInteract();
  if (input.wasPressed('KeyF')) tryPunch();
  if (input.wasPressed('Digit1')) G.weapon = 'fists';
  if (input.wasPressed('Digit2')) G.weapon = 'pistol';
  if (input.wasPressed('KeyQ')) G.weapon = G.weapon === 'fists' ? 'pistol' : 'fists';
  if (input.mousePressed) {
    if (!input.locked) input.lock();
    else if (G.weapon === 'pistol') tryShoot();
    else tryPunch();
  }
  if (input.isDown('KeyM') && input.wasPressed('KeyM')) {
    feed(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
  }
  // Aiming pose: face the camera while the pistol is out and still.
  const aiming = G.weapon === 'pistol' && (input.rightDown || input.locked);
  player.rig.setAim(G.weapon === 'pistol');
  if (aiming && P.speed < 0.5 && !P.inCar && !P.dead) P.heading = cam.yaw;
  G.aiming = aiming && !P.inCar;
  input.endFrame();
}

function hudState() {
  return {
    health: P.health, cash: G.cash, charms: missions.charms, totalCharms: missions.totalCharms,
    wanted: police.wanted, weapon: G.weapon, ammo: G.ammo,
    inCar: !!P.inCar, speed: P.inCar ? P.inCar.speed : 0,
    carHealth: P.inCar ? P.inCar.health : 0,
    objective: missions.objective(), bustProgress: police.bustProgress,
    hurtFlash: G.hurtFlash, aiming: G.aiming,
    prompt: missions.interactPrompt(P) ||
      (!P.inCar && vehicles.nearestCar(P.x, P.z, CFG.car.enterRange, ['parked', 'traffic']) ? 'Press E — Get in the car' : '') ||
      (P.inCar ? 'Press E — Get out' : ''),
    playerPos: { x: P.x, z: P.z, heading: P.heading },
    cops: police.cops, cruisers: police.cruisers, cars: vehicles.cars,
  };
}

function setScreen(name) {
  G.screen = name;
  hud.setScreen(name);
  document.getElementById('btn-continue').disabled = !hasSave();
  if (name !== 'play') input.unlock();
}

function startGame(fromSave) {
  audio.unlock();
  audio.setMusic(true);
  if (fromSave) {
    const saved = loadGame();
    if (saved) applySave(saved);
  } else {
    P.x = city.places.garage.x; P.z = city.places.garage.z;
    P.heading = Math.PI;
    missions.startMission(0);
  }
  G.startTime = performance.now();
  setScreen('play');
  input.lock();
  feed(fromSave ? 'Welcome back to Porto Luna.' : 'Porto Luna. Eddie is waiting — check the gold marker.');
}

// Button wiring.
document.getElementById('btn-new').addEventListener('click', () => { audio.unlock(); startGame(false); });
document.getElementById('btn-continue').addEventListener('click', () => { audio.unlock(); startGame(true); });
document.getElementById('btn-controls').addEventListener('click', () => { G.fromControls = 'menu'; setScreen('controls'); });
document.getElementById('btn-pause-controls').addEventListener('click', () => { G.fromControls = 'pause'; setScreen('controls'); });
document.getElementById('btn-back').addEventListener('click', () => setScreen(G.fromControls));
document.getElementById('btn-resume').addEventListener('click', () => { setScreen('play'); input.lock(); });
document.getElementById('btn-save').addEventListener('click', () => { autoSave(); feed('Game saved.'); });
document.getElementById('btn-quit').addEventListener('click', () => { autoSave(); setScreen('menu'); });
document.getElementById('btn-freeroam').addEventListener('click', () => setScreen('play'));
document.getElementById('btn-menu2').addEventListener('click', () => setScreen('menu'));
canvas.addEventListener('click', () => { if (G.screen === 'play') input.lock(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play') setScreen('pause');
});

function togglePause() {
  if (G.screen === 'play') setScreen('pause');
  else if (G.screen === 'pause') { setScreen('play'); input.lock(); }
}

// Debug + test hooks (also how the screenshot scenes drive the game).
const game = {
  scene, camera, renderer, city, vehicles, player, peds, police, combat,
  missions, hud, effects, audio, input, cam, G, P, stepSim, setScreen,
  startGame, tryInteract, tryShoot, tryPunch, feed,
  updateHud: (dt) => hud.update(dt, hudState()),
};
window.__pl = game;

if (shot) {
  // Screenshot mode: stage the scene, step the real sim, paint twice, flag ready.
  stageShot(shot, game, seed);
  let painted = 0;
  (function paint() {
    updateCamera(0, performance.now() / 1000);
    renderer.render(scene, camera);
    painted++;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  setScreen('menu');
  let last = performance.now();
  let acc = 0;
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) togglePause();
    if (G.screen === 'play' || G.screen === 'complete') {
      acc += dt;
      while (acc >= STEP) { stepSim(STEP, now / 1000); acc -= STEP; }
    } else acc = 0;
    updateCamera(dt, now / 1000);
    hud.update(dt, hudState());
    renderer.render(scene, camera);
  })(last);
  window.__gameReady = true;
}
