// Keyboard and mouse for Porto Luna: held keys, edge-triggered presses,
// pointer-lock camera deltas, and the click grace that keeps the locking
// click itself from firing the pistol.
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseDX = 0, mouseDY = 0, wheel = 0;
  let mouseDown = false, mousePressed = false, rightDown = false;
  let locked = false, lockGraceUntil = 0;
  let anyKey = false;

  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
    'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyM', 'KeyP', 'Escape', 'ArrowUp', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'KeyH', 'KeyC', 'Digit1', 'Digit2']);

  window.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Space' && e.target === document.body) e.preventDefault();
    if (!e.repeat) { held.add(e.code); pressed.add(e.code); }
    anyKey = true;
  });
  window.addEventListener('keyup', (e) => { held.delete(e.code); });
  window.addEventListener('blur', () => { held.clear(); mouseDown = false; rightDown = false; });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (locked) lockGraceUntil = performance.now() + 180;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouseDown = true;
      // The click that acquires the lock must not count as a shot.
      if (performance.now() >= lockGraceUntil) mousePressed = true;
    } else if (e.button === 2) rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    else if (e.button === 2) rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  return {
    get locked() { return locked; },
    lock() {
      if (locked) return;
      try {
        const r = canvas.requestPointerLock?.();
        if (r && r.catch) r.catch(() => {});
      } catch { /* pointer lock unavailable (headless, denied) */ }
    },
    unlock() { if (locked) document.exitPointerLock?.(); },
    isDown(code) { return held.has(code); },
    // -1..1 pairs for movement and driving.
    axis(neg, pos) { return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0); },
    wasPressed(code) { return pressed.has(code); },
    get mouseDown() { return mouseDown; },
    get mousePressed() { return mousePressed; },
    get rightDown() { return rightDown; },
    get anyKey() { return anyKey; },
    takeMouse() { const d = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return d; },
    takeWheel() { const w = wheel; wheel = 0; return w; },
    endFrame() { pressed.clear(); mousePressed = false; anyKey = false; },
    // Test hooks: pretend a key is held or pressed without a real event.
    debugHold(code, on) { if (on) held.add(code); else held.delete(code); },
    debugPress(code) { pressed.add(code); },
  };
}
