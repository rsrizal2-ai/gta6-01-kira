// Porto Luna's story: five jobs for Eddie Kwan, objective beacons, mission
// actors, dialogue beats, and the ten moon charms hidden across the city.
import * as THREE from 'three';
import { CFG } from './config.js';

const DIALOGUE = {
  m1: [['Eddie', 'Mia! My client waits at the plaza. Get wheels, get her to the Miramar.'],
       ['Eddie', 'Ninety seconds of charm, a hundred of driving. Go.']],
  m1b: [['Client', 'The Miramar, please — and do hurry, the view waits for no one.']],
  m2: [['Eddie', 'The Vultures took my gold coupe. It sits in their lot, west side. Take it back.'],
       ['Eddie', 'Expect company. They keep dogs with guns.']],
  m2b: [['Eddie', 'That is my girl! Bring her home, and mind the paint.']],
  m3: [['Eddie', 'A package waits at Warehouse 9. Beach drop, no questions. The cops will care.'],
       ['Eddie', 'Take it, run it, then go quiet.']],
  m3b: [['Eddie', 'Package away. Now lose the heat before you come home.']],
  m4: [['Eddie', 'Rook keeps his ledger at Meridian Offices. Walk in, take it, walk out.'],
       ['Eddie', 'It names every fence in Porto Luna. Worth more than gold.']],
  m5: [['Eddie', 'Last job, Mia. The Moonstone shipment lands at Warehouse 9 tonight.'],
       ['Eddie', 'Take it all. Bring it to the pier. Then we are done with Rook forever.']],
  done: [['Eddie', 'Porto Luna is ours, Mia. The Vultures are finished. Take the day off — you earned it.']],
};

export function createMissions(scene, city, vehicles, combat, rng, hooks) {
  const places = city.places;
  // Objective beacon: a pulsing ring and a light pillar.
  const beacon = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd94c }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  beacon.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 30, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd94c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 15;
  beacon.add(beam);
  beacon.visible = false;
  scene.add(beacon);

  // Moon charms: golden rings spinning over the city's ten spots.
  const charmMeshes = [];
  const charmGeo = new THREE.TorusGeometry(0.55, 0.16, 8, 20);
  const charmMat = new THREE.MeshBasicMaterial({ color: 0xffd94c });
  for (const spot of city.charmSpots) {
    const m = new THREE.Mesh(charmGeo, charmMat);
    m.position.set(spot.x, 1.4, spot.z);
    scene.add(m);
    charmMeshes.push(m);
  }
  const charmsGot = new Set();

  let index = -1;       // current mission, -1 = none / story done
  let stepIdx = 0;
  let active = false;
  let timer = 0;
  let betweenT = 0;
  let goldCar = null;
  let guardsAlive = [];

  function say(lines) { hooks.onDialogue(lines); }

  function spawnGuards(list) {
    clearActors();
    for (const [x, z, h] of list) {
      const g = combat.makeGuard(x, z, h);
      guardsAlive.push(g);
    }
  }
  function clearActors() {
    for (const g of guardsAlive) combat.removeGuard(g);
    guardsAlive = [];
    if (goldCar) { vehicles.removeCar(goldCar); goldCar = null; }
  }

  const DEFS = [
    {
      name: 'Warm-Up Fare',
      intro: DIALOGUE.m1,
      steps: [
        { text: 'Meet the client at the plaza', type: 'goto', at: () => places.plaza, r: 7 },
        { text: 'Drive the client to Hotel Miramar', type: 'goto', at: () => places.hotel, r: 8, needCar: true, time: 100, line: DIALOGUE.m1b },
      ],
    },
    {
      name: 'Take It Back',
      intro: DIALOGUE.m2,
      setup() {
        const lot = places.lot;
        spawnGuards([[lot.x - 6, lot.z - 5, 0.6], [lot.x + 7, lot.z + 4, 2.6]]);
        goldCar = vehicles.spawnCar('coupe', 0xd8b83a, lot.x + 2, lot.z - 2, 0.4, 'parked');
      },
      steps: [
        { text: 'Reach the Vulture lot', type: 'goto', at: () => places.lot, r: 12 },
        { text: 'Steal the gold coupe', type: 'enter', car: () => goldCar, line: DIALOGUE.m2b,
          onDone: () => hooks.onCrime(places.lot.x, places.lot.z, 1) },
        { text: 'Deliver the coupe to Luna Garage', type: 'goto', at: () => places.garage, r: 9, needCar: true, car: () => goldCar },
      ],
    },
    {
      name: 'Hot Cargo',
      intro: DIALOGUE.m3,
      steps: [
        { text: 'Pick up the package at Warehouse 9', type: 'grab', at: () => places.warehouseDoor, r: 3.5, prompt: 'Take the package',
          onDone: () => hooks.onCrime(places.warehouse.x, places.warehouse.z, 2) },
        { text: 'Deliver the package to the beach drop', type: 'goto', at: () => places.beach, r: 7, line: DIALOGUE.m3b },
        { text: 'Lose the cops', type: 'evade' },
      ],
    },
    {
      name: 'Paper Trail',
      intro: DIALOGUE.m4,
      setup() {
        const o = places.office;
        spawnGuards([[o.x - 5, o.z + 9, 0.2], [o.x + 5, o.z + 9, -0.2]]);
      },
      steps: [
        { text: 'Reach Meridian Offices', type: 'goto', at: () => places.office, r: 10 },
        { text: 'Grab the ledger from the drop box', type: 'grab', at: () => places.office, r: 3.5, prompt: 'Take the ledger' },
        { text: 'Take the ledger to Eddie at the garage', type: 'goto', at: () => places.garage, r: 9 },
      ],
    },
    {
      name: 'Moonrise',
      intro: DIALOGUE.m5,
      setup() {
        const w = places.warehouse;
        spawnGuards([
          [w.x - 8, w.z + 12, 0.4], [w.x + 8, w.z + 12, -0.4],
          [w.x - 12, w.z + 2, 1.2], [w.x + 12, w.z + 2, -1.2],
        ]);
      },
      steps: [
        { text: 'Reach Warehouse 9', type: 'goto', at: () => places.warehouse, r: 13 },
        { text: 'Take the Moonstone shipment', type: 'grab', at: () => places.warehouseDoor, r: 3.5, prompt: 'Take the shipment',
          onDone: () => hooks.onCrime(places.warehouse.x, places.warehouse.z, 4) },
        { text: 'Escape to the pier', type: 'goto', at: () => places.pier, r: 8, needCar: true },
      ],
    },
  ];

  function startMission(i) {
    clearActors();
    index = i;
    stepIdx = 0;
    active = true;
    const def = DEFS[i];
    def.setup && def.setup();
    beginStep();
    say(def.intro);
    hooks.onFeed(`Mission ${i + 1}: ${def.name}`);
  }

  function beginStep() {
    const step = DEFS[index].steps[stepIdx];
    timer = step.time || 0;
    if (step.line) say(step.line);
    const at = step.at && step.at();
    if (at) { beacon.position.set(at.x, 0, at.z); beacon.visible = true; }
    else if (step.type === 'enter') {
      const car = step.car();
      if (car) { beacon.position.set(car.x, 0, car.z); beacon.visible = true; }
    }
    else beacon.visible = false;
  }

  function completeMission() {
    const pay = CFG.economy.missionPay[index];
    hooks.onPaid(pay, DEFS[index].name);
    clearActors();
    beacon.visible = false;
    active = false;
    index++;
    if (index >= DEFS.length) {
      index = -1;
      say(DIALOGUE.done);
      hooks.onStoryDone();
    } else {
      betweenT = 3.5;
    }
  }

  function failMission(why) {
    hooks.onFeed(`Mission failed: ${why}. Try again.`);
    hooks.onFailed();
    startMission(Math.max(0, index));
  }

  function restartCurrent() {
    if (index >= 0) startMission(index);
  }

  function currentStep() {
    return active ? DEFS[index].steps[stepIdx] : null;
  }

  function advance() {
    const step = currentStep();
    step.onDone && step.onDone();
    stepIdx++;
    if (stepIdx >= DEFS[index].steps.length) completeMission();
    else beginStep();
  }

  function tryInteract(player) {
    const step = currentStep();
    if (!step || (step.type !== 'grab' && step.type !== 'talk')) return false;
    const at = step.at();
    if (Math.hypot(player.x - at.x, player.z - at.z) < step.r && !player.inCar) {
      advance();
      return true;
    }
    return false;
  }

  function interactPrompt(player) {
    const step = currentStep();
    if (!step || step.type !== 'grab') return null;
    const at = step.at();
    if (Math.hypot(player.x - at.x, player.z - at.z) < step.r && !player.inCar) {
      return `Press E — ${step.prompt || 'Take it'}`;
    }
    return null;
  }

  function update(dt, player, wanted) {
    // Beacon pulse + charm spin.
    beacon.rotation.y += dt * 1.4;
    const s = 1 + Math.sin(performance.now() * 0.004) * 0.08;
    ring.scale.set(s, s, 1);
    const step = currentStep();
    if (step && step.type === 'enter') {
      const car = step.car();
      if (car) beacon.position.set(car.x, 0, car.z);
    }
    for (let i = 0; i < charmMeshes.length; i++) {
      if (charmsGot.has(i)) continue;
      const m = charmMeshes[i];
      m.rotation.y += dt * 2;
      m.position.y = 1.4 + Math.sin(performance.now() * 0.003 + i) * 0.15;
      const spot = city.charmSpots[i];
      if (Math.hypot(player.x - spot.x, player.z - spot.z) < 2.2) {
        charmsGot.add(i);
        m.visible = false;
        hooks.onCharm(charmsGot.size);
        if (charmsGot.size === charmMeshes.length) hooks.onPaid(500, 'All moon charms');
      }
    }

    if (!active) {
      if (index >= 0 && index < DEFS.length && betweenT > 0) {
        betweenT -= dt;
        if (betweenT <= 0) startMission(index);
      }
      return;
    }
    if (timer > 0) {
      timer -= dt;
      if (timer <= 0) { failMission('Out of time'); return; }
    }
    if (!step) return;
    if (step.type === 'goto') {
      const at = step.at();
      const inRightCar = !step.car || player.inCar === step.car();
      if (Math.hypot(player.x - at.x, player.z - at.z) < step.r &&
          (!step.needCar || player.inCar) && inRightCar) advance();
    } else if (step.type === 'enter') {
      if (player.inCar === step.car()) advance();
    } else if (step.type === 'evade') {
      if (wanted === 0) advance();
    }
  }

  function objective() {
    if (!active) return null;
    const step = currentStep();
    const at = step.at ? step.at() : (step.car ? step.car() : null);
    return {
      name: DEFS[index].name,
      text: step.text,
      pos: at ? { x: at.x, z: at.z } : null,
      timer: timer > 0 ? timer : 0,
    };
  }

  function saveState() {
    return { index: index < 0 ? DEFS.length : index, charms: [...charmsGot] };
  }
  function loadState(saved) {
    charmsGot.clear();
    for (const i of saved.charms || []) {
      charmsGot.add(i);
      if (charmMeshes[i]) charmMeshes[i].visible = false;
    }
    const idx = Math.min(saved.index ?? 0, DEFS.length);
    if (idx >= DEFS.length) { index = -1; active = false; }
    else { index = idx; betweenT = 1.5; }
  }

  return {
    DEFS, startMission, restartCurrent, tryInteract, interactPrompt,
    update, objective, saveState, loadState,
    get index() { return index; },
    get active() { return active; },
    get charms() { return charmsGot.size; },
    get totalCharms() { return charmMeshes.length; },
  };
}
