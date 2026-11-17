// Particles, tracers and camera shake for Porto Luna: one pooled THREE.Points
// cloud for sparks, smoke and sparkles, plus a small tracer pool.
import * as THREE from 'three';

const MAX = 420;

export function createEffects(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  let head = 0;
  for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = -999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);

  const colorTmp = new THREE.Color();
  function emit(x, y, z, opts) {
    const i = head;
    head = (head + 1) % MAX;
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    const spread = opts.spread ?? 1;
    vel[i * 3] = (Math.random() - 0.5) * 2 * opts.speed * spread;
    vel[i * 3 + 1] = Math.random() * opts.speed * (opts.up ?? 0.8);
    vel[i * 3 + 2] = (Math.random() - 0.5) * 2 * opts.speed * spread;
    colorTmp.setHex(opts.color);
    colors[i * 3] = colorTmp.r; colors[i * 3 + 1] = colorTmp.g; colors[i * 3 + 2] = colorTmp.b;
    life[i] = maxLife[i] = opts.life * (0.6 + Math.random() * 0.7);
    grav[i] = opts.gravity ?? 6;
  }

  // Tracer pool: short-lived lines for gunfire.
  const tracers = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerHead = 0;

  let trauma = 0;
  return {
    burst(x, y, z, opts) {
      for (let i = 0; i < (opts.count || 8); i++) emit(x, y, z, opts);
    },
    smoke(x, y, z, color = 0x666666) {
      emit(x, y, z, { color, count: 1, speed: 0.7, life: 1.1, gravity: -1.2, up: 1.4, spread: 0.5 });
    },
    sparkle(x, y, z) {
      for (let i = 0; i < 14; i++) emit(x, y, z, { color: 0xffd94c, speed: 2.2, life: 0.7, gravity: 1, up: 1.2 });
    },
    tracer(a, b) {
      const t = tracers[tracerHead];
      tracerHead = (tracerHead + 1) % tracers.length;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = a.x; pos[1] = a.y; pos[2] = a.z;
      pos[3] = b.x; pos[4] = b.y; pos[5] = b.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.visible = true;
      t.line.material.opacity = 0.9;
      t.life = 0.09;
    },
    addShake(amount) { trauma = Math.min(1, trauma + amount); },
    shakeOffset(t) {
      if (trauma <= 0.01) return { x: 0, y: 0 };
      const s = trauma * trauma * 0.5;
      return { x: Math.sin(t * 61) * s, y: Math.cos(t * 53) * s };
    },
    update(dt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { positions[i * 3 + 1] = -999; continue; }
        vel[i * 3 + 1] -= grav[i] * dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.05) positions[i * 3 + 1] = 0.05;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    },
  };
}
