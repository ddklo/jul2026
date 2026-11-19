/*!
 * Rolig snøfall på <canvas>. Lett, pauses når fanen er skjult,
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
      a: 0.25 + depth * 0.55
    };
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt;
      f.phase += f.freq * dt;
      var x = f.x + Math.sin(f.phase) * f.sway;
      if (f.y > h + 10) {
        flakes[i] = make(false);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = 'rgba(240, 236, 226,' + f.a + ')';
      ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = global.requestAnimationFrame(frame);
  }

  function start() {
    if (running || (mq && mq.matches) || document.hidden) return;
    running = true;
    last = 0;
    canvas.style.opacity = '';
    raf = global.requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    global.cancelAnimationFrame(raf);
  }

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
      } else start();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  start();
})(window);
