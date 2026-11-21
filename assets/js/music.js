/*!
 * Julemusikk i bakgrunnen, spilt som spilledåse med Web Audio.
 * Ingen lydfiler: melodiene er klassiske julesanger som er falt i det fri,
 * og lyden lages i nettleseren. Knappen nederst til venstre demper musikken,
 * og valget huskes på enheten.
 *
 * Nettlesere tillater ikke lyd før brukeren har klikket eller trykket på noe,
 * så musikken starter ved første klikk (for eksempel «Lås opp»).
 */
(function (global) {
  'use strict';

  var Jul = (global.Jul = global.Jul || {});
  var AC = global.AudioContext || global.webkitAudioContext;
  var KEY = 'jul-music';
  var VOLUME = 0.32;

  /* ---------------- Melodier (notenavn:varighet i slag) ---------------- */
  var SONGS = [
    { // Jingle Bells (J. Pierpont, 1857)
      beat: 0.3, notes:
      'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | ' +
      'E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | ' +
      'F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | G4 G4 F4 D4 | C4:4'
    },
    { // Glade jul / Stille Nacht (F. X. Gruber, 1818) – åttendedeler
      beat: 0.24, notes:
      'G4:3 A4:1 G4:2 E4:6 | G4:3 A4:1 G4:2 E4:6 | D5:4 D5:2 B4:6 | C5:4 C5:2 G4:6 | ' +
      'A4:4 A4:2 C5:3 B4:1 A4:2 | G4:3 A4:1 G4:2 E4:6 | A4:4 A4:2 C5:3 B4:1 A4:2 | G4:3 A4:1 G4:2 E4:6 | ' +
      'D5:4 D5:2 F5:3 D5:1 B4:2 | C5:6 E5:6 | C5:3 G4:1 E4:2 G4:3 F4:1 D4:2 | C4:12'
    },
    { // We Wish You a Merry Christmas (engelsk folketone)
      beat: 0.34, notes:
      'D4 | G4 G4:.5 A4:.5 G4:.5 F#4:.5 | E4 E4 E4 | A4 A4:.5 B4:.5 A4:.5 G4:.5 | F#4 D4 D4 | ' +
      'B4 B4:.5 C5:.5 B4:.5 A4:.5 | G4 E4 D4:.5 D4:.5 | E4 A4 F#4 | G4:3'
    },
    { // Deck the Halls (walisisk folketone)
      beat: 0.3, notes:
      'G4:1.5 F4:.5 E4 D4 | C4 D4 E4 C4 | D4:.5 E4:.5 F4:.5 D4:.5 E4:1.5 D4:.5 | C4 B3 C4:2 | ' +
      'G4:1.5 F4:.5 E4 D4 | C4 D4 E4 C4 | D4:.5 E4:.5 F4:.5 D4:.5 E4:1.5 D4:.5 | C4 B3 C4:2 | ' +
      'D4:1.5 E4:.5 F4 D4 | E4:1.5 F4:.5 G4 D4 | E4:.5 F#4:.5 G4 A4:.5 B4:.5 C5 | B4 A4 G4:2 | ' +
      'G4:1.5 F4:.5 E4 D4 | C4 D4 E4 C4 | A4:.5 A4:.5 A4:.5 A4:.5 G4:1.5 F4:.5 | E4 D4 C4:2'
    }
  ];

  var STEPS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function freq(name) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(name);
    var semis = STEPS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12;
    return 440 * Math.pow(2, semis / 12);
  }
  SONGS.forEach(function (s) {
    s.parsed = s.notes.split(/\s+/).filter(function (t) { return t && t !== '|'; }).map(function (t) {
      var p = t.split(':');
      return { f: p[0] === 'R' ? 0 : freq(p[0]), d: p[1] ? parseFloat(p[1]) : 1 };
    });
  });

  /* ---------------- Lydmotor ---------------- */
  var ctx = null, master = null, bus = null, timer = null;
  var playing = false;
  var pos = { song: Math.floor(Math.random() * SONGS.length), note: 0, time: 0 };

  function setup() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Etterklang: kort, myk rom-klang laget av støy som dør ut
    var len = Math.round(ctx.sampleRate * 2.4);
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var data = ir.getChannelData(c);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    var reverb = ctx.createConvolver();
    reverb.buffer = ir;
    var wet = ctx.createGain();
    wet.gain.value = 0.32;
    reverb.connect(wet);
    wet.connect(master);

    bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(master);
    bus.connect(reverb);
  }

  /** Én spilledåse-tone: grunntone med svake overtoner og lang utklinging. */
  function pluck(t, f, vel) {
    [[1, 1], [2, 0.3], [3, 0.1], [4.16, 0.05]].forEach(function (h) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      var decay = 1.6 / Math.sqrt(h[0]);
      o.type = 'sine';
      o.frequency.value = f * h[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel * h[1], t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + decay + 0.05);
    });
  }

  function schedule() {
    while (pos.time < ctx.currentTime + 0.5) {
      var song = SONGS[pos.song];
      if (pos.note >= song.parsed.length) {
        pos.song = (pos.song + 1) % SONGS.length;
        pos.note = 0;
        pos.time += 2.4; // pause mellom sangene
        continue;
      }
      var n = song.parsed[pos.note++];
      var dur = n.d * song.beat;
      // En oktav opp gir lys spilledåse-klang; litt variasjon i anslaget
      if (n.f) pluck(pos.time, n.f * 2, 0.16 + Math.random() * 0.04);
      pos.time += dur;
    }
  }

  function start() {
    if (playing || !AC) return;
    if (!ctx) setup();
    playing = true;
    ctx.resume();
    pos.time = Math.max(pos.time, ctx.currentTime + 0.15);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 1.5);
    schedule();
    timer = setInterval(schedule, 120);
    render();
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.35);
    setTimeout(function () { if (!playing) ctx.suspend(); }, 450);
    // Fortsett fra neste sang neste gang
    pos.song = (pos.song + 1) % SONGS.length;
    pos.note = 0;
    render();
  }

  /** Bjeller når julenissen flyr forbi (bare når musikken spiller). */
  function jingle() {
    if (!playing) return;
    var t0 = ctx.currentTime + 0.05;
    for (var i = 0; i < 14; i++) {
      var t = t0 + i * 0.09 + Math.random() * 0.03;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 2600 + Math.random() * 1600;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  /* ---------------- Innstilling og knapp ---------------- */
  function wanted() {
    try { return global.localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
  }
  function remember(on) {
    try { global.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignorer */ }
  }

  var btn = null;
  function render() {
    if (!btn) return;
    var on = playing;
    btn.classList.toggle('is-playing', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Skru av julemusikken' : 'Skru på julemusikken');
    btn.title = on ? 'Skru av julemusikken' : 'Skru på julemusikken';
    btn.querySelector('.music-btn__icon').innerHTML = Jul.icon(on ? 'volume' : 'volumeOff');
  }

  function toggle() {
    if (playing) { stop(); remember(false); }
    else { remember(true); start(); }
  }

  function init() {
    if (!AC) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'music-btn';
    btn.innerHTML = '<span class="music-btn__icon"></span><span class="music-btn__eq" aria-hidden="true"><i></i><i></i><i></i></span>';
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);
    render();

    // Mobil: når listen vises, ligger knappen i topplinjen, så den ikke dekker kortene.
    // På innloggingen og på desktop flyter den nede til venstre.
    var bar = document.querySelector('.topbar__right');
    var mobile = global.matchMedia && global.matchMedia('(max-width: 719px)');
    function place() {
      var inline = bar && mobile && mobile.matches && !document.body.classList.contains('is-locked');
      if (inline && btn.parentNode !== bar) bar.insertBefore(btn, bar.firstChild);
      if (!inline && btn.parentNode !== document.body) document.body.appendChild(btn);
    }
    if (bar && mobile) {
      place();
      if (mobile.addEventListener) mobile.addEventListener('change', place);
      new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // Start ved første klikk eller tastetrykk, hvis musikken ikke er skrudd av
    function first(ev) {
      if (btn.contains(ev.target)) return; // knappen håndterer seg selv
      remove();
      if (wanted()) start();
    }
    function remove() {
      ['pointerdown', 'keydown'].forEach(function (t) { document.removeEventListener(t, first, true); });
    }
    ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, first, true); });

    // Pause når fanen er skjult
    var wasPlaying = false;
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) { wasPlaying = playing; if (playing) ctx.suspend(); }
      else if (wasPlaying && playing) ctx.resume();
    });
  }

  Jul.music = { start: start, stop: stop, toggle: toggle, jingle: jingle, isPlaying: function () { return playing; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
