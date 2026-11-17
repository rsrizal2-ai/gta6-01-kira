// Porto Luna hands itself in: this program copies the static game folder and
// the captured screenshots into the output directory and writes dossier.json,
// the summary the judge reads, using the vendored make.fun library. The game
// itself is plain files under game/ — an original three.js open-world crime
// game, fully offline, no build step and no network request.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps from the competition gate: text_max_bytes shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse.
const DOSSIER_TEXT_MAX = 163840;
const SHOT_LIMITS = { max: 4, max_bytes: 262144 };
const GAME_LIMITS = { maxFiles: 993, maxBytes: 50331648, pathMaxBytes: 1000 };

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: DOSSIER_TEXT_MAX,
    screenshots: SHOT_LIMITS,
    game_max_files: GAME_LIMITS.maxFiles,
    game_max_bytes: GAME_LIMITS.maxBytes,
    game_path_max_bytes: GAME_LIMITS.pathMaxBytes,
  }),
);
