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
    canEdit: false,  // innlogget: kan redigere, flytte og slette
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
    if (now.getMonth() === 11 && now.getDate() >= 24) {
      el.innerHTML = Jul.icon('tree') + '<span class="countdown__big">' + (now.getDate() === 24 ? 'God jul!' : 'God jul og godt nyttår') + '</span>';
      el.setAttribute('aria-label', el.textContent);
      return;
    }
    var days = Math.round((eve - today) / 86400000);
    el.innerHTML = Jul.icon('snowflake') +
      '<span class="countdown__num">' + days + '</span>' +
      '<span class="countdown__text">' + (days === 1 ? 'dag' : 'dager') + '<br>til julaften</span>';
    el.setAttribute('aria-label', plural(days, 'dag', 'dager') + ' til julaften');
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
      Promise.all([Jul.auth.login(value, $('#remember').checked), state.data]).then(
        function (res) {
          var role = res[0];
          if (!role) {
            setLoading(false);
            setLoginError('Feil passord – prøv igjen.');
            pw.select();
            return;
          }
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
    // Familiepassordet gir bare visning. Administrator kan redigere, flytte og slette.
    state.canEdit = role === 'admin';
    document.body.classList.toggle('can-edit', state.canEdit);
    $('#list-name').textContent = data.list.name;
    $('#brand-list').textContent = data.list.name;
    var admin = $('#admin-link');
    admin.hidden = !state.canEdit;
    admin.href = editUrl();

    var login = $('#login');
    var app = $('#app');
    app.hidden = false;
    initLastVisit();
    buildTabs();
    markNewTabs();
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
  /**
   * «Nytt»: ønsker lagt til siden forrige besøk på denne enheten. Tidspunktet for
   * forrige besøk holdes fast resten av økten, så merkene ikke forsvinner når du
   * bytter person eller laster siden på nytt. Første besøk viser ingen merker.
   */
  var lastVisit = null;
  function webStorage(name) {
    try { return global[name]; } catch (e) { return null; }
  }
  function initLastVisit() {
    var key = 'jul-sist-' + state.list.id;
    var local = webStorage('localStorage'), session = webStorage('sessionStorage');
    try {
      var held = session && session.getItem(key);
      if (held === null || held === undefined) {
        held = (local && local.getItem(key)) || '';
        if (session) session.setItem(key, held);
      }
      if (local) local.setItem(key, new Date().toISOString());
      lastVisit = held ? Date.parse(held) : null;
    } catch (e) { lastVisit = null; }
  }
  var NEW_MAX_AGE = 30 * 864e5;
  function isNew(w) {
    var t = Date.parse(w && w.createdAt);
    return !!(lastVisit && t > lastVisit && Date.now() - t < NEW_MAX_AGE);
  }
  function markNewTabs() {
    $$('.tab').forEach(function (t) {
      var id = t.getAttribute('data-person');
      t.classList.toggle('has-new', state.wishes.some(function (w) { return w.person === id && isNew(w); }));
    });
  }

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
        '<span class="tab__avatar" aria-hidden="true">' + Jul.avatarHTML(p) +
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
    followIndicator(650);

    if (first || !changed || rm()) {
      render(true);
      return;
    }
    transition(next > prev ? 1 : -1, function () {
      render(true);
    });
    keepTabsInView();
  }

  var heightTimer = 0;
  function transition(dir, fn) {
    var els = $$('.swap');
    var grid = $('#grid');
    // Lås høyden mens innholdet byttes, så siden under ikke hopper
    var startH = grid.offsetHeight;
    clearTimeout(heightTimer);
    grid.style.transition = '';
    grid.style.height = startH + 'px';
    els.forEach(function (el) {
      el.style.setProperty('--dir', dir);
      el.classList.add('is-out');
    });
    setTimeout(function () {
      fn();
      // Mål ny høyde, og la listen gli dit i stedet for å hoppe
      grid.style.height = 'auto';
      var endH = grid.offsetHeight;
      grid.style.height = startH + 'px';
      void grid.offsetHeight;
      grid.style.transition = 'height 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
      grid.style.height = endH + 'px';
      els.forEach(function (el) { el.classList.remove('is-out'); });
      heightTimer = setTimeout(function () {
        grid.style.height = '';
        grid.style.transition = '';
      }, 480);
    }, 200);
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
    ind.style.height = active.offsetHeight + 'px';
    ind.style.transform = 'translate(' + active.offsetLeft + 'px, ' + active.offsetTop + 'px)';
    ind.style.opacity = '1';
  }

  /** Den valgte fanen vokser med en animasjon; markeringen følger med mens den skjer. */
  var followUntil = 0;
  function followIndicator(ms) {
    var start = !followUntil;
    followUntil = Math.max(followUntil, performance.now() + ms);
    if (!start) return;
    (function step() {
      moveIndicator();
      if (performance.now() < followUntil) requestAnimationFrame(step);
      else followUntil = 0;
    })();
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
      // Prisantydning, ellers prisen fra Prisjakt eller nettbutikken
      var live = Jul.livePrice(w);
      var a = +w.priceMin || +w.priceMax || (live ? live.amount : 0);
      var b = +w.priceMax || +w.priceMin || (live ? live.amount : 0);
      if (a && (!min || a < min)) min = a;
      if (b && b > max) max = b;
    });
    var stats = [plural(scope.length, 'ønske', 'ønsker')];
    var range = Jul.formatPrice(min, max);
    if (scope.length && range) stats.push(range);

    head.innerHTML =
      '<div class="ph" style="--accent:' + e(p.accent || '#d9b26a') + '">' +
      '<span class="ph__avatar" aria-hidden="true">' + Jul.avatarHTML(p) + '</span>' +
      '<div class="ph__text"><p class="eyebrow">Ønskelisten til</p>' +
      '<h2 class="ph__title">' + e(p.name) + '</h2>' +
      '<p class="ph__stats">' + stats.map(function (s) { return '<span>' + e(s) + '</span>'; }).join('') + '</p>' +
      (state.canEdit
        ? '<p class="ph__admin' + (scope.length > 1 ? '' : ' is-hidden') + '">' + Jul.icon('grip') + 'Dra i håndtaket for å endre rekkefølgen</p>'
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
      html += Jul.cardHTML(w, { index: Math.min(i, 12), editUrl: state.canEdit ? editUrl(w.id) : '', isNew: isNew(w) });
    });
    grid.innerHTML = html;
  }

  /* ---------------- Administrator: rediger, flytt og slett ----------------
   * Flytting og sletting lagres med en gang til GitHub (Jul.github.saveWishes).
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
    markNewTabs();
  }

  /**
   * Lagrer listen til én person. Feiler lagringen, settes ønskene tilbake
   * til slik de var (before), så siden viser det som faktisk er lagret.
   */
  function savePerson(pid, before, what) {
    var p = personById(pid);
    var mine = function (w) { return w.person === pid; };
    var base = before.filter(mine);
    var list = state.wishes.filter(mine);
    toast('Lagrer …');
    sync.pending++;
    // Henter siste versjon fra GitHub og fletter inn bare denne endringen, så vi
    // ikke overskriver det andre har lagret siden siden ble lastet.
    return Jul.github.saveWishes(
      Jul.dataPath(state.list.id, pid),
      base, list,
      what + ' (' + state.list.name + ', ' + p.name + ')'
    ).then(function (res) {
      // Andre har endret noe i mellomtiden: vis den flettede listen
      var differs = rebasePerson(pid, list, res.wishes);
      toast(differs
        ? 'Lagret. Listen er også oppdatert med endringer andre har gjort.'
        : 'Lagret. Det kan ta et minutt før andre ser endringen.');
    }, function (err) {
      // Angre bare denne endringen (andre endringer som lagres samtidig, beholdes)
      rebasePerson(pid, list, base);
      toast(err && err.cancelled ? 'Ikke lagret' : 'Ble ikke lagret: ' + err.message);
    }).then(function () {
      sync.pending--;
      sync.savedAt = Date.now();
    });
  }

  /**
   * Henter ønskelisten på nytt når du kommer tilbake til fanen, så en side som
   * har stått åpen lenge viser det andre har endret. Hoppes over mens noe lagres
   * eller dras, og en stund etter egen lagring (GitHub Pages bruker opptil et
   * par minutter på å vise den nye versjonen).
   */
  var sync = { pending: 0, savedAt: 0, loadedAt: Date.now(), busy: false };
  var REFRESH_AFTER = 2 * 60 * 1000;
  var SETTLE_AFTER_SAVE = 3 * 60 * 1000;
  function idle() {
    return !sync.pending && !document.body.classList.contains('is-sorting');
  }
  function refreshData() {
    countdown(); // dagen kan ha skiftet
    if ($('#app').hidden || sync.busy || !idle()) return;
    var now = Date.now();
    if (now - sync.loadedAt < REFRESH_AFTER || now - sync.savedAt < SETTLE_AFTER_SAVE) return;
    sync.busy = true;
    Jul.loadData(state.list.id).then(function (data) {
      sync.loadedAt = Date.now();
      if (!idle() || Date.now() - sync.savedAt < SETTLE_AFTER_SAVE) return;
      var changed = false;
      state.people.forEach(function (p) {
        var own = function (w) { return w.person === p.id; };
        if (Jul.serializeWishes(data.wishes.filter(own)) !== Jul.serializeWishes(state.wishes.filter(own))) changed = true;
      });
      if (!changed) return;
      state.wishes = data.wishes.slice();
      render(false);
      updateCounts();
    }, function () { /* prøver igjen neste gang */ }).then(function () { sync.busy = false; });
  }

  /**
   * Bytter personens ønsker fra «sent» (det vi prøvde å lagre) til «target»,
   * men beholder endringer som er gjort på siden mens lagringen pågikk.
   * Gir true hvis visningen ble endret.
   */
  function rebasePerson(pid, sent, target) {
    var own = function (w) { return w.person === pid; };
    var current = state.wishes.filter(own);
    var next = Jul.mergeWishes(sent, current, target).map(function (w) {
      return w.person === pid ? w : Object.assign({}, w, { person: pid });
    });
    if (Jul.serializeWishes(next) === Jul.serializeWishes(current)) return false;
    state.wishes = state.wishes.filter(function (w) { return !own(w); }).concat(next);
    if (state.current === pid) render(false);
    updateCounts();
    return true;
  }

  function deleteWish(id) {
    var w = wishById(id);
    if (!w) return;
    var p = personById(w.person);
    Jul.ui.confirm({
      title: 'Slette ønsket?',
      item: { title: w.title, image: w.image },
      message: 'Det fjernes fra ' + genitive(p.name) + ' liste i ' + state.list.name + '. Dette kan ikke angres.',
      ok: 'Slett',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var before = state.wishes.slice();
      state.wishes = state.wishes.filter(function (x) { return x !== w; });
      render(false);
      updateCounts();
      savePerson(w.person, before, 'Slett «' + (w.title || 'Uten navn') + '»');
    });
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
      if (!grip || !state.canEdit || ev.button > 0) return;
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
      function () {
        Jul.ui.copy({ title: 'Del ' + genitive(p.name) + ' liste', message: 'Kopier lenken under. Mottakeren trenger også passordet.', value: url });
      }
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
    // «Del lenke» ligger også på raden med fanene (desktop)
    var tabShare = $('.tabs__share');
    if (tabShare) tabShare.addEventListener('click', shareCurrent);
    $('#main').addEventListener('click', function (ev) {
      var del = ev.target.closest('[data-admin="delete"]');
      if (del && state.canEdit) deleteWish(del.closest('.card').getAttribute('data-id'));
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
        // Fanelinjen ligger fast når siden er scrollet forbi overskriften. Slingringsmonnet
        // hindrer at den vipper frem og tilbake når krympingen flytter innholdet litt.
        var hero = $('.hero');
        var stickAt = hero ? hero.offsetTop + hero.offsetHeight : 0;
        var stuck = document.body.classList.contains('is-stuck');
        var next = y > stickAt + 40 ? true : y < stickAt - 40 ? false : stuck;
        if (next !== stuck) {
          document.body.classList.toggle('is-stuck', next);
          followIndicator(650); // den valgte fanen endrer størrelse; markeringen følger med
        }
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

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshData();
    });
    global.addEventListener('focus', refreshData);

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
