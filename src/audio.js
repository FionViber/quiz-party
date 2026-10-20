/* Local audio: synthesized interaction sounds plus the supplied local BGM. */
window.NeoAudio = (function () {
  'use strict';
  const BGM_URL = 'assets/audio/BGM01.mp3';
  const BGM_GAP_MS = 15000;
  let context, bus, lastHover = 0, unlocked = false;
  let music, musicTimer, musicGeneration = 0, playPending = null;
  let gapDueAt = 0, gapRemaining = 0;
  let options = {sfx: true, music: false};
  function unlock() {
    try {
      unlocked = true;
      if (!context) {
        const Constructor = window.AudioContext || window.webkitAudioContext;
        if (Constructor) {
          context = new Constructor(); bus = context.createGain(); bus.gain.value = .12; bus.connect(context.destination);
        }
      }
      const resume = context && context.state === 'suspended' ? context.resume() : null;
      if (resume && typeof resume.then === 'function') resume.then(() => syncMusic()).catch(() => {});
      ensureMusic();
      syncMusic();
    } catch (_) { /* Audio is optional. The game remains usable without it. */ }
  }
  function ensureMusic() {
    if (music || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    music = document.createElement('audio'); music.id = 'neo-bgm'; music.preload = 'metadata'; music.src = BGM_URL;
    music.setAttribute('aria-hidden', 'true'); music.addEventListener('ended', scheduleMusic);
    music.addEventListener('error', () => clearMusicTimer());
    if (document.body && typeof document.body.appendChild === 'function') document.body.appendChild(music);
  }
  function clearMusicTimer() { if (musicTimer !== undefined) clearTimeout(musicTimer); musicTimer = undefined; gapDueAt = 0; }
  function stopMusic(resetGap = true) {
    musicGeneration++; playPending = null; clearMusicTimer(); if (resetGap) gapRemaining = 0;
    if (!music) return;
    try { music.pause(); } catch (_) {}
    if (resetGap) { try { music.currentTime = 0; } catch (_) {} }
  }
  function musicEnabled() { return !!options.music; }
  function canPlayMusic() { return unlocked && musicEnabled() && !document.hidden && (!context || context.state === 'running'); }
  function startMusic() {
    if (!canPlayMusic() || !music || playPending) return;
    const generation = musicGeneration; let result;
    try { result = music.play(); } catch (_) { return; }
    if (result && typeof result.then === 'function') {
      playPending = result;
      result.then(() => {
        if (playPending === result) playPending = null;
        // A play promise may settle after a newer request replaced it. Do not
        // pause that newer, authorised playback. If a visibility change left
        // the current element paused, reconcile the latest desired state now.
        if (generation !== musicGeneration) {
          // The operation which advanced the generation already paused the
          // element. A stale promise must never issue another pause because a
          // newer play request may now own the same audio element.
          if (canPlayMusic()) syncMusic();
          return;
        }
        if (!canPlayMusic()) {
          try { music.pause(); } catch (_) {}
        }
      }, () => { if (playPending === result) playPending = null; });
    }
  }
  function scheduleMusic() {
    clearMusicTimer(); if (!canPlayMusic() || !music) return;
    gapRemaining = BGM_GAP_MS; gapDueAt = Date.now() + gapRemaining; const generation = musicGeneration;
    musicTimer = setTimeout(() => { musicTimer = undefined; gapDueAt = 0; gapRemaining = 0; if (generation === musicGeneration) startMusic(); }, gapRemaining);
  }
  function tone(frequency, delay = 0, duration = .12, volume = .4, type = 'sine') {
    if (!context || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .009);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain); gain.connect(bus); oscillator.start(start); oscillator.stop(start + duration + .025);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function play(name) {
    if (!options.sfx || !context) return;
    if (name === 'hover') { if (performance.now() - lastHover < 100) return; lastHover = performance.now(); tone(650, 0, .045, .055); }
    if (name === 'click') { tone(380, 0, .06, .16, 'triangle'); tone(570, .026, .075, .09); }
    if (name === 'reveal') [440, 554.37, 659.25].forEach((f, i) => tone(f, i * .045, .25, .22));
    if (name === 'correct') [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * .05, .2, .2));
    if (name === 'wrong') { tone(240, 0, .12, .14, 'triangle'); tone(170, .08, .18, .12); }
    if (name === 'finish') [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .11, .4, .2));
  }
  function syncMusic() {
    ensureMusic();
    if (!musicEnabled()) { stopMusic(true); return; }
    if (document.hidden) { pauseForHidden(); return; }
    if (!music || (context && context.state !== 'running')) { try { music?.pause(); } catch (_) {} return; }
    if (gapDueAt) { gapRemaining = Math.max(0, gapDueAt - Date.now()); return; }
    if (music.paused && music.ended) scheduleMusic(); else if (music.paused) startMusic();
  }
  function pauseForHidden() {
    if (gapDueAt) gapRemaining = Math.max(0, gapDueAt - Date.now());
    if (musicTimer !== undefined) clearTimeout(musicTimer);
    musicTimer = undefined; gapDueAt = 0; musicGeneration++;
    try { music?.pause(); } catch (_) {}
  }
  function configure(v) { const wasMusic = options.music; options = {...options, ...v}; if (wasMusic && !options.music) stopMusic(true); syncMusic(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseForHidden(); }
    else if (gapRemaining && musicTimer === undefined) { gapDueAt = Date.now() + gapRemaining; const generation = musicGeneration; musicTimer = setTimeout(() => { musicTimer = undefined; gapDueAt = 0; gapRemaining = 0; if (generation === musicGeneration) startMusic(); }, gapRemaining); }
    else syncMusic();
  });
  return {unlock, configure, play};
})();
