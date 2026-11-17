// Staged screenshot scenes for Porto Luna. Each shot starts the real game,
// places the player and the world, then steps the real simulation so the
// captured frame is genuine gameplay, not a mock-up.
import { CFG } from './config.js';

function step(game, n) {
  for (let i = 0; i < n; i++) game.stepSim(1 / 60, performance.now() / 1000);
}

export function stageShot(name, game, seed) {
  const { city, player, vehicles, police, missions, cam } = game;
  const P = game.P;
  const places = city.places;

  if (name === 'menu') {
    game.setScreen('menu');
    return;
  }

  // The mission scene sets itself up directly so its dialogue queue carries
  // this job's briefing, not the first mission's.
  if (name !== 'mission') {
    game.startGame(false);
    game.setScreen('play');
  }

  if (name === 'cover') {
    // Mia on the boardwalk, city and lighthouse behind her.
    P.x = places.beach.x + 6; P.z = places.beach.z - 6;
    P.heading = Math.PI;
    cam.yaw = Math.PI; cam.pitch = 0.22; cam.dist = CFG.camera.dist;
    step(game, 30);
  } else if (name === 'chase') {
    // A two-star pursuit down the main avenue (x = -6 is a road centreline).
    // Throttle held, camera ahead of the car looking back at the cruiser.
    const car = vehicles.spawnCar('sedan', 0x2e8b8b, -6, 23, 0, 'player');
    P.x = -6; P.z = 23; P.heading = 0;
    player.enterCar(car);
    car.speed = 12;
    cam.yaw = Math.PI; cam.pitch = 0.3;
    police.addWanted(2);
    game.input.debugHold('KeyW', true);
    step(game, 90);
    game.input.debugHold('KeyW', false);
    // Bring the pursuing cruiser into frame behind the car, then let the
    // real pursuit AI run on from there.
    const cruiser = police.cruisers[0];
    if (cruiser) {
      cruiser.x = P.x; cruiser.z = P.z - 25;
      cruiser.heading = 0; cruiser.speed = 17;
      step(game, 20);
    }
  } else if (name === 'mission') {
    // The gold coupe job, staged at the moment before contact: guards patrol,
    // the beacon marks the lot, Mia approaches on foot.
    game.audio.unlock();
    game.audio.setMusic(true);
    game.G.startTime = performance.now();
    game.setScreen('play');
    missions.startMission(1);
    P.x = places.lot.x + 16; P.z = places.lot.z + 10;
    P.heading = Math.atan2(places.lot.x - P.x, places.lot.z - P.z);
    cam.yaw = P.heading; cam.pitch = 0.3;
    step(game, 30);
    P.health = 100;
    game.G.hurtFlash = 0;
  } else if (name === 'city') {
    // Rooftop-scale view of the crescent bay from the hills.
    P.x = places.hills.x; P.z = places.hills.z;
    P.heading = Math.PI;
    cam.yaw = Math.PI; cam.pitch = 0.42; cam.zoom = 4;
    step(game, 30);
  }
  game.updateHud(0.016);
}
