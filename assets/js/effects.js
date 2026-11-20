/*!
 * Juleeffekter: blinkende stjerner, stjerneskudd, julenissen som flyr forbi
 * og gnister når man klikker. Alt er dekorasjon (pointer-events: none),
 * pauses når fanen er skjult, og slås av ved «redusert bevegelse».
 */
(function (global) {
  'use strict';

  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.matches) return;

  var doc = document;
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  function el(cls, parent) {
    var e = doc.createElement('div');
    e.className = cls;
    e.setAttribute('aria-hidden', 'true');
    (parent || doc.body).appendChild(e);
    return e;
  }

  /* ---------------- Blinkende stjerner på himmelen ---------------- */
  var sky = el('fx-sky');
  var count = Math.round(Math.min(70, Math.max(28, global.innerWidth / 18)));
  for (var i = 0; i < count; i++) {
    var s = doc.createElement('i');
    var size = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1.4;
    s.style.cssText =
      'left:' + rand(0, 100).toFixed(2) + '%;top:' + Math.pow(Math.random(), 1.6).toFixed(3) * 70 + 'vh;' +
      'width:' + size + 'px;height:' + size + 'px;' +
      'animation-delay:' + rand(0, 6).toFixed(2) + 's;animation-duration:' + rand(2.5, 6).toFixed(2) + 's';
    sky.appendChild(s);
  }

  /* ---------------- Stjerneskudd ---------------- */
  function shootingStar() {
    var st = el('fx-shoot');
    st.style.left = rand(8, 70) + 'vw';
    st.style.top = rand(4, 32) + 'vh';
    st.style.setProperty('--angle', rand(12, 28).toFixed(1) + 'deg');
    setTimeout(function () { st.remove(); }, 1600);
  }

  /* ---------------- Julenissen i sleden ---------------- */
  var SLEIGH =
    '<svg viewBox="0 0 260 70" aria-hidden="true">' +
    '<g fill="currentColor">' +
    // reinsdyr 1 (først, flyr mot venstre)
    '<ellipse cx="34" cy="32" rx="15" ry="7"/><path d="M22 28l-8-8-4 2 6 9z"/><circle cx="11" cy="21" r="4"/>' +
    '<path d="M11 17l2-8m-2 8-4-7m5 1 3-3m-6 1-4-3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M24 36l-9 7m14-6-6 9m19-9 6 8m-12-8 2 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="7" cy="21" r="1.8" fill="#ff5a6e"/>' +
    // reinsdyr 2
    '<ellipse cx="84" cy="36" rx="15" ry="7"/><path d="M72 32l-8-8-4 2 6 9z"/><circle cx="61" cy="25" r="4"/>' +
    '<path d="M61 21l2-8m-2 8-4-7m5 1 3-3m-6 1-4-3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M74 40l-9 7m14-6-6 9m19-9 6 8m-12-8 2 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    // tømmer
    '<path d="M150 44 C125 40 112 36 100 34 M150 44 C110 40 70 34 50 30" stroke="currentColor" stroke-width="1" fill="none" opacity=".7"/>' +
    // slede med nissen
    '<path d="M146 38h62c8 0 12-6 12-14h6c0 12-7 22-20 22h-58z"/>' +
    '<path d="M140 56c4 4 10 5 18 5h64c8 0 13-4 15-9" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M162 46v10m40-10v10" stroke="currentColor" stroke-width="2.2"/>' +
    '<rect x="196" y="22" width="18" height="16" rx="3" opacity=".85"/>' +
    '<path d="M166 38c0-12 6-18 12-18s12 6 12 18z"/><circle cx="178" cy="16" r="6"/>' +
    '<path d="M172 13c2-8 10-10 16-6l4 6-6-1z"/><circle cx="193" cy="12" r="2.2"/>' +
    '</g></svg>';

  var sleighTimer = null, trailTimer = null, flying = false;
  function flySleigh() {
    if (flying || doc.hidden) return;
    flying = true;
    var wrap = el('fx-sleigh');
    var dur = rand(15, 20);
    wrap.style.top = rand(7, 22) + 'vh';
    wrap.style.animationDuration = dur + 's';
    wrap.innerHTML = '<div class="fx-sleigh__bob">' + SLEIGH + '</div>';
    if (global.Jul && Jul.music) Jul.music.jingle();
    // Glitrende spor etter sleden
    trailTimer = setInterval(function () {
      var r = wrap.getBoundingClientRect();
      if (r.right < 0 || r.left > global.innerWidth) return;
      var p = el('fx-trail');
      p.style.left = (r.left + r.width * 0.92 + rand(-6, 6)) + 'px'; // bak sleden
      p.style.top = (r.top + r.height * 0.7 + rand(-4, 4)) + 'px';
      setTimeout(function () { p.remove(); }, 1800);
    }, 90);
    setTimeout(function () {
      clearInterval(trailTimer);
      wrap.remove();
      flying = false;
    }, dur * 1000 + 200);
  }

  /* ---------------- Gnister når man klikker ---------------- */
  var COLORS = ['#f2d89b', '#ffd36b', '#e25a6f', '#5fd19f', '#a9d0ff', '#ffffff'];
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      var p = el('fx-spark');
      var a = rand(0, Math.PI * 2), d = rand(30, 80);
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(a) * d - 20).toFixed(1) + 'px');
      p.style.setProperty('--c', COLORS[i % COLORS.length]);
      p.style.setProperty('--s', rand(4, 8).toFixed(1) + 'px');
      setTimeout(function (q) { return function () { q.remove(); }; }(p), 900);
    }
  }
  doc.addEventListener('pointerdown', function (ev) {
    var t = ev.target.closest && ev.target.closest('.btn--gold, .btn--primary, .tab, .brand, .music-btn, .card__title a');
    if (t) burst(ev.clientX, ev.clientY, t.classList.contains('brand') ? 22 : 12);
  }, { passive: true });

  /* ---------------- Julekulen på innloggingen ---------------- */
  Array.prototype.forEach.call(doc.querySelectorAll('.ornament'), function (orn) {
    orn.addEventListener('click', function () {
      orn.classList.remove('is-spinning');
      void orn.offsetWidth; // start animasjonen på nytt
      orn.classList.add('is-spinning');
      var r = orn.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * 0.62, 20);
      if (global.Jul && Jul.music) Jul.music.jingle();
    });
    orn.addEventListener('animationend', function (ev) {
      if (ev.animationName === 'ornamentSpin') orn.classList.remove('is-spinning');
    });
  });

  /* ---------------- Planlegging ---------------- */
  var shootTimer = null;
  function scheduleShoot() {
    shootTimer = setTimeout(function () { if (!doc.hidden) shootingStar(); scheduleShoot(); }, rand(7000, 16000));
  }
  function scheduleSleigh(first) {
    sleighTimer = setTimeout(function () { flySleigh(); scheduleSleigh(false); }, first ? rand(5000, 9000) : rand(45000, 80000));
  }
  function startAll() { scheduleShoot(); scheduleSleigh(true); }
  function stopAll() { clearTimeout(shootTimer); clearTimeout(sleighTimer); }

  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) stopAll();
    else startAll();
  });
  if (mq) {
    var onChange = function () {
      if (mq.matches) { stopAll(); sky.remove(); }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  startAll();

  // Til testing og moro: Jul.effects.sleigh() / .star() / .burst(x, y)
  global.Jul = global.Jul || {};
  global.Jul.effects = { sleigh: flySleigh, star: shootingStar, burst: function (x, y) { burst(x, y, 18); } };
})(window);
