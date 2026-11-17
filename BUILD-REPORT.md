# BUILD REPORT — Porto Luna (gta6-01, attempt 2)

## What it is

**Porto Luna** is an original open-world crime game, authored from scratch in
this session for the make.fun "Make GTA 6" bounty (gta6-01). No code was
copied from the earlier Solmar Bay or Cayo Verde builds: their BUILD-REPORT.md
files were read for lessons only (parking-lot placement, pointer-lock click
grace, line-of-sight police sighting, headless-test approach). Every line of
game code, dialogue, mission design, character and place name below is new.
The only third-party code is three.js r160, vendored as
`game/vendor/three.module.min.js` (670,681 bytes, sha256
`3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6`).

## The game

A sun-soaked crescent-bay city on an 8×8 block grid (block 34 m, road 12 m):
beach, boardwalk and pier to the south, a park, a plaza, hills and a
lighthouse to the north. The player is **Mia Torres**, a getaway driver
working off a debt to **Eddie Kwan**, the fixer at Luna Garage, while the
rival Vulture crew (led by **Rook**) tries to run her out of town.

**Five story missions** (objective beacon, dialogue, pay, fail-and-retry):
1. **Warm-Up Fare** — meet a client at the plaza, drive her to Hotel Miramar
   against a 100-second clock.
2. **Take It Back** — steal Eddie's gold coupe from the guarded Vulture lot,
   deliver it to the garage.
3. **Hot Cargo** — grab a package at Warehouse 9, run it to the beach drop
   with a 2-star wanted level, then lose the cops.
4. **Paper Trail** — take Rook's ledger from the Meridian Offices drop box
   and bring it to Eddie.
5. **Moonrise** — seize the Moonstone shipment at Warehouse 9 and escape to
   the pier at 4 stars. Completing it ends the story; free roam continues.

**Systems**: on-foot movement (walk/sprint/jump) and arcade driving
(6 car styles, damage, smoke, brake lights, horn); traffic loops with
braking; pedestrians who walk, flee, and report crimes they witness; a
0–5 star wanted system with line-of-sight sighting, cruiser pursuit, foot
cops and a bust meter, evasion, and a spray shop (repaint clears heat);
melee + hitscan pistol combat against pedestrians, cops and armed guards
(who patrol, chase, shoot, and drop cash); 10 hidden moon charms; health,
cash, HUD with canvas minimap, mission tracker, dialogue, feed and banners;
start/pause/controls/story-complete screens; localStorage saves;
synthesized WebAudio (engine, sirens, shots, music, jingles); particles,
muzzle flashes and camera shake; deterministic `?seed=` city generation;
`?shot=` staged scenes; `?lowfx` for weaker machines.

**Controls**: WASD/arrows move and drive, mouse camera (pointer lock), wheel
zoom, Shift sprint, Space jump/handbrake, E enter car & interact, F/click
punch or fire, 1/2/Q weapons, H horn, P/Esc pause, M mute.

## File map (all under `game/`)

| File | What it holds |
|---|---|
| `index.html`, `styles.css` | Page shell, import map (`three` → vendor), HUD and screens |
| `src/config.js` | All tuning: city, cars, police, combat, economy, camera |
| `src/random.js` | Seeded RNG (mulberry32 + string hash) |
| `src/input.js` | Keyboard/mouse, pointer lock with click grace, debug hooks |
| `src/audio.js` | WebAudio synth: SFX, engine/siren loops, music |
| `src/city.js` | Procedural city, colliders, LOS tests, places, charm spots |
| `src/characters.js` | Parametric humanoid rigs with walk/aim/fall poses |
| `src/vehicles.js` | Car meshes, driving physics, traffic loops, parked cars |
| `src/player.js` | On-foot + driving player, enter/exit, damage, respawn |
| `src/pedestrians.js` | Walking/fleeing peds, witnesses, hit reactions |
| `src/effects.js` | Particles, smoke, sparkles, camera shake |
| `src/police.js` | Wanted stars, cruisers, foot cops, bust, spray shop |
| `src/combat.js` | Guards, punch/shoot resolution, cash pickups |
| `src/missions.js` | Five jobs, objective beacon, dialogue, moon charms |
| `src/hud.js` | HUD, minimap, tracker, dialogue, feed, screens |
| `src/save.js` | Guarded localStorage save/load |
| `src/shots.js` | Staged `?shot=` scenes (cover/chase/mission/menu/city) |
| `src/main.js` | Boot, fixed-step loop, camera, wiring, wasted/busted, save |

Source total ≈ 116 KB (dossier text cap 163,840 bytes). `main.ts` hands the
game in via the vendored kit library (own header and structure; ≥1 authored
line). `vendor/makefun-game.ts` and `serve.ts` are untouched kit files.

## Verification

**Headless play-through** (Playwright + SwiftShader, `?seed=7`, driven
through `window.__pl` hooks and the input debug hooks): **46/46 checks
passed, zero console/page errors.** Covered: boot, menu, mission start,
walking, entering/exiting cars, driving acceleration, punching a ped, pistol
ammo, wanted level + cruiser/cop spawning, spray-shop clearing + $100 charge,
all five missions end-to-end (including the timer-fail restart), all 10
charms, wasted → hospital respawn, busted → police-station respawn, save
round-trip, pause/resume.

**Determinism**: two `MAKEFUN_OUTPUT_DIR` runs of `main.ts` (Node 22.18.0)
are byte-identical (`diff -r` clean).

**Gate replica** (kit helpers `readGameTree`, `htmlFacts`, `importMapOf`,
`sourceImports`, `importOrder`, `buildDossier`): **all 13 checks pass** —
game_files (22 entries, 793,379 bytes), index.html ≤ 1 MiB, one valid import
map, all references resolve inside `game/`, no network/dynamic-import
surface, import order resolves (17 modules), 4 screenshots within caps,
dossier 620,547 bytes ≤ 1.5 MiB and byte-identical to a rebuild.

**Static checks**: `node --check` clean on every module; grep confirms no
`http(s)://`, `fetch`, XHR, Worker, WebSocket or dynamic `import()` in
`game/`.

**Screenshots**: 4 real headless captures at 1280×720 (JPEG q80, each
≤ 256 KiB), staged through the real simulation via `?shot=` + `seed=7` and
visually inspected: `1-cover.jpg` (boardwalk vista), `2-chase.jpg` (two-star
pursuit, cruiser in frame), `3-mission.jpg` (gold coupe job, beacon, guard),
`4-menu.jpg` (title screen over the city).

## Bugs found and fixed during this build

1. **Wasted flow never fired.** The dead-transition check ran right after
   `player.update`, but the killing damage lands later in the step (guard
   fire callback), so the transition was missed and the player lay dead
   forever. Fixed by checking death state after all damage-dealing updates.
2. **Spray-shop repaint used a fragile mesh heuristic** (traverse matching
   on scale). `makeCarMesh` now exposes the body/nose meshes and `repaint`
   swaps their materials directly.
3. **Traffic snapped 90° at loop corners.** Corner headings now ease toward
   the loop heading instead of snapping.
4. **Pointer lock could reject unhandled** in headless/denied contexts.
   `lock()` now catches the promise rejection.
5. **Chase staging**: the pursuit car spawned on a block edge (x=0) instead
   of a road centreline, and coasted to 10 km/h. Moved to the avenue (x=-6),
   throttle held during staging, look-back camera, and the spawned cruiser
   placed 25 m behind so the pursuit reads in frame.
6. **Mission staging**: guards shot the player during staging and the
   dialogue queue showed the previous mission's briefing. The scene now sets
   up directly (clean queue), stages the pre-contact moment, and restores
   full health before capture.

## Authorship statement

All game code, art direction, writing, and tuning in this repository were
authored in this session. The two prior builds for this bounty were not
copied, read for code, or reused in any way; only their BUILD-REPORT.md
lesson notes were consulted. three.js is vendored under its MIT license.
