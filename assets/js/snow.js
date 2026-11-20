/*!
 * Rolig snøfall på <canvas>, og en snøfonn som hoper seg opp nederst på
 * skjermen (på mobil oppå bunnmenyen). Lett, pauses når fanen er skjult,
 * og starter ikke når brukeren har bedt om redusert bevegelse.
 */
(function (global) {
  'use strict';

  var canvas = document.getElementById('snow');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var flakes = [];
  var w = 0, h = 0, dpr = 1;
  var raf = 0, last = 0, running = false;

  /* ---------------- Snøfonnen ---------------- */
  var COL = 3;                 // bredde per kolonne i høydeprofilen (px)
  var pile = null, pctx = null;
  var heights = new Float32Array(0);
  var maxH = 40, pileH = 48, navPx = 0, pileDirty = true;

  function createPile() {
    pile = document.createElement('canvas');
    pile.className = 'snow-pile';
    pile.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pile);
    pctx = pile.getContext('2d');
  }

  function resizePile() {
    maxH = w < 720 ? 18 : 34; // lavt nok til at innholdet bak synes
    pileH = maxH + 10;
    pile.width = Math.round(w * dpr);
    pile.height = Math.round(pileH * dpr);
    pile.style.width = w + 'px';
    pile.style.height = pileH + 'px';
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Behold fonnen ved endring av størrelse (skaler profilen til ny bredde)
    var cols = Math.ceil(w / COL) + 2;
    var old = heights;
    heights = new Float32Array(cols);
    for (var i = 0; i < cols; i++) {
      if (old.length) heights[i] = Math.min(maxH, old[Math.min(old.length - 1, Math.round(i * old.length / cols))]);
      else heights[i] = maxH * 0.14 + Math.sin(i * 0.11) * 1.5 + Math.sin(i * 0.031) * 2.5; // et tynt lag å begynne med
    }
    var nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav')) || 0;
    navPx = nav;
    pileDirty = true;
  }

  /** Bakken snøfnuggene lander på (y i skjermkoordinater). */
  function ground() {
    return h - (document.body.classList.contains('is-locked') ? 0 : navPx);
  }

  /** Et snøfnugg lander: legg snø i kolonnen og litt til sidene. */
  function deposit(x, r) {
    var c = Math.max(0, Math.min(heights.length - 1, Math.round(x / COL)));
    var amount = r * 4.5;
    for (var k = -5; k <= 5; k++) {
      var i = c + k;
      if (i < 0 || i >= heights.length) continue;
      var room = 1 - heights[i] / maxH;
      if (room <= 0) continue;
      heights[i] += amount * (1 - Math.abs(k) / 6) * room;
    }
    pileDirty = true;
  }

  /** Snøen setter seg: jevner ut bratte kanter litt for hver frame. */
  function settle() {
    for (var i = 1; i < heights.length - 1; i++) {
      var d = (heights[i - 1] + heights[i + 1] - 2 * heights[i]) * 0.04;
      if (d > 0.002 || d < -0.002) { heights[i] += d; pileDirty = true; }
    }
  }

  function drawPile() {
    if (!pileDirty) return;
    pileDirty = false;
    pctx.clearRect(0, 0, w, pileH);
    pctx.beginPath();
    pctx.moveTo(0, pileH);
    for (var i = 0; i < heights.length; i++) pctx.lineTo(i * COL, pileH - heights[i]);
    pctx.lineTo(w, pileH);
    pctx.closePath();
    var g = pctx.createLinearGradient(0, pileH - maxH, 0, pileH);
    g.addColorStop(0, 'rgba(253, 252, 248, 0.96)');
    g.addColorStop(0.55, 'rgba(232, 238, 246, 0.94)');
    g.addColorStop(1, 'rgba(206, 218, 234, 0.92)');
    pctx.fillStyle = g;
    pctx.shadowColor = 'rgba(160, 190, 230, 0.35)';
    pctx.shadowBlur = 10;
    pctx.fill();
    pctx.shadowBlur = 0;
    // Lys kant på toppen av fonnen
    pctx.beginPath();
    for (var j = 0; j < heights.length; j++) pctx.lineTo(j * COL, pileH - heights[j] + 0.5);
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    pctx.lineWidth = 1;
    pctx.stroke();
  }

  /* ---------------- Snøfallet ---------------- */
  function resize() {
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    w = global.innerWidth;
    h = global.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var target = Math.round(Math.min(120, Math.max(36, (w * h) / 13000)));
    while (flakes.length < target) flakes.push(make(true));
    if (flakes.length > target) flakes.length = target;
    if (pile) resizePile();
  }

  function make(anywhere) {
    var depth = Math.random(); // 0 = langt unna, 1 = nær
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -10,
      r: 0.6 + depth * 2.1,
      vy: 12 + depth * 38, // px per sekund
      sway: 6 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      freq: 0.3 + Math.random() * 0.6,
      a: 0.25 + depth * 0.55,
      lands: depth > 0.15 // de fleste fnuggene legger seg i fonnen
    };
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    var floor = ground();
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt;
      f.phase += f.freq * dt;
      var x = f.x + Math.sin(f.phase) * f.sway;
      if (f.lands && pile) {
        var c = Math.max(0, Math.min(heights.length - 1, Math.round(x / COL)));
        if (f.y + f.r >= floor - heights[c]) {
          deposit(x, f.r);
          flakes[i] = make(false);
          continue;
        }
      }
      if (f.y > h + 10) {
        flakes[i] = make(false);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = 'rgba(240, 236, 226,' + f.a + ')';
      ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pile) {
      settle();
      drawPile();
    }
    raf = global.requestAnimationFrame(frame);
  }

  function start() {
    if (running || (mq && mq.matches) || document.hidden) return;
    running = true;
    last = 0;
    canvas.style.opacity = '';
    if (pile) pile.style.display = '';
    raf = global.requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    global.cancelAnimationFrame(raf);
  }

  if (!(mq && mq.matches)) createPile();
  resize();
  global.addEventListener('resize', function () {
    resize();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });
  if (mq) {
    var onChange = function () {
      if (mq.matches) {
        stop();
        ctx.clearRect(0, 0, w, h);
        if (pile) pile.style.display = 'none';
      } else {
        if (!pile) { createPile(); resizePile(); }
        start();
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  start();
})(window);
