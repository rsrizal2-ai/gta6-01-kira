// Synthesized sound for Porto Luna: every effect is built with WebAudio
// oscillators and filtered noise at run time. No audio files are shipped.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let musicGain = null, musicTimer = 0, chordIdx = 0, musicOn = false;
  let muted = false;
  const CHORDS = [[110, 164.8, 220], [87.3, 130.8, 174.6], [98, 146.8, 196], [123.5, 185, 246.9]];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Engine drone: sawtooth through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    // Police siren: sine wobbling between two tones.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenLfo = ctx.createOscillator();
    sirenLfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    sirenLfo.start();
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(master);
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function playChord(notes) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const freq of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g).connect(musicGain);
      o.start(t); o.stop(t + 2.7);
    }
  }

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
    setEngine(running, speedNorm) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(running ? 0.05 + 0.05 * speedNorm : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + 90 * speedNorm, t, 0.1);
    },
    setSiren(level) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(Math.min(0.05, 0.05 * level), ctx.currentTime, 0.2);
    },
    setMusic(on) {
      musicOn = on;
      if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.5);
    },
    update(dt) {
      if (!ctx || !musicOn) return;
      musicTimer -= dt;
      if (musicTimer <= 0) {
        playChord(CHORDS[chordIdx % CHORDS.length]);
        chordIdx++;
        musicTimer = 2.5;
      }
    },
    shot() { noise(0.14, 0.5, 2600, 'highpass'); blip(160, 0.1, 'square', 0.25, 60); },
    punch() { noise(0.09, 0.4, 300); blip(90, 0.09, 'sine', 0.3, 45); },
    crash(v) { noise(0.25, Math.min(0.6, 0.15 + v * 0.05), 500); },
    pickup() { blip(660, 0.12, 'sine', 0.25); setTimeout(() => blip(990, 0.18, 'sine', 0.25), 90); },
    charm() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 70)); },
    horn() { blip(370, 0.25, 'square', 0.16); blip(466, 0.25, 'square', 0.12); },
    click() { blip(800, 0.05, 'sine', 0.15); },
    denied() { blip(180, 0.15, 'sawtooth', 0.18, 120); },
    jingle() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110)); },
    sting() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.16), i * 160)); },
  };
}
