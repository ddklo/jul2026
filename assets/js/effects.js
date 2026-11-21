/*!
 * Juleeffekter: blinkende stjerner, stjerneskudd, julenissen som flyr forbi,
 * morsomme figurer på desktop og gnister når man klikker. Alt er dekorasjon (pointer-events: none),
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
  // Vanlige skudd er små og raske. Omtrent hvert tredje er et stort, lysende skudd med glødende hode.
  function shootingStar(big) {
    if (big === undefined) big = Math.random() < 0.35;
    var st = el('fx-shoot' + (big ? ' fx-shoot--big' : ''));
    st.style.left = rand(4, big ? 55 : 70) + 'vw';
    st.style.top = rand(3, big ? 26 : 34) + 'vh';
    st.style.setProperty('--angle', rand(10, 30).toFixed(1) + 'deg');
    st.innerHTML = '<i></i>';
    setTimeout(function () { st.remove(); }, big ? 2000 : 1600);
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

  /* ---------------- Morsomme figurer (bare desktop) ----------------
   * Én om gangen, innimellom: et reinsdyr som titter fram fra kanten, en
   * pingvin som aker over snøfonnen, en pepperkakemann som løper forbi og en
   * nisse som firer seg ned i et tau. De holder seg i margene og nederst, bak
   * innholdet. Klikk på dem for litt glitter. */
  var wide = global.matchMedia ? global.matchMedia('(min-width: 1024px) and (hover: hover)') : null;

  var REINDEER =
    '<svg viewBox="0 0 130 150">' +
    '<g stroke="#7a4a22" stroke-width="5" stroke-linecap="round" fill="none">' +
    '<path d="M44 52 36 22M38 32 24 24M37 26 42 10"/><path d="M64 50 74 18M72 28 88 22M73 22 68 6"/></g>' +
    '<path d="M0 150V94q24-12 46 4l12 52z" fill="#8f5f33"/>' +
    '<ellipse cx="54" cy="80" rx="34" ry="30" fill="#9b6a3c"/>' +
    '<ellipse cx="26" cy="58" rx="12" ry="6" fill="#8f5f33" transform="rotate(-30 26 58)"/>' +
    '<ellipse cx="84" cy="94" rx="24" ry="17" fill="#c99b6b"/>' +
    '<circle cx="62" cy="72" r="8" fill="#fff"/><circle class="fx-eye" cx="65" cy="72" r="4" fill="#1b1b1b"/>' +
    '<path d="M76 106q8 6 16 0" stroke="#5a3417" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<circle class="fx-nose" cx="103" cy="89" r="10" fill="#e0283f"/><circle cx="100" cy="85" r="3" fill="#ff9aa8"/>' +
    '</svg>';

  var PENGUIN =
    '<svg viewBox="0 0 124 54">' +
    '<ellipse cx="22" cy="44" rx="9" ry="4" fill="#f29a2e" transform="rotate(-20 22 44)"/>' +
    '<ellipse cx="14" cy="38" rx="9" ry="4" fill="#f29a2e" transform="rotate(-35 14 38)"/>' +
    '<ellipse cx="58" cy="32" rx="46" ry="17" fill="#1d2433"/>' +
    '<ellipse cx="60" cy="39" rx="38" ry="10" fill="#f4f1ea"/>' +
    '<ellipse cx="54" cy="22" rx="16" ry="5" fill="#141a26" transform="rotate(-12 54 22)"/>' +
    '<circle cx="100" cy="24" r="14" fill="#1d2433"/>' +
    '<path d="M86 30q14 6 26-2l2 6q-14 8-30 2z" fill="#d6283d"/><path d="M90 34l-8 12 6 1 6-11z" fill="#b51f31"/>' +
    '<circle cx="104" cy="19" r="4" fill="#fff"/><circle cx="105.5" cy="19" r="2" fill="#111"/>' +
    '<path d="M112 22l11 3-11 4z" fill="#f29a2e"/>' +
    '</svg>';

  var GINGER =
    '<svg viewBox="0 0 64 84">' +
    '<g class="fx-leg fx-leg--a"><path d="M24 54l-8 24" stroke="#b8743a" stroke-width="12" stroke-linecap="round"/></g>' +
    '<g class="fx-leg fx-leg--b"><path d="M40 54l8 24" stroke="#b8743a" stroke-width="12" stroke-linecap="round"/></g>' +
    '<path d="M10 36l44 0" stroke="#b8743a" stroke-width="11" stroke-linecap="round"/>' +
    '<ellipse cx="32" cy="46" rx="14" ry="16" fill="#b8743a"/>' +
    '<circle cx="32" cy="18" r="14" fill="#b8743a"/>' +
    '<circle cx="27" cy="15" r="2.2" fill="#3b2412"/><circle cx="37" cy="15" r="2.2" fill="#3b2412"/>' +
    '<path d="M26 22q6 5 12 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M8 32q2 4 0 8M56 32q-2 4 0 8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<circle cx="32" cy="40" r="2.6" fill="#e0283f"/><circle cx="32" cy="48" r="2.6" fill="#3fbf7f"/><circle cx="32" cy="56" r="2.6" fill="#e0283f"/>' +
    '</svg>';

  var NISSE =
    '<svg viewBox="0 0 80 110">' +
    '<path d="M22 30 40 0l18 30z" fill="#d6283d"/><circle cx="40" cy="2" r="5" fill="#fff"/>' +
    '<rect x="18" y="27" width="44" height="9" rx="4.5" fill="#fff"/>' +
    '<circle cx="40" cy="44" r="12" fill="#f2c9a0"/>' +
    '<circle cx="35" cy="42" r="1.8" fill="#222"/><circle cx="45" cy="42" r="1.8" fill="#222"/><circle cx="40" cy="47" r="2.4" fill="#e88f7f"/>' +
    '<path d="M27 45q0 24 13 26q13-2 13-26q-5 7-13 7t-13-7z" fill="#fff"/>' +
    '<path d="M35 51q5 3 10 0" stroke="#c46a5c" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M22 70q18-10 36 0v26H22z" fill="#d6283d"/><rect x="22" y="82" width="36" height="6" fill="#222"/><rect x="36" y="82" width="8" height="6" fill="#f0c24a"/>' +
    '<g class="fx-wave"><path d="M58 74l14-16" stroke="#d6283d" stroke-width="8" stroke-linecap="round"/><circle cx="73" cy="56" r="5" fill="#fff"/></g>' +
    '<path d="M22 74 10 60" stroke="#d6283d" stroke-width="8" stroke-linecap="round"/><circle cx="8" cy="58" r="5" fill="#fff"/>' +
    '<path d="M28 96v10M52 96v10" stroke="#222" stroke-width="8" stroke-linecap="round"/>' +
    '</svg>';

  /** Plassen i margen ved siden av innholdet (px), og om figuren skal til venstre. */
  function margin() {
    var main = doc.querySelector('.main, .chooser, main');
    var w = 1160;
    if (main) {
      var cs = global.getComputedStyle(main);
      w = main.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    }
    return Math.max(0, (global.innerWidth - Math.min(w, global.innerWidth)) / 2);
  }

  function critter(cls, html, ms) {
    var c = el('fx-critter ' + cls);
    c.innerHTML = html;
    c.addEventListener('pointerdown', function (ev) {
      burst(ev.clientX, ev.clientY, 16);
      if (global.Jul && Jul.music) Jul.music.jingle();
      c.classList.add('is-poked');
    });
    setTimeout(function () { c.remove(); }, ms);
    return c;
  }

  var FIGURES = {
    reindeer: function () {
      if (margin() < 110) return false;
      var c = critter('fx-reindeer' + (Math.random() < 0.5 ? ' fx-right' : ''), REINDEER, 7200);
      c.style.top = rand(34, 62) + 'vh';
      return true;
    },
    penguin: function () {
      var rtl = Math.random() < 0.35;
      var c = critter('fx-penguin' + (rtl ? ' fx-rtl' : ''), PENGUIN, 9200);
      // Snøsprut bak pingvinen
      var spray = setInterval(function () {
        if (!c.isConnected) { clearInterval(spray); return; }
        var r = c.getBoundingClientRect();
        if (r.right < 0 || r.left > global.innerWidth) return;
        var p = el('fx-spray');
        p.style.left = (rtl ? r.right - 6 : r.left + 6) + rand(-4, 4) + 'px';
        p.style.top = (r.bottom - 8) + 'px';
        p.style.setProperty('--dx', (rtl ? 1 : -1) * rand(10, 30) + 'px');
        setTimeout(function () { p.remove(); }, 900);
      }, 70);
      return true;
    },
    ginger: function () {
      critter('fx-ginger' + (Math.random() < 0.5 ? ' fx-rtl' : ''), GINGER, 8200);
      return true;
    },
    nisse: function () {
      var m = margin();
      if (m < 100) return false;
      var right = Math.random() < 0.5;
      var c = critter('fx-nisse', '<span class="fx-rope"></span>' + NISSE, 8200);
      var x = rand(16, Math.max(18, m - 90));
      c.style[right ? 'right' : 'left'] = x + 'px';
      return true;
    }
  };
  var figureTimer = null, lastFigure = '';
  function showFigure(name) {
    if (doc.hidden || !(wide && wide.matches) || flying) return false;
    var names = Object.keys(FIGURES).filter(function (n) { return n !== lastFigure; });
    for (var tries = 0; tries < 4; tries++) {
      var pick = name || names[Math.floor(Math.random() * names.length)];
      if (FIGURES[pick]()) { lastFigure = pick; return true; }
      if (name) return false;
    }
    return false;
  }
  function scheduleFigure(first) {
    figureTimer = setTimeout(function () { showFigure(); scheduleFigure(false); }, first ? rand(12000, 20000) : rand(25000, 45000));
  }

  /* ---------------- Planlegging ---------------- */
  var shootTimer = null;
  function scheduleShoot() {
    shootTimer = setTimeout(function () {
      if (!doc.hidden) {
        shootingStar();
        // Av og til kommer to like etter hverandre
        if (Math.random() < 0.25) setTimeout(function () { shootingStar(false); }, rand(250, 700));
      }
      scheduleShoot();
    }, rand(3000, 7500));
  }
  function scheduleSleigh(first) {
    sleighTimer = setTimeout(function () { flySleigh(); scheduleSleigh(false); }, first ? rand(5000, 9000) : rand(45000, 80000));
  }
  function startAll() { scheduleShoot(); scheduleSleigh(true); scheduleFigure(true); }
  function stopAll() { clearTimeout(shootTimer); clearTimeout(sleighTimer); clearTimeout(figureTimer); }

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

  // Til testing og moro: Jul.effects.sleigh() / .star() / .burst(x, y) / .figure('reindeer' | 'penguin' | 'ginger' | 'nisse')
  global.Jul = global.Jul || {};
  global.Jul.effects = { sleigh: flySleigh, star: shootingStar, burst: function (x, y) { burst(x, y, 18); }, figure: showFigure };
})(window);
