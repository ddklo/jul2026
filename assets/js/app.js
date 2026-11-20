/*!
 * Juleønsker 2026 – nettsiden.
 */
(function (global) {
  'use strict';

  var Jul = global.Jul;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  function rm() { return !!(reducedMotion && reducedMotion.matches); }

  var state = {
    list: null,      // { id, name } – hvilken ønskeliste siden viser (body data-list)
    admin: false,    // innlogget med administratorpassordet
    data: null,      // Promise med { title, list, people, wishes }
    people: [],
    wishes: [],
    current: null,
    rendered: false
  };

  /* ---------------- Små hjelpere ---------------- */
  function hydrateIcons(root) {
    $$('[data-icon]', root).forEach(function (el) {
      if (!el.firstElementChild) el.innerHTML = Jul.icon(el.getAttribute('data-icon'));
    });
  }

  function renderLights() {
    $$('.lights').forEach(function (el) {
      var html = '';
      for (var i = 0; i < 44; i++) {
        var d = ((i * 0.77) % 3.1).toFixed(2);
        var dur = (2.4 + ((i * 1.3) % 1.8)).toFixed(2);
        html += '<i style="--i:' + i + ';--d:' + d + 's;--t:' + dur + 's"></i>';
      }
      el.innerHTML = html;
    });
  }

  function genitive(name) {
    return /[sxz]$/i.test(name) ? name + '’' : name + 's';
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 3200);
  }

  function countdown() {
    var el = $('#countdown');
    var now = new Date();
    var y = now.getFullYear();
    var today = new Date(y, now.getMonth(), now.getDate());
    var eve = new Date(y, 11, 24);
    var text;
    if (now.getMonth() === 11 && now.getDate() === 24) text = 'God jul!';
    else if (now.getMonth() === 11 && now.getDate() > 24) text = 'God jul og godt nyttår';
    else {
      var days = Math.round((eve - today) / 86400000);
      text = plural(days, 'dag', 'dager') + ' til julaften';
    }
    el.innerHTML = Jul.icon('snowflake') + '<span>' + text + '</span>';
  }

  /* ---------------- Innlogging ---------------- */
  function setLoginError(msg) {
    var e = $('#login-error');
    e.textContent = msg || '';
    if (msg) {
      var card = $('.login__card');
      card.classList.remove('shake');
      void card.offsetWidth; // start animasjonen på nytt
      card.classList.add('shake');
    }
  }

  function setLoading(on) {
    var btn = $('#login-btn');
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
    $('.btn__label', btn).textContent = on ? 'Pakker opp …' : 'Lås opp ønskelistene';
  }

  function initLogin() {
    var pw = $('#password');
    var toggle = $('#toggle-pw');
    toggle.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Skjul passord' : 'Vis passord');
      toggle.innerHTML = Jul.icon(show ? 'eyeOff' : 'eye');
      pw.focus();
    });

    $('#login-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var value = pw.value;
      if (!value) {
        setLoginError('Skriv inn passordet.');
        pw.focus();
        return;
      }
      setLoginError('');
      setLoading(true);
      Promise.all([Jul.auth.check(value), state.data]).then(
        function (res) {
          var role = res[0];
          if (!role) {
            setLoading(false);
            setLoginError('Feil passord – prøv igjen.');
            pw.select();
            return;
          }
          Jul.auth.save(role, $('#remember').checked);
          unlock(res[1], role, true);
        },
        function (err) {
          if (global.console) console.error(err);
          setLoading(false);
          setLoginError('Fant ikke ønskelistene. Prøv å laste siden på nytt.');
        }
      );
    });
  }

  function showLogin() {
    document.body.classList.remove('is-checking');
    setTimeout(function () {
      if (!matchMedia('(pointer: coarse)').matches) $('#password').focus();
    }, 50);
  }

  function unlock(data, role, animate) {
    state.people = (data.people && data.people.length ? data.people : Jul.DEFAULT_PEOPLE).slice();
    state.wishes = (data.wishes || []).slice();
    state.list = data.list;
    state.admin = role === 'admin';
    document.body.classList.toggle('is-admin', state.admin);
    $('#list-name').textContent = data.list.name;
    var admin = $('#admin-link');
    admin.hidden = !state.admin;
    admin.href = editUrl();

    var login = $('#login');
    var app = $('#app');
    app.hidden = false;
    buildTabs();
    route(true);

    document.body.classList.remove('is-checking');
    if (animate && !rm()) {
      login.classList.add('is-leaving');
      document.body.classList.add('is-entering');
      setTimeout(function () {
        login.hidden = true;
        document.body.classList.remove('is-locked', 'is-entering');
      }, 650);
    } else {
      login.hidden = true;
      document.body.classList.remove('is-locked');
    }
    requestAnimationFrame(moveIndicator);
  }

  function logout() {
    Jul.auth.clear();
    global.location.hash = '';
    global.location.reload();
  }

  /* ---------------- Faner og ruting ---------------- */
  function countFor(id) {
    var n = 0;
    state.wishes.forEach(function (w) { if (w.person === id) n++; });
    return n;
  }

  function buildTabs() {
    var tabs = $('#tabs');
    var html = '<span class="tabs__indicator" aria-hidden="true"></span>';
    state.people.forEach(function (p) {
      var n = countFor(p.id);
      html +=
        '<button class="tab" role="tab" type="button" id="tab-' + Jul.escape(p.id) + '" data-person="' + Jul.escape(p.id) +
        '" aria-selected="false" aria-controls="main" tabindex="-1" style="--accent:' + Jul.escape(p.accent || '#d9b26a') + '">' +
        '<span class="tab__avatar" aria-hidden="true">' + Jul.escape((p.name || '?').charAt(0)) +
        '<span class="tab__bubble">' + n + '</span></span>' +
        '<span class="tab__name">' + Jul.escape(p.name) + '</span>' +
        '<span class="tab__count" aria-label="' + plural(n, 'ønske', 'ønsker') + '">' + n + '</span>' +
        '</button>';
    });
    tabs.innerHTML = html;

    tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('.tab');
      if (!b) return;
      goTo(b.getAttribute('data-person'));
    });
    tabs.addEventListener('keydown', function (ev) {
      var keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
      if (!(ev.key in keys)) return;
      ev.preventDefault();
      var idx = indexOf(state.current);
      var k = keys[ev.key];
      var next = k === 'first' ? 0 : k === 'last' ? state.people.length - 1 : (idx + k + state.people.length) % state.people.length;
      goTo(state.people[next].id);
      var t = $('#tab-' + state.people[next].id);
      if (t) t.focus();
    });
  }

  function indexOf(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return i;
    return -1;
  }

  function personById(id) {
    return state.people[indexOf(id)] || null;
  }

  function goTo(id) {
    if (id === state.current) {
      render(false);
      return;
    }
    if (('#' + id) === global.location.hash) route(false);
    else global.location.hash = id;
  }

  function route(first) {
    var id = decodeURIComponent((global.location.hash || '').replace(/^#\/?/, '')).toLowerCase();
    if (indexOf(id) === -1) id = state.people.length ? state.people[0].id : null;
    if (!id) return;
    showPerson(id, first);
  }

  function showPerson(id, first) {
    var prev = indexOf(state.current);
    var next = indexOf(id);
    var changed = id !== state.current;
    state.current = id;

    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-person') === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('is-active', on);
    });
    var p = personById(id);
    document.documentElement.style.setProperty('--person', (p && p.accent) || '#d9b26a');
    document.title = (p ? genitive(p.name) + ' ønskeliste · ' : '') + state.list.name + ' · Juleønsker 2026';
    moveIndicator();

    if (first || !changed || rm()) {
      render(true);
      return;
    }
    transition(next > prev ? 1 : -1, function () {
      render(true);
    });
    keepTabsInView();
  }

  function transition(dir, fn) {
    var els = $$('.swap');
    els.forEach(function (el) {
      el.style.setProperty('--dir', dir);
      el.classList.add('is-out');
    });
    setTimeout(function () {
      fn();
      els.forEach(function (el) { el.classList.remove('is-out'); });
    }, 170);
  }

  function keepTabsInView() {
    var main = $('#main');
    var top = main.getBoundingClientRect().top + global.scrollY - tabsOffset();
    if (global.scrollY > top + 4) {
      global.scrollTo({ top: top, behavior: rm() ? 'auto' : 'smooth' });
    }
  }

  function tabsOffset() {
    var tabs = $('.tabs');
    // På mobil ligger fanene nederst; da trengs bare litt luft
    return getComputedStyle(tabs).position === 'fixed' ? 16 : tabs.offsetHeight + 12;
  }

  function moveIndicator() {
    var active = $('.tab.is-active');
    var ind = $('.tabs__indicator');
    if (!active || !ind) return;
    ind.style.width = active.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    ind.style.opacity = '1';
  }

  /* ---------------- Visning ---------------- */
  function render(animate) {
    var list = state.wishes.filter(function (w) { return w.person === state.current; });
    renderHead(list);
    renderGrid(list, animate);
    state.rendered = true;
  }

  function renderHead(scope) {
    var head = $('#person-head');
    var e = Jul.escape;
    var p = personById(state.current);
    if (!p) { head.innerHTML = ''; return; }
    var min = 0, max = 0;
    scope.forEach(function (w) {
      var a = +w.priceMin || +w.priceMax || 0;
      var b = +w.priceMax || +w.priceMin || 0;
      if (a && (!min || a < min)) min = a;
      if (b && b > max) max = b;
    });
    var stats = [plural(scope.length, 'ønske', 'ønsker')];
    var range = Jul.formatPrice(min, max);
    if (scope.length && range) stats.push(range);

    head.innerHTML =
      '<div class="ph" style="--accent:' + e(p.accent || '#d9b26a') + '">' +
      '<span class="ph__avatar" aria-hidden="true">' + e((p.name || '?').charAt(0)) + '</span>' +
      '<div class="ph__text"><p class="eyebrow">Ønskelisten til</p>' +
      '<h2 class="ph__title">' + e(p.name) + '</h2>' +
      '<p class="ph__stats">' + stats.map(function (s) { return '<span>' + e(s) + '</span>'; }).join('') + '</p>' +
      (state.admin && scope.length > 1
        ? '<p class="ph__admin">' + Jul.icon('grip') + 'Dra i håndtaket for å endre rekkefølgen</p>'
        : '') +
      '</div>' +
      '<button type="button" class="btn btn--ghost btn--sm ph__action" data-action="share">' + Jul.icon('share') + '<span>Del lenke</span></button>' +
      '</div>';
  }

  function renderGrid(list, animate) {
    var grid = $('#grid');
    grid.classList.toggle('grid--static', !animate);

    if (!list.length) {
      var p = personById(state.current);
      grid.innerHTML =
        '<div class="empty">' + giftArt() +
        '<h3>' + Jul.escape(genitive(p ? p.name : '')) + ' ønskeliste er fortsatt tom</h3>' +
        '<p>Nissen venter spent! Ønskene dukker opp her så snart de er lagt inn – ta gjerne en titt på de andre listene så lenge.</p>' +
        '</div>';
      return;
    }
    var html = '';
    list.forEach(function (w, i) {
      html += Jul.cardHTML(w, { index: Math.min(i, 12), editUrl: state.admin ? editUrl(w.id) : '' });
    });
    grid.innerHTML = html;
  }

  /* ---------------- Administrator: rediger, flytt og slett ----------------
   * Flytting og sletting lagres med en gang til GitHub (Jul.github.saveFile).
   * Redigering skjer i redigeringsverktøyet.
   */
  function editUrl(wishId) {
    return 'editor/?liste=' + encodeURIComponent(state.list.id) + (wishId ? '&onske=' + encodeURIComponent(wishId) : '');
  }

  function wishById(id) {
    for (var i = 0; i < state.wishes.length; i++) if (state.wishes[i].id === id) return state.wishes[i];
    return null;
  }

  function updateCounts() {
    $$('.tab').forEach(function (t) {
      var n = countFor(t.getAttribute('data-person'));
      $('.tab__bubble', t).textContent = n;
      var c = $('.tab__count', t);
      c.textContent = n;
      c.setAttribute('aria-label', plural(n, 'ønske', 'ønsker'));
    });
  }

  /**
   * Lagrer listen til én person. Feiler lagringen, settes ønskene tilbake
   * til slik de var (before), så siden viser det som faktisk er lagret.
   */
  function savePerson(pid, before, what) {
    var p = personById(pid);
    var list = state.wishes.filter(function (w) { return w.person === pid; });
    toast('Lagrer …');
    return Jul.github.saveFile(
      Jul.dataPath(state.list.id, pid),
      Jul.serializeWishes(list),
      what + ' (' + state.list.name + ', ' + p.name + ')'
    ).then(function () {
      toast('Lagret. Det kan ta et minutt før andre ser endringen.');
    }, function (err) {
      state.wishes = before;
      render(false);
      updateCounts();
      toast(err && err.cancelled ? 'Ikke lagret' : 'Ble ikke lagret: ' + err.message);
    });
  }

  function deleteWish(id) {
    var w = wishById(id);
    if (!w) return;
    var p = personById(w.person);
    var ok = global.confirm('Slette «' + (w.title || 'Uten navn') + '» fra ' + genitive(p.name) + ' liste i ' + state.list.name + '?\n\nDette kan ikke angres.');
    if (!ok) return;
    var before = state.wishes.slice();
    state.wishes = state.wishes.filter(function (x) { return x !== w; });
    render(false);
    updateCounts();
    savePerson(w.person, before, 'Slett «' + (w.title || 'Uten navn') + '»');
  }

  /** Ny rekkefølge for gjeldende person, ut fra kortene i rutenettet. */
  function applyOrder(ids) {
    var pid = state.current;
    var mine = state.wishes.filter(function (w) { return w.person === pid; });
    var same = mine.every(function (w, i) { return w.id === ids[i]; });
    if (same) return;
    var before = state.wishes.slice();
    var sorted = ids.map(wishById);
    // Bytt ut personens ønsker i samme plasser i den samlede listen
    var k = 0;
    state.wishes = state.wishes.map(function (w) { return w.person === pid ? sorted[k++] : w; });
    savePerson(pid, before, 'Endre rekkefølge');
  }

  /**
   * Dra og slipp med pekerhendelser (mus og berøring). Kortet flyttes i
   * rutenettet mens du drar; rekkefølgen lagres når du slipper.
   */
  function initSorting() {
    var grid = $('#grid');
    var drag = null;

    grid.addEventListener('pointerdown', function (ev) {
      var grip = ev.target.closest('[data-admin="drag"]');
      if (!grip || !state.admin || ev.button > 0) return;
      ev.preventDefault();
      var card = grip.closest('.card');
      drag = { card: card, id: ev.pointerId, y: ev.clientY };
      try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* uten capture går det også */ }
      card.classList.add('is-dragging');
      document.body.classList.add('is-sorting');
      requestAnimationFrame(autoScroll);
    });

    grid.addEventListener('pointermove', function (ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      drag.y = ev.clientY;
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var target = el && el.closest('.card');
      if (!target || target === drag.card || target.parentNode !== grid) return;
      var cards = $$('.card', grid);
      var after = cards.indexOf(target) > cards.indexOf(drag.card);
      grid.insertBefore(drag.card, after ? target.nextSibling : target);
    });

    function end(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      drag.card.classList.remove('is-dragging');
      document.body.classList.remove('is-sorting');
      var ids = cardIds();
      drag = null;
      applyOrder(ids);
    }
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);

    // Rull siden når du drar nær kanten av skjermen (over bunnmenyen på mobil)
    function autoScroll() {
      if (!drag) return;
      var edge = 70;
      var bottom = global.innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav')) || 0);
      if (drag.y < edge) global.scrollBy(0, -12);
      else if (drag.y > bottom - edge) global.scrollBy(0, 12);
      requestAnimationFrame(autoScroll);
    }

    // Tastatur: piltaster på håndtaket flytter kortet ett steg
    grid.addEventListener('keydown', function (ev) {
      var grip = ev.target.closest('[data-admin="drag"]');
      if (!grip) return;
      var dir = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[ev.key];
      if (!dir) return;
      ev.preventDefault();
      var card = grip.closest('.card');
      var cards = $$('.card', grid);
      var other = cards[cards.indexOf(card) + dir];
      if (!other) return;
      grid.insertBefore(card, dir > 0 ? other.nextSibling : other);
      grip.focus();
      applyOrder(cardIds());
    });

    function cardIds() {
      return $$('.card', grid).map(function (c) { return c.getAttribute('data-id'); });
    }
  }

  function giftArt() {
    return (
      '<svg class="empty__gift" viewBox="0 0 160 160" aria-hidden="true">' +
      '<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e2335"/><stop offset="1" stop-color="#4f0f1c"/></linearGradient>' +
      '<linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d595"/><stop offset="1" stop-color="#b8893b"/></linearGradient></defs>' +
      '<ellipse cx="80" cy="146" rx="46" ry="6" fill="#000" opacity=".35"/>' +
      '<rect x="34" y="66" width="92" height="76" rx="8" fill="url(#gb)"/>' +
      '<rect x="26" y="52" width="108" height="24" rx="6" fill="#a42a3f"/>' +
      '<rect x="72" y="52" width="16" height="90" fill="url(#gr)"/>' +
      '<path d="M80 52c-10-22-38-26-36-8 2 12 24 10 36 8Z" fill="none" stroke="url(#gr)" stroke-width="7" stroke-linejoin="round"/>' +
      '<path d="M80 52c10-22 38-26 36-8-2 12-24 10-36 8Z" fill="none" stroke="url(#gr)" stroke-width="7" stroke-linejoin="round"/>' +
      '<g class="empty__sparkle" fill="#f3d595"><path d="M138 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M22 40l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/></g>' +
      '</svg>'
    );
  }

  /* ---------------- Deling ---------------- */
  function shareCurrent() {
    var p = personById(state.current);
    if (!p) return;
    var url = global.location.href.split('#')[0] + '#' + p.id;
    var title = genitive(p.name) + ' ønskeliste';
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    if (navigator.share && coarse) {
      navigator.share({ title: title, text: title + ' – jul 2026 (passord trengs)', url: url }).catch(function () {});
      return;
    }
    copyText(url).then(
      function () { toast('Lenken til ' + genitive(p.name) + ' liste er kopiert'); },
      function () { global.prompt('Kopier lenken:', url); }
    );
  }

  function copyText(text) {
    if (navigator.clipboard && global.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  /* ---------------- Kontroller ---------------- */
  function initControls() {
    $('#main').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-action]');
      if (!b) return;
      var a = b.getAttribute('data-action');
      if (a === 'share') shareCurrent();
    });
    $('#main').addEventListener('click', function (ev) {
      var del = ev.target.closest('[data-admin="delete"]');
      if (del && state.admin) deleteWish(del.closest('.card').getAttribute('data-id'));
    });
    initSorting();

    $('#logout').addEventListener('click', logout);
    $('#footer-logout').addEventListener('click', logout);
    $('#brand').addEventListener('click', function (ev) {
      ev.preventDefault();
      scrollTop();
    });

    var toTop = $('#to-top');
    function scrollTop() { global.scrollTo({ top: 0, behavior: rm() ? 'auto' : 'smooth' }); }
    toTop.addEventListener('click', scrollTop);
    $('#footer-top').addEventListener('click', scrollTop);

    var ticking = false;
    global.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = global.scrollY;
        toTop.classList.toggle('is-visible', y > 600);
        document.body.classList.toggle('is-scrolled', y > 8);
      });
    }, { passive: true });

    global.addEventListener('resize', moveIndicator);
    global.addEventListener('hashchange', function () { route(false); });

    // Sveip mellom personer på mobil
    var sx = 0, sy = 0, st = 0, track = false;
    var main = $('#main');
    main.addEventListener('touchstart', function (ev) {
      var t = ev.target;
      track = !t.closest('button, a');
      if (!track) return;
      sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; st = Date.now();
    }, { passive: true });
    main.addEventListener('touchend', function (ev) {
      if (!track) return;
      var dx = ev.changedTouches[0].clientX - sx;
      var dy = ev.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - st < 600) {
        var i = indexOf(state.current) + (dx < 0 ? 1 : -1);
        if (i >= 0 && i < state.people.length) goTo(state.people[i].id);
      }
    }, { passive: true });
  }

  /* ---------------- Oppstart ---------------- */
  function init() {
    hydrateIcons(document);
    renderLights();
    countdown();
    Jul.installImageFallback(document);
    initLogin();
    initControls();

    if (!Jul.auth.available()) {
      showLogin();
      setLoginError('Nettleseren din støtter ikke innloggingen her. Åpne siden via https i en oppdatert nettleser.');
      $('#login-btn').disabled = true;
      return;
    }

    document.body.classList.add('is-checking');
    state.data = Jul.loadData(document.body.getAttribute('data-list'));
    var role = Jul.auth.load();
    state.data.then(
      function (data) {
        if (role) unlock(data, role, false);
        else showLogin();
      },
      function (err) {
        if (global.console) console.error(err);
        showLogin();
        setLoginError('Fant ikke ønskelistene: ' + (err && err.message ? err.message : err));
      }
    );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
