// Porto Luna — every tuning number and world-layout constant in one place.
// The rest of the game reads this table; nothing else hard-codes a balance value.
export const CFG = {
  seedDefault: 7,
  // City grid: BLOCKS x BLOCKS blocks separated by roads. The bay lies south
  // (positive z); the whole city is centred on the origin.
  blocks: 8,
  block: 34,
  road: 12,
  get pitch() { return this.block + this.road; },
  get half() { return (this.blocks * this.block + (this.blocks + 1) * this.road) / 2; },
  // Road centre lines, block indices 0..blocks.
  roadAt(i) { return -this.half + this.road / 2 + i * this.pitch; },
  blockCenter(i) { return -this.half + this.road + this.block / 2 + i * this.pitch; },

  player: {
    walk: 4.2, sprint: 7.0, accel: 34, jump: 7.5, gravity: 22,
    radius: 0.55, height: 1.75, health: 100, punchDmg: 12, punchRange: 1.6,
    punchArc: 1.1, punchCooldown: 0.45,
  },
  car: {
    accel: 16, brake: 30, reverseMax: 8, steer: 2.1, grip: 6.5,
    drag: 0.55, rollDrag: 1.6, handbrakeGrip: 1.8, maxHealth: 100,
    enterRange: 3.2, damageSpeed: 9, collideCooldown: 0.25,
  },
  traffic: { count: 14, speed: 9, minGap: 7, respawnDist: 260 },
  peds: { count: 26, walk: 1.6, flee: 4.6, witnessRange: 22 },
  police: {
    maxStars: 5, evadeTime: 9, bustRange: 3.2, bustTime: 2.2,
    cruiserSpeed: 17, copSpeed: 5.2, sightRange: 55, spawnRange: 70,
    chaseStop: 6, ramSpeed: 6,
  },
  combat: {
    pistolDmg: 34, pistolRange: 60, pistolCooldown: 0.28, pistolAmmo: 60,
    guardDmg: 8, guardRange: 26, guardCooldown: 1.1, guardHealth: 60,
  },
  economy: {
    startCash: 120, charmValue: 50, bustFine: 150, wastedFee: 200,
    sprayCost: 100, missionPay: [250, 400, 500, 600, 1000],
  },
  camera: { dist: 7.5, carDist: 10.5, height: 2.6, carHeight: 3.6, fov: 62 },
  colors: {
    sky: 0x87c5e8, fog: 0xa8d0e6, sun: 0xfff2d8, ground: 0x9db380,
    sand: 0xe8d29a, water: 0x2e7fa8, road: 0x3a3f46, walk: 0xb8b2a4,
    plaza: 0xcfc4ae, grass: 0x7fae5c,
  },
  // Palette for building facades, cars and clothes.
  facades: [0xe8dcc8, 0xd9c4a8, 0xc8d4dc, 0xe4c9b0, 0xb8c8b0, 0xd8b8a8, 0xe8e0d0, 0xc0b8d0],
  carPaint: [0xc23b2e, 0x2e5fc2, 0xe8e8e8, 0x222528, 0xe8a81c, 0x3a8a4c, 0x7a4a9a, 0x8899a8, 0x5a3a28],
  clothes: [0xc25a3a, 0x3a6ac2, 0x4a9a5a, 0xd8c23a, 0x8a4a9a, 0x38a8a8, 0xe8e8e8, 0x404040],
};
