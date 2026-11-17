// Seeded randomness for Porto Luna: one mulberry32 stream per seed, so
// `?seed=N` rebuilds the same city, traffic and pedestrians every time.
export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small helper object wrapping one stream; every generator takes it.
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(a, b) { return a + next() * (b - a); },
    int(a, b) { return Math.floor(a + next() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
    // Deterministic pick that avoids repeating the previous index.
    pickOther(arr, prev) {
      if (arr.length < 2) return arr[0];
      let i = Math.floor(next() * arr.length);
      if (i === prev) i = (i + 1) % arr.length;
      return arr[i];
    },
  };
}
