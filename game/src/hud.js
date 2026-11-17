// Porto Luna's HUD: health, cash, stars, weapon, speed, the canvas minimap,
// mission tracker, dialogue, feed, banners and every menu screen.
import { CFG } from './config.js';

function el(id) { return document.getElementById(id); }

export function createHud(city) {
  const map = el('minimap');
  const mctx = map.getContext('2d');
  const SIZE = map.width;
  const SCALE = 1.55; // minimap pixels per metre
  const half = CFG.half;

  // Static base map, drawn once: water, sand, roads, blocks, park, plaza.
  const base = document.createElement('canvas');
  base.width = base.height = Math.ceil(half * 2 * SCALE) + 40;
  (function paintBase() {
    const g = base.getContext('2d');
    const toX = (x) => (x + half) * SCALE + 20;
    const toZ = (z) => (z + half) * SCALE + 20;
    g.fillStyle = '#2e7fa8';
    g.fillRect(0, 0, base.width, base.height);
    g.fillStyle = '#e8d29a';
    g.fillRect(0, toZ(half), base.width, base.height - toZ(half));
    g.fillStyle = '#3a3f46';
    g.fillRect(toX(-half), toZ(-half), half * 2 * SCALE, half * 2 * SCALE);
    for (let bx = 0; bx < CFG.blocks; bx++) for (let bz = 0; bz < CFG.blocks; bz++) {
      const cx = CFG.blockCenter(bx), cz = CFG.blockCenter(bz);
      const special = (bx === 1 && bz === 5) || (bx === 4 && bz === 4);
      g.fillStyle = special ? '#7fae5c' : '#8a8a7a';
      g.fillRect(toX(cx - CFG.block / 2), toZ(cz - CFG.block / 2), CFG.block * SCALE, CFG.block * SCALE);
    }
    g.fillStyle = '#8a6a42';
    g.fillRect(toX(69 - 3), toZ(half), 6 * SCALE, 60 * SCALE);
  })();

  const feedBox = el('feed');
  const feedItems = [];
  function feed(msg) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.textContent = msg;
    feedBox.appendChild(div);
    feedItems.push({ div, t: 5 });
    while (feedItems.length > 4) feedItems.shift().div.remove();
  }

  const dlgBox = el('dialogue');
  let dlgQueue = [];
  let dlgT = 0;
  function dialogue(lines) {
    dlgQueue = dlgQueue.concat(lines);
  }

  let bannerT = 0;
  function banner(main, sub) {
    el('banner-main').textContent = main;
    el('banner-sub').textContent = sub || '';
    el('banner').classList.add('show');
    bannerT = 2.6;
  }

  function drawMinimap(player, cops, cruisers, objective, cars) {
    const g = mctx;
    const px = (player.x + half) * SCALE + 20;
    const pz = (player.z + half) * SCALE + 20;
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.drawImage(base, SIZE / 2 - px, SIZE / 2 - pz);
    const dot = (x, z, color, r) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(SIZE / 2 + (x - player.x) * SCALE, SIZE / 2 + (z - player.z) * SCALE, r, 0, Math.PI * 2);
      g.fill();
    };
    for (const car of cars) {
      if (car.kind === 'traffic') dot(car.x, car.z, '#c8c8c8', 2);
    }
    for (const cop of cops) if (!cop.down) dot(cop.x, cop.z, '#4a7ae8', 3);
    for (const car of cruisers) dot(car.x, car.z, '#2a4ae8', 3.5);
    if (objective && objective.pos) {
      const dx = objective.pos.x - player.x, dz = objective.pos.z - player.z;
      const d = Math.hypot(dx, dz);
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.5;
      if (d * SCALE < SIZE / 2 - 8) {
        dot(objective.pos.x, objective.pos.z, '#ffd94c', pulse);
      } else {
        // Edge arrow pointing at a far objective.
        const ang = Math.atan2(dx, dz);
        const ex = SIZE / 2 + Math.sin(ang) * (SIZE / 2 - 12);
        const ez = SIZE / 2 + Math.cos(ang) * (SIZE / 2 - 12);
        g.save();
        g.translate(ex, ez);
        g.rotate(-ang);
        g.fillStyle = '#ffd94c';
        g.beginPath();
        g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath();
        g.fill();
        g.restore();
      }
    }
    // Player arrow.
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(player.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#222222';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    g.stroke();
  }

  function setScreen(name) {
    for (const id of ['menu', 'pause', 'controls', 'complete']) {
      el(id).classList.toggle('show', id === name);
    }
    el('hud').classList.toggle('hidden', name === 'menu' || name === 'complete');
    el('crosshair').style.display = 'none';
  }

  function update(dt, G) {
    // Feed expiry + dialogue queue.
    for (let i = feedItems.length - 1; i >= 0; i--) {
      feedItems[i].t -= dt;
      if (feedItems[i].t <= 0) { feedItems[i].div.remove(); feedItems.splice(i, 1); }
    }
    if (dlgT > 0) {
      dlgT -= dt;
      if (dlgT <= 0) dlgBox.classList.remove('show');
    } else if (dlgQueue.length) {
      const [who, text] = dlgQueue.shift();
      el('dlg-speaker').textContent = who;
      el('dlg-text').textContent = text;
      dlgBox.classList.add('show');
      dlgT = 3.4;
    }
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) el('banner').classList.remove('show');
    }
    // Bars and counters.
    el('healthfill').style.width = `${Math.max(0, G.health)}%`;
    el('healthfill').classList.toggle('low', G.health < 30);
    el('cash').textContent = `$${Math.floor(G.cash)}`;
    el('charms').textContent = `☾ ${G.charms}/${G.totalCharms}`;
    let stars = '';
    for (let i = 0; i < CFG.police.maxStars; i++) stars += i < G.wanted ? '★' : '☆';
    el('stars').textContent = stars;
    el('stars').classList.toggle('hot', G.wanted > 0);
    el('weapon').textContent = G.weapon === 'pistol' ? `Pistol · ${G.ammo}` : 'Fists';
    el('speed').textContent = G.inCar ? `${Math.round(Math.abs(G.speed) * 3.6)} km/h` : '';
    el('carhealth').style.display = G.inCar ? 'block' : 'none';
    if (G.inCar) el('carhealthfill').style.width = `${Math.max(0, G.carHealth)}%`;
    // Objective tracker.
    const obj = el('objective');
    if (G.objective) {
      obj.style.display = 'block';
      el('obj-name').textContent = G.objective.name;
      el('obj-text').textContent = G.objective.text;
      el('obj-timer').textContent = G.objective.timer > 0 ? `⏱ ${Math.ceil(G.objective.timer)}s` : '';
    } else obj.style.display = 'none';
    // Bust meter + damage vignette + prompt.
    el('bustbar').style.display = G.bustProgress > 0.02 ? 'block' : 'none';
    el('bustfill').style.width = `${G.bustProgress * 100}%`;
    el('vignette').style.opacity = G.hurtFlash > 0 ? 0.5 : (G.health < 30 ? 0.25 + Math.sin(performance.now() * 0.005) * 0.1 : 0);
    el('prompt').textContent = G.prompt || '';
    el('prompt').style.display = G.prompt ? 'block' : 'none';
    el('crosshair').style.display = G.aiming ? 'block' : 'none';
    drawMinimap(G.playerPos, G.cops, G.cruisers, G.objective, G.cars);
  }

  function overlay(main, sub, show) {
    el('overlay-main').textContent = main;
    el('overlay-sub').textContent = sub || '';
    el('overlay').classList.toggle('show', show);
  }

  return { feed, dialogue, banner, update, setScreen, overlay };
}
