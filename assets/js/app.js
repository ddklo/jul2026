/*!
 * Juleønsker 2026 – nettsiden.
 */
(function (global) {
  'use strict';

  var Jul = global.Jul;
  var DATA_URL = 'data/wishlist.enc.js';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  function rm() { return !!(reducedMotion && reducedMotion.matches); }

  var state = {
    payload: null,
    people: [],
    wishes: [],
    current: null,
    query: '',
    price: 'all',
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
      if (!state.payload) {
        setLoginError('Fant ikke ønskelistedataene. Prøv å laste siden på nytt.');
        return;
      }
      setLoginError('');
      setLoading(true);
      Jul.crypto
        .unlockWithPassword(state.payload, value)
        .then(
          function (res) {
            // Husk innloggingen. Feiler det (f.eks. privat modus), går vi likevel videre.
            Jul.crypto
              .exportKey(res.key)
              .then(function (raw) { Jul.session.save(state.payload.salt, raw, $('#remember').checked); })
              .catch(function (err) { if (global.console) console.warn('Kunne ikke huske innloggingen', err); });
            try {
              unlock(res.data, true);
            } catch (err) {
              if (global.console) console.error(err);
              setLoading(false);
              setLoginError('Passordet er riktig, men siden kunne ikke vises: ' + (err && err.message ? err.message : err));
            }
          },
          function (err) {
            setLoading(false);
            if (err && err.wrongPassword) {
              setLoginError('Feil passord – prøv igjen.');
              pw.select();
            } else {
              if (global.console) console.error(err);
              setLoginError('Noe gikk galt under opplåsingen: ' + (err && err.message ? err.message : err));
            }
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

  function unlock(data, animate) {
    state.people = (data.people && data.people.length ? data.people : Jul.DEFAULT_PEOPLE).slice();
    state.wishes = (data.wishes || []).slice();

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
    Jul.session.clear();
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
    if (state.query) clearSearch(true);
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
    document.title = (p ? genitive(p.name) + ' ønskeliste · ' : '') + 'Juleønsker 2026';
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

  /* ---------------- Filtrering ---------------- */
  function matchesQuery(w, terms) {
    if (!terms.length) return true;
    var p = personById(w.person);
    var hay = [w.title, w.description, p ? p.name : '']
      .join(' ')
      .toLowerCase();
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function matchesPrice(w) {
    if (state.price === 'all') return true;
    var parts = state.price.split('-');
    var lo = +parts[0] || 0;
    var hi = parts[1] ? +parts[1] : Infinity;
    var a = +w.priceMin || +w.priceMax || 0;
    var b = +w.priceMax || +w.priceMin || 0;
    if (!a && !b) return false;
    if (a > b) { var t = a; a = b; b = t; }
    return a < hi && b >= lo;
  }

  /* ---------------- Visning ---------------- */
  function render(animate) {
    var terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var searching = terms.length > 0;
    document.body.classList.toggle('is-searching', searching);

    var scope = state.wishes.filter(function (w) {
      return searching ? matchesQuery(w, terms) : w.person === state.current;
    });
    var list = scope.filter(matchesPrice);

    renderHead(scope, searching);
    renderGrid(list, scope, searching, animate);
    state.rendered = true;
  }

  function renderHead(scope, searching) {
    var head = $('#person-head');
    var e = Jul.escape;
    if (searching) {
      var people = {};
      scope.forEach(function (w) { people[w.person] = 1; });
      var np = Object.keys(people).length;
      head.innerHTML =
        '<div class="ph ph--search">' +
        '<span class="ph__avatar ph__avatar--search">' + Jul.icon('search') + '</span>' +
        '<div class="ph__text"><p class="eyebrow">Søk i alle ønskelister</p>' +
        '<h2 class="ph__title">«' + e(state.query.trim()) + '»</h2>' +
        '<p class="ph__stats">' + (scope.length ? plural(scope.length, 'treff', 'treff') + ' hos ' + plural(np, 'person', 'personer') : 'Ingen treff') + '</p></div>' +
        '<button type="button" class="btn btn--ghost btn--sm ph__action" data-action="clear-search">' + Jul.icon('x') + 'Avslutt søk</button>' +
        '</div>';
      return;
    }

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
      '<p class="ph__stats">' + stats.map(function (s) { return '<span>' + e(s) + '</span>'; }).join('') + '</p></div>' +
      '<button type="button" class="btn btn--ghost btn--sm ph__action" data-action="share">' + Jul.icon('share') + '<span>Del lenke</span></button>' +
      '</div>';
  }

  function renderGrid(list, scope, searching, animate) {
    var grid = $('#grid');
    grid.classList.toggle('grid--static', !animate);

    if (!scope.length && !searching) {
      var p = personById(state.current);
      grid.innerHTML =
        '<div class="empty">' + giftArt() +
        '<h3>' + Jul.escape(genitive(p ? p.name : '')) + ' ønskeliste er fortsatt tom</h3>' +
        '<p>Nissen venter spent! Ønskene dukker opp her så snart de er lagt inn – ta gjerne en titt på de andre listene så lenge.</p>' +
        '</div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML =
        '<div class="empty empty--small">' +
        '<span class="empty__icon">' + Jul.icon(searching ? 'search' : 'sliders') + '</span>' +
        '<h3>' + (searching && !scope.length ? 'Fant ingen ønsker som passer søket' : 'Ingen ønsker i dette prisintervallet') + '</h3>' +
        '<p>' + (searching && !scope.length ? 'Prøv et annet ord, for eksempel et produktnavn.' : 'Prøv et annet prisintervall.') + '</p>' +
        (searching && !scope.length
          ? '<button type="button" class="btn btn--ghost btn--sm" data-action="clear-search">Nullstill søk</button>'
          : '<button type="button" class="btn btn--ghost btn--sm" data-action="reset">Vis alle priser</button>') +
        '</div>';
      return;
    }

    var html = '';
    list.forEach(function (w, i) {
      var p = searching ? personById(w.person) : null;
      html += Jul.cardHTML(w, {
        index: Math.min(i, 12),
        personName: p ? p.name : '',
        accent: p ? p.accent : ''
      });
    });
    grid.innerHTML = html;
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
  function clearSearch(silent) {
    state.query = '';
    var s = $('#search');
    s.value = '';
    $('#search-clear').hidden = true;
    if (!silent) render(true);
  }

  function initControls() {
    var search = $('#search');
    var timer;
    search.addEventListener('input', function () {
      $('#search-clear').hidden = !search.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var was = !!state.query.trim();
        state.query = search.value;
        var now = !!state.query.trim();
        render(was !== now);
      }, 120);
    });
    search.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') clearSearch();
      if (ev.key === 'Enter') search.blur();
    });
    $('#search-clear').addEventListener('click', function () {
      clearSearch();
      search.focus();
    });

    $('#price-filter').addEventListener('change', function (ev) {
      state.price = ev.target.value;
      render(false);
    });

    $('#main').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-action]');
      if (!b) return;
      var a = b.getAttribute('data-action');
      if (a === 'share') shareCurrent();
      if (a === 'clear-search') clearSearch();
      if (a === 'reset') {
        state.price = 'all';
        $('#price-filter').value = 'all';
        render(false);
      }
    });

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
      track = !state.query && !t.closest('.toolbar, input, select, button, a');
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

    if (!Jul.crypto.hasCrypto()) {
      showLogin();
      setLoginError('Nettleseren din støtter ikke kryptering her. Åpne siden via https i en oppdatert nettleser.');
      $('#login-btn').disabled = true;
      return;
    }

    document.body.classList.add('is-checking');
    Jul.loadDataScript(DATA_URL).then(function (payload) {
      state.payload = payload;
      if (!payload) {
        showLogin();
        setLoginError('Fant ikke ønskelistedataene (data/wishlist.enc.js).');
        return;
      }
      var saved = Jul.session.load();
      if (!saved || saved.salt !== payload.salt) {
        if (saved) Jul.session.clear();
        showLogin();
        return;
      }
      Jul.crypto
        .importKey(saved.key)
        .then(function (key) { return Jul.crypto.decryptWithKey(payload, key); })
        .then(function (data) { unlock(data, false); })
        .catch(function () {
          Jul.session.clear();
          showLogin();
        });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
