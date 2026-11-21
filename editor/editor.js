/*!
 * Juleønsker 2026 – redigeringsverktøy (for alle som er logget inn).
 * Leser data/personer.json og én fil per person, lar deg endre ønskene og
 * lagrer personfilene som er endret rett til GitHub (eller laster dem ned).
 */
(function (global) {
  'use strict';

  var Jul = global.Jul;
  Jul.ROOT = '../';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var e = Jul.escape;

  var state = {
    list: null,      // { id, name } – listen som redigeres (Bergen, Sørumsand …)
    loading: null,   // Promise med dataene fra data/<liste>/
    saved: {},       // person-id → filinnholdet slik det ligger publisert
    data: null,      // { title, people, wishes } – ønskene har feltet person
    person: null,
    selected: null,
    filter: '',
    dirty: false
  };

  /* ---------------- Hjelpere ---------------- */
  function hydrateIcons(root) {
    $$('[data-icon]', root).forEach(function (el) {
      if (!el.firstElementChild) el.innerHTML = Jul.icon(el.getAttribute('data-icon'));
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 3000);
  }
  function setDirty(on) {
    state.dirty = on;
    var d = $('#dirty');
    d.setAttribute('data-state', on ? 'dirty' : 'clean');
    d.textContent = on ? 'Ulagrede endringer' : 'Alt er lagret';
  }
  function people() { return state.data.people; }
  function personById(id) {
    for (var i = 0; i < people().length; i++) if (people()[i].id === id) return people()[i];
    return null;
  }
  function wishById(id) {
    for (var i = 0; i < state.data.wishes.length; i++) if (state.data.wishes[i].id === id) return state.data.wishes[i];
    return null;
  }
  function wishesFor(pid) {
    return state.data.wishes.filter(function (w) { return w.person === pid; });
  }
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function readText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsText(file);
    });
  }
  function kb(str) { return Math.round((str.length * 3) / 4 / 1024); }

  function normalize(data) {
    data = data || {};
    var out = {
      title: data.title || 'Juleønsker 2026',
      people: (data.people && data.people.length ? data.people : Jul.DEFAULT_PEOPLE).map(function (p) {
        return { id: p.id, name: p.name, accent: p.accent, avatar: p.avatar };
      }),
      wishes: (data.wishes || []).map(function (w) {
        return {
          id: w.id || Jul.uid(),
          person: w.person,
          title: w.title || '',
          description: w.description || '',
          image: w.image || '',
          imageFit: w.imageFit === 'cover' ? 'cover' : 'contain',
          storeUrl: w.storeUrl || '',
          prisjaktUrl: w.prisjaktUrl || '',
          hidePrisjakt: !!w.hidePrisjakt,
          linkLabel: w.linkLabel || '',
          priceMin: w.priceMin ? +w.priceMin : null,
          priceMax: w.priceMax ? +w.priceMax : null,
          // Settes av den nattlige prisjobben (tools/priser.mjs). Tas vare på uendret.
          livePrice: w.livePrice || undefined,
          createdAt: w.createdAt || new Date().toISOString()
        };
      })
    };
    return out;
  }

  /* ---------------- Åpning ---------------- */
  function initUnlock() {
    var st = $('#data-status');
    // Listen velges med ?liste=bergen. Uten (eller ukjent) brukes den første.
    var wanted = new URLSearchParams(global.location.search).get('liste');
    state.loading = Jul.loadMeta().then(function (meta) {
      var ids = (meta.lists || []).map(function (l) { return l.id; });
      return Jul.loadData(ids.indexOf(wanted) !== -1 ? wanted : ids[0]);
    });
    state.loading.then(function (data) {
      st.innerHTML = Jul.icon('check') + 'Fant ønskelisten for ' + e(data.list.name) + ' (' + data.wishes.length + ' ønsker)';
      st.className = 'ed-status is-ok';
      if (Jul.auth.load() === 'admin') openWorkspace(data);
      else if (!matchMedia('(pointer: coarse)').matches) $('#ed-password').focus();
    }, function (err) {
      if (global.console) console.error(err);
      st.innerHTML = Jul.icon('file') + 'Fant ikke ønskelistene i <code>data/</code>. Åpne verktøyet fra nettsiden, eller via en lokal webserver.';
      st.className = 'ed-status is-warn';
    });

    $('#open-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pw = $('#ed-password').value;
      var err = $('#open-error');
      if (!pw) { err.textContent = 'Skriv inn passordet.'; return; }
      var btn = $('#open-btn');
      btn.classList.add('is-loading'); btn.disabled = true;
      err.textContent = '';
      // Bare administrator kan redigere. Familiepassordet gir bare visning på nettsiden.
      Jul.auth.check(pw).then(function (role) {
        if (role === 'view') {
          err.textContent = 'Familiepassordet gir bare visning. Bruk administratorpassordet for å redigere.';
          $('#ed-password').select();
          return undefined;
        }
        return role ? Jul.auth.login(pw, false) : null;
      }).then(function (role) {
        if (role === undefined) return;
        if (!role) {
          err.textContent = 'Feil passord.';
          $('#ed-password').select();
          return;
        }
        return state.loading.then(openWorkspace, function () {
          err.textContent = 'Passordet er riktig, men ønskelistene ble ikke funnet.';
        });
      }).then(function () {
        btn.classList.remove('is-loading'); btn.disabled = false;
      });
    });
  }

  function openWorkspace(data) {
    state.list = data.list;
    $('#list-select').innerHTML = data.lists.map(function (l) {
      return '<option value="' + e(l.id) + '"' + (l.id === data.list.id ? ' selected' : '') + '>' + e(l.name) + '</option>';
    }).join('');
    document.title = 'Rediger ' + data.list.name + ' · Juleønsker 2026';
    $$('[data-admin-only]').forEach(function (el) { el.hidden = Jul.auth.load() !== 'admin'; });
    state.data = normalize(data);
    people().forEach(function (p) { state.saved[p.id] = personFile(p.id); });
    // ?onske=<id> (fra «Rediger» på et kort) åpner det ønsket direkte
    var wanted = wishById(new URLSearchParams(global.location.search).get('onske'));
    state.person = wanted ? wanted.person : people()[0].id;
    var first = wanted || wishesFor(state.person)[0];
    state.selected = first ? first.id : null;
    $('#unlock').hidden = true;
    $('#workspace').hidden = false;
    buildStaticSelects();
    renderAll();
    setDirty(false);
  }

  /* ---------------- Visning ---------------- */
  function buildStaticSelects() {
    $('#person-select').innerHTML = people().map(function (p) {
      return '<option value="' + e(p.id) + '">' + e(p.name) + '</option>';
    }).join('');
  }

  function renderAll() {
    renderPeople();
    renderList();
    renderForm();
    renderPreview();
  }

  function renderPeople() {
    $('#ed-people').innerHTML = people().map(function (p) {
      var on = p.id === state.person;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="ed-person' + (on ? ' is-active' : '') +
        '" data-person="' + e(p.id) + '" style="--accent:' + e(p.accent) + '">' +
        '<span class="ed-person__dot" aria-hidden="true">' + Jul.avatarHTML(p) + '</span>' +
        '<span>' + e(p.name) + '</span><span class="ed-person__n">' + wishesFor(p.id).length + '</span></button>';
    }).join('');
  }

  function renderList() {
    var list = wishesFor(state.person);
    var q = state.filter.trim().toLowerCase();
    var html = '';
    list.forEach(function (w, i) {
      if (q && (w.title + ' ' + w.description).toLowerCase().indexOf(q) === -1) return;
      var img = Jul.safeImage(w.image);
      var thumb = img
        ? '<img src="' + e(img) + '" alt="" loading="lazy">'
        : '<span class="ed-item__ph">' + Jul.icon('gift') + '</span>';
      var price = Jul.formatPrice(+w.priceMin, +w.priceMax) || 'Ingen pris';
      html += '<li class="ed-item' + (w.id === state.selected ? ' is-active' : '') + '" data-id="' + e(w.id) + '">' +
        '<button type="button" class="ed-item__main" data-select="' + e(w.id) + '">' +
        '<span class="ed-item__thumb' + (w.imageFit === 'cover' || !img ? ' is-cover' : '') + '">' + thumb + '</span>' +
        '<span class="ed-item__text"><span class="ed-item__title' + (w.title ? '' : ' is-missing') + '">' +
        e(w.title || 'Uten navn') + '</span>' +
        '<span class="ed-item__meta">' + e(price) + '</span></span></button>' +
        '<span class="ed-item__move">' +
        '<button type="button" class="ed-mini" data-move="-1" aria-label="Flytt opp"' + (i === 0 ? ' disabled' : '') + '>' + Jul.icon('chevronUp') + '</button>' +
        '<button type="button" class="ed-mini" data-move="1" aria-label="Flytt ned"' + (i === list.length - 1 ? ' disabled' : '') + '>' + Jul.icon('chevronDown') + '</button>' +
        '</span></li>';
    });
    if (!list.length) {
      html = '<li class="ed-list__empty">Ingen ønsker ennå.</li>';
    } else if (!html) {
      html = '<li class="ed-list__empty">Ingen treff.</li>';
    }
    $('#ed-list').innerHTML = html;
  }

  function renderForm() {
    var w = wishById(state.selected);
    var form = $('#wish-form');
    var empty = $('#ed-empty');
    if (!w || w.person !== state.person) {
      form.hidden = true;
      empty.hidden = false;
      var p = personById(state.person);
      var n = wishesFor(state.person).length;
      empty.innerHTML =
        '<span class="empty__icon">' + Jul.icon('gift') + '</span>' +
        '<h2>' + (n ? 'Velg et ønske i listen' : e(p.name) + ' har ingen ønsker ennå') + '</h2>' +
        '<p>' + (n ? 'eller legg til et nytt.' : 'Legg til det første ønsket – det tar under ett minutt.') + '</p>' +
        '<button type="button" class="btn btn--gold" data-add>' + Jul.icon('plus') + 'Legg til ønske for ' + e(p.name) + '</button>';
      return;
    }
    empty.hidden = true;
    form.hidden = false;

    form.elements.title.value = w.title;
    form.elements.person.value = w.person;
    form.elements.description.value = w.description;
    form.elements.image.value = /^data:/.test(w.image) ? '' : w.image;
    form.elements.image.placeholder = /^data:/.test(w.image)
      ? 'Opplastet bilde i bruk (' + kb(w.image) + ' kB) – lim inn en adresse for å erstatte'
      : 'Lim inn bildeadresse (https://…)';
    setRadio(form, 'imageFit', w.imageFit || 'contain');
    form.elements.storeUrl.value = w.storeUrl;
    form.elements.prisjaktUrl.value = w.prisjaktUrl;
    form.elements.linkLabel.value = w.linkLabel || '';
    form.elements.hidePrisjakt.checked = !!w.hidePrisjakt;
    form.elements.priceMin.value = w.priceMin || '';
    form.elements.priceMax.value = w.priceMax || '';
    $('#form-title').textContent = w.title ? 'Rediger ønske' : 'Nytt ønske';
    updateFormExtras(w);
  }

  function setRadio(form, name, value) {
    $$('input[name="' + name + '"]', form).forEach(function (r) { r.checked = r.value === value; });
  }

  function updateFormExtras(w) {
    $('#desc-count').textContent = (w.description || '').length + '/280';
    var img = Jul.safeImage(w.image);
    var thumb = $('#img-thumb');
    thumb.classList.toggle('has-image', !!img);
    thumb.classList.toggle('is-cover', w.imageFit === 'cover');
    thumb.innerHTML = img
      ? '<img src="' + e(img) + '" alt="">'
      : '<span>' + Jul.icon('image') + '<small>Slipp bilde her</small></span>';
    $('#image-clear').disabled = !w.image;
    var su = Jul.safeUrl(w.storeUrl);
    var pj = w.hidePrisjakt ? '' : Jul.safeUrl(w.prisjaktUrl);
    toggleLink($('#test-store'), su);
    toggleLink($('#test-pj'), pj);
    $$('#price-presets button').forEach(function (b) {
      var p = b.getAttribute('data-p').split('-');
      b.classList.toggle('is-active', (+p[0] || null) === (w.priceMin || null) && +p[1] === w.priceMax);
    });
  }
  function toggleLink(a, url) {
    if (url) { a.href = url; a.removeAttribute('aria-disabled'); }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
  }

  function renderPreview() {
    var w = wishById(state.selected);
    var box = $('#preview');
    if (!w || w.person !== state.person) { box.innerHTML = ''; return; }
    box.innerHTML = Jul.cardHTML(w, { index: 0 });
  }

  /* ---------------- Endringer ---------------- */
  var previewTimer;
  function changed(w, opts) {
    setDirty(true);
    renderList();
    renderPeople();
    updateFormExtras(w);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, opts && opts.now ? 0 : 150);
  }

  function addWish(base) {
    var w = base ? JSON.parse(JSON.stringify(base)) : {
      title: '', description: '', image: '', imageFit: 'contain',
      storeUrl: '', prisjaktUrl: '', hidePrisjakt: false, linkLabel: '', priceMin: null, priceMax: null
    };
    w.id = Jul.uid();
    w.person = state.person;
    w.createdAt = new Date().toISOString();
    if (base) {
      w.title = base.title ? base.title + ' (kopi)' : '';
      // legg kopien rett etter originalen
      var idx = state.data.wishes.indexOf(base);
      state.data.wishes.splice(idx + 1, 0, w);
    } else {
      state.data.wishes.push(w);
    }
    state.selected = w.id;
    state.filter = '';
    $('#ed-filter').value = '';
    setDirty(true);
    renderAll();
    var t = $('#wish-form').elements.title;
    t.focus();
    if (base) t.select();
  }

  function deleteWish(w) {
    Jul.ui.confirm({
      title: 'Slette ønsket?',
      item: { title: w.title, image: w.image },
      message: 'Det fjernes fra ' + personById(w.person).name + ' sin liste når du lagrer. Dette kan ikke angres etter lagring.',
      ok: 'Slett',
      danger: true
    }).then(function (ok) { if (ok) removeWish(w); });
  }

  function removeWish(w) {
    var list = wishesFor(state.person);
    var i = list.indexOf(w);
    state.data.wishes.splice(state.data.wishes.indexOf(w), 1);
    var next = list[i + 1] || list[i - 1];
    state.selected = next ? next.id : null;
    setDirty(true);
    renderAll();
    toast('Ønsket er slettet');
  }

  function moveWish(id, dir) {
    var all = state.data.wishes;
    var w = wishById(id);
    var list = wishesFor(w.person);
    var i = list.indexOf(w);
    var other = list[i + dir];
    if (!other) return;
    var a = all.indexOf(w), b = all.indexOf(other);
    all[a] = other; all[b] = w;
    setDirty(true);
    renderList();
    var btn = $('.ed-item[data-id="' + id + '"] [data-move="' + dir + '"]');
    if (btn && !btn.disabled) btn.focus();
  }

  /* ---------------- Bilder ---------------- */
  function imageFileToDataUrl(file, maxDim) {
    maxDim = maxDim || 900;
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('Filen er ikke et bilde'));
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        return r.readAsDataURL(file);
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        var out = c.toDataURL('image/webp', 0.84);
        if (out.indexOf('data:image/webp') !== 0) {
          // Nettleseren kan ikke lage WebP – bruk JPEG med hvit bakgrunn
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          out = c.toDataURL('image/jpeg', 0.86);
        }
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Kunne ikke lese bildet')); };
      img.src = url;
    });
  }

  function useImageFile(file) {
    var w = wishById(state.selected);
    if (!w || !file) return;
    imageFileToDataUrl(file).then(function (dataUrl) {
      w.image = dataUrl;
      renderForm();
      changed(w, { now: true });
      toast('Bildet er lagt til (' + kb(dataUrl) + ' kB)');
    }).catch(function (err) { toast(err.message); });
  }

  /* ---------------- Lagring ---------------- */
  /** Innholdet i data/<liste>/<person>.json for én person. */
  function personFile(pid) {
    return Jul.serializeWishes(wishesFor(pid));
  }

  /**
   * Bytter personens ønsker fra «sent» (det som ble lagret) til «target» (den
   * flettede versjonen fra GitHub), men beholder endringer gjort mens lagringen
   * pågikk. Gir true hvis noe på skjermen ble endret.
   */
  function rebasePerson(pid, sent, target) {
    var current = wishesFor(pid);
    var next = normalize({ people: people(), wishes: Jul.mergeWishes(sent, current, target) }).wishes
      .map(function (w) { w.person = pid; return w; });
    if (Jul.serializeWishes(next) === Jul.serializeWishes(current)) return false;
    // Behold objektene som ikke er endret, så skjemaet ikke mister fokus
    var old = {};
    current.forEach(function (w) { old[w.id] = w; });
    next = next.map(function (w) {
      var o = old[w.id];
      return o && Jul.serializeWishes([o]) === Jul.serializeWishes([w]) ? o : w;
    });
    state.data.wishes = state.data.wishes.filter(function (w) { return w.person !== pid; }).concat(next);
    if (!wishById(state.selected)) {
      var first = wishesFor(state.person)[0];
      state.selected = first ? first.id : null;
    }
    renderAll();
    return true;
  }

  /** Personfilene som er endret siden de ble lastet eller lagret. */
  function changedFiles() {
    var files = [];
    people().forEach(function (p) {
      var text = personFile(p.id);
      if (text !== state.saved[p.id]) files.push({ pid: p.id, name: p.id + '.json', text: text });
    });
    return files;
  }

  function confirmMissingTitles(verb) {
    var missing = state.data.wishes.filter(function (w) { return !w.title.trim(); }).length;
    if (!missing) return Promise.resolve(true);
    return Jul.ui.confirm({
      title: missing === 1 ? 'Ett ønske mangler navn' : missing + ' ønsker mangler navn',
      message: 'Ønsker uten produktnavn vises som «Uten navn» på siden. ' + verb + ' likevel?',
      ok: verb, cancel: 'Tilbake', icon: 'alert'
    });
  }

  /** Lagrer endrede personfiler rett til GitHub (én commit per fil). */
  var saving = false;
  function saveToGitHub() {
    if (saving) return;
    confirmMissingTitles('Lagre').then(function (ok) { if (ok) saveFiles(); });
  }

  function saveFiles() {
    var files = changedFiles();
    if (!files.length) {
      setDirty(false);
      toast('Ingen endringer å lagre');
      return;
    }
    saving = true;
    var mergedFromOthers = false;
    var btn = $('#save-btn');
    btn.classList.add('is-loading'); btn.disabled = true;
    toast('Lagrer …');
    files.reduce(function (p, f) {
      return p.then(function () {
        var who = personById(f.pid).name;
        var base = JSON.parse(state.saved[f.pid]).wishes;
        var sent = JSON.parse(f.text).wishes;
        // Henter siste versjon fra GitHub og fletter inn bare det som er endret her,
        // så vi ikke overskriver det andre har lagret siden redigereren ble åpnet.
        return Jul.github.saveWishes(Jul.dataPath(state.list.id, f.pid), base, sent, 'Oppdater ønsker (' + state.list.name + ', ' + who + ')')
          .then(function (res) {
            // Samme form som skjemaet bruker (normaliseres én gang, siden manglende
            // felt som createdAt fylles inn), så «Ulagrede endringer» blir riktig
            var target = normalize({ people: people(), wishes: res.wishes }).wishes;
            state.saved[f.pid] = Jul.serializeWishes(target);
            if (rebasePerson(f.pid, sent, target)) mergedFromOthers = true;
          });
      });
    }, Promise.resolve()).then(function () {
      setDirty(changedFiles().length > 0);
      toast(mergedFromOthers
        ? 'Lagret. Listen er også oppdatert med endringer andre har gjort.'
        : 'Lagret. Nettsiden er oppdatert om et minutt.');
    }, function (err) {
      // Det som ble lagret før feilen, er lagret; resten er fortsatt ulagret
      setDirty(changedFiles().length > 0);
      if (!err.cancelled) Jul.ui.alert({ title: 'Ble ikke lagret', message: err.message });
    }).then(function () {
      saving = false;
      sync.savedAt = Date.now();
      btn.classList.remove('is-loading'); btn.disabled = false;
    });
  }

  function runPrices() {
    toast('Starter prisoppdateringen …');
    Jul.github.runPrices().then(function () {
      toast('Prisoppdateringen er startet. Nettsiden er oppdatert om noen minutter.');
    }, function (err) {
      if (!err.cancelled) Jul.ui.alert({ title: 'Kunne ikke starte prisoppdateringen', message: err.message });
    });
  }

  /**
   * Administrator: legg inn (eller bytt) GitHub-tokenet. Det krypteres med
   * administratorpassordet og lagres som data/tilgang.json, så administrator
   * kan lagre fra alle enheter uten å lime inn tokenet på nytt.
   */
  function shareAccess() {
    $('#access-form').reset();
    $('#access-error').textContent = '';
    $('#access-dialog').showModal();
  }
  function initShareAccess() {
    var form = $('#access-form'), err = $('#access-error'), btn = $('#access-save');
    form.addEventListener('submit', function (ev) {
      if (ev.submitter && ev.submitter.value === 'cancel') return;
      ev.preventDefault();
      var token = form.elements.token.value.trim();
      var admin = form.elements.admin.value;
      if (!token) { err.textContent = 'Lim inn GitHub-tokenet.'; return; }
      btn.disabled = true;
      err.textContent = 'Sjekker …';
      Jul.auth.check(admin).then(function (role) {
        if (role !== 'admin') throw new Error('Administratorpassordet stemmer ikke.');
        return Jul.github.verifyToken(token);
      }).then(function () {
        // Bruk det nye tokenet til å lagre filen, og husk det i denne nettleseren
        Jul.github.setToken(token, Jul.auth.remembered());
        return Jul.access.build(token, [admin.trim()]);
      }).then(function (text) {
        return Jul.github.saveFile(Jul.access.path, text, 'Sett opp lagring (nytt GitHub-token)');
      }).then(function () {
        $('#access-dialog').close();
        toast('Lagring er satt opp. Du kan nå lagre fra alle enheter når du logger inn som administrator.');
      }, function (e) {
        err.textContent = e instanceof TypeError ? 'Fikk ikke kontakt med GitHub. Er du på nett?' : e.message;
      }).then(function () { btn.disabled = false; });
    });
  }

  /** Reserve: last ned endrede filer og last dem opp til GitHub for hånd. */
  function downloadDataFile() {
    confirmMissingTitles('Last ned').then(function (ok) { if (ok) downloadFiles(); });
  }

  function downloadFiles() {
    var files = changedFiles();
    if (!files.length) {
      setDirty(false);
      toast('Ingen endringer å laste ned');
      return;
    }
    // Litt mellomrom, ellers stopper noen nettlesere flere nedlastinger på rad
    files.forEach(function (f, i) {
      setTimeout(function () { download(f.name, f.text, 'application/json'); }, i * 350);
      state.saved[f.pid] = f.text;
    });
    setDirty(false);
    showPublishDialog(files.map(function (f) { return f.name; }));
  }

  function showPublishDialog(names) {
    $('#publish-title').textContent = names ? 'Filene er lastet ned' : 'Publisere filer for hånd';
    $('#publish-files').innerHTML = names
      ? 'Disse filene ligger i nedlastingsmappen din: ' + names.map(function (n) { return '<code>' + e(n) + '</code>'; }).join(', ') + '.'
      : 'Vanligvis lagrer du med <strong>Lagre</strong>. Uten GitHub-token kan du velge <strong>Mer → Last ned endrede filer</strong> og laste dem opp selv. Du får én fil per person som er endret, for eksempel <code>ellie.json</code>.';
    // Filene til hver liste ligger i sin egen mappe, f.eks. data/bergen
    $$('.publish-folder').forEach(function (el) { el.textContent = 'data/' + state.list.id; });
    $('#publish-list').textContent = state.list.name;
    $('#publish-dialog').showModal();
  }

  function exportBackup() {
    var d = new Date().toISOString().slice(0, 10);
    download('onskeliste-backup-' + state.list.id + '-' + d + '.json', JSON.stringify(state.data, null, 2), 'application/json');
  }

  function importBackup(file) {
    readText(file).then(function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.wishes)) throw new Error('Filen ser ikke ut som en backup av ønskelisten.');
      return Jul.ui.confirm({
        title: 'Importere backupen?',
        message: 'Alle ønskene i ' + state.list.name + ' blir erstattet med de ' + data.wishes.length + ' ønskene i backupen. Ingenting lagres før du trykker Lagre.',
        ok: 'Importer', icon: 'upload'
      }).then(function (ok) {
        if (!ok) return;
        state.data = normalize(data);
        if (!personById(state.person)) state.person = people()[0].id;
        var first = wishesFor(state.person)[0];
        state.selected = first ? first.id : null;
        buildStaticSelects();
        renderAll();
        setDirty(true);
        toast('Backupen er importert');
      });
    }).catch(function (err) { Jul.ui.alert({ title: 'Kunne ikke importere', message: err.message }); });
  }

  /* ---------------- Hendelser ---------------- */
  function initWorkspace() {
    var form = $('#wish-form');

    $('#ed-people').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-person]');
      if (!b) return;
      state.person = b.getAttribute('data-person');
      var list = wishesFor(state.person);
      var keep = wishById(state.selected);
      if (!keep || keep.person !== state.person) state.selected = list[0] ? list[0].id : null;
      renderAll();
    });

    $('#ed-list').addEventListener('click', function (ev) {
      var mv = ev.target.closest('[data-move]');
      if (mv) {
        moveWish(mv.closest('.ed-item').getAttribute('data-id'), +mv.getAttribute('data-move'));
        return;
      }
      var sel = ev.target.closest('[data-select]');
      if (sel) {
        state.selected = sel.getAttribute('data-select');
        renderList();
        renderForm();
        renderPreview();
        if (global.innerWidth < 900) $('.ed-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    $('#ed-filter').addEventListener('input', function (ev) {
      state.filter = ev.target.value;
      renderList();
    });

    $('#add-btn').addEventListener('click', function () { addWish(); });
    $('#ed-empty').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-add]')) addWish();
    });
    $('#dup-btn').addEventListener('click', function () {
      var w = wishById(state.selected);
      if (w) addWish(w);
    });
    $('#del-btn').addEventListener('click', function () {
      var w = wishById(state.selected);
      if (w) deleteWish(w);
    });

    form.addEventListener('input', function (ev) {
      var w = wishById(state.selected);
      var t = ev.target;
      if (!w || !t.name) return;
      switch (t.name) {
        case 'priceMin':
        case 'priceMax':
          w[t.name] = t.value === '' ? null : Math.max(0, Math.round(+t.value));
          break;
        case 'hidePrisjakt':
          w.hidePrisjakt = t.checked;
          break;
        case 'image':
          w.image = t.value.trim();
          form.elements.image.placeholder = 'Lim inn bildeadresse (https://…)';
          break;
        case 'person':
          return; // håndteres i change
        default:
          w[t.name] = t.value;
      }
      if (t.name === 'title') $('#form-title').textContent = w.title ? 'Rediger ønske' : 'Nytt ønske';
      changed(w);
    });

    form.addEventListener('change', function (ev) {
      var w = wishById(state.selected);
      var t = ev.target;
      if (!w) return;
      if (t.name === 'person') {
        w.person = t.value;
        state.person = t.value;
        setDirty(true);
        renderAll();
        toast('Flyttet til ' + personById(t.value).name);
      }
      if (t.name === 'imageFit') {
        w.imageFit = t.value;
        changed(w, { now: true });
      }
    });

    $('#price-presets').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-p]');
      var w = wishById(state.selected);
      if (!b || !w) return;
      var p = b.getAttribute('data-p').split('-');
      w.priceMin = +p[0] || null;
      w.priceMax = +p[1] || null;
      form.elements.priceMin.value = w.priceMin || '';
      form.elements.priceMax.value = w.priceMax || '';
      changed(w, { now: true });
    });

    // Bilder: opplasting, slipp og lim inn
    $('#image-file').addEventListener('change', function (ev) {
      useImageFile(ev.target.files[0]);
      ev.target.value = '';
    });
    $('#image-clear').addEventListener('click', function () {
      var w = wishById(state.selected);
      if (!w) return;
      w.image = '';
      renderForm();
      changed(w, { now: true });
    });
    var thumb = $('#img-thumb');
    ['dragenter', 'dragover'].forEach(function (t) {
      thumb.addEventListener(t, function (ev) { ev.preventDefault(); thumb.classList.add('is-drop'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      thumb.addEventListener(t, function () { thumb.classList.remove('is-drop'); });
    });
    thumb.addEventListener('drop', function (ev) {
      ev.preventDefault();
      var f = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) return useImageFile(f);
      var url = ev.dataTransfer.getData('text/uri-list') || ev.dataTransfer.getData('text/plain');
      var w = wishById(state.selected);
      if (url && w && Jul.safeUrl(url)) {
        w.image = Jul.safeUrl(url);
        renderForm();
        changed(w, { now: true });
      }
    });
    document.addEventListener('paste', function (ev) {
      if ($('#workspace').hidden || !wishById(state.selected)) return;
      var items = (ev.clipboardData && ev.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          ev.preventDefault();
          useImageFile(items[i].getAsFile());
          return;
        }
      }
    });

    // Toppmeny
    $('#save-btn').addEventListener('click', saveToGitHub);
    // Bytt liste: last verktøyet på nytt med ?liste=… (innloggingen huskes i fanen)
    $('#list-select').addEventListener('change', function (ev) {
      var target = ev.target.value;
      ev.target.value = state.list.id; // står på gjeldende liste til valget er bekreftet
      confirmLeave('Bytte liste likevel?').then(function (ok) {
        if (!ok) return;
        state.dirty = false;
        global.location.search = '?liste=' + encodeURIComponent(target);
      });
    });
    $('.ed-menu').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cmd]');
      if (!b) return;
      $('.ed-menu').open = false;
      var cmd = b.getAttribute('data-cmd');
      if (cmd === 'export') exportBackup();
      if (cmd === 'import') $('#import-file').click();
      if (cmd === 'prices') runPrices();
      if (cmd === 'download') downloadDataFile();
      if (cmd === 'help') showPublishDialog(null);
      if (cmd === 'share-access') shareAccess();
      if (cmd === 'lock') {
        confirmLeave('Logge ut likevel?').then(function (ok) {
          if (!ok) return;
          state.dirty = false;
          Jul.auth.clear();
          global.location.reload();
        });
      }
    });

    /** Spør før endringer kastes. Gir true med en gang når alt er lagret. */
    function confirmLeave(question) {
      if (!state.dirty) return Promise.resolve(true);
      return Jul.ui.confirm({
        title: 'Du har ulagrede endringer',
        message: 'Endringene i ' + state.list.name + ' er ikke lagret. ' + question,
        ok: 'Forkast endringene', cancel: 'Bli her', danger: true, icon: 'alert'
      });
    }
    document.addEventListener('click', function (ev) {
      var m = $('.ed-menu');
      if (m.open && !m.contains(ev.target)) m.open = false;
    });
    $('#import-file').addEventListener('change', function (ev) {
      if (ev.target.files[0]) importBackup(ev.target.files[0]);
      ev.target.value = '';
    });

    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' && !$('#workspace').hidden) {
        ev.preventDefault();
        saveToGitHub();
      }
    });

    global.addEventListener('beforeunload', function (ev) {
      if (state.dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshData();
    });
    global.addEventListener('focus', refreshData);
  }

  /**
   * Henter ønskelisten på nytt når du kommer tilbake til fanen og ikke har
   * ulagrede endringer, så redigereren viser det andre har lagret. Med ulagrede
   * endringer gjør ikke det noe: «Lagre» fletter inn andres endringer uansett.
   */
  var sync = { loadedAt: Date.now(), savedAt: 0, busy: false };
  var REFRESH_AFTER = 2 * 60 * 1000;
  var SETTLE_AFTER_SAVE = 3 * 60 * 1000; // GitHub Pages bruker litt tid på å vise ny versjon
  function canRefresh() {
    var now = Date.now();
    return !$('#workspace').hidden && !state.dirty && !saving && !sync.busy && !$('dialog[open]') &&
      now - sync.loadedAt >= REFRESH_AFTER && now - sync.savedAt >= SETTLE_AFTER_SAVE;
  }
  function refreshData() {
    if (!canRefresh()) return;
    sync.busy = true;
    Jul.loadData(state.list.id).then(function (data) {
      sync.busy = false;
      if (!canRefresh()) return;
      sync.loadedAt = Date.now();
      var fresh = normalize(data);
      var changed = people().some(function (p) {
        var own = function (w) { return w.person === p.id; };
        return Jul.serializeWishes(fresh.wishes.filter(own)) !== state.saved[p.id];
      });
      if (!changed) return;
      state.data.wishes = fresh.wishes;
      people().forEach(function (p) { state.saved[p.id] = personFile(p.id); });
      if (!wishById(state.selected)) {
        var first = wishesFor(state.person)[0];
        state.selected = first ? first.id : null;
      }
      renderAll();
      setDirty(false);
      toast('Oppdatert med endringer andre har gjort');
    }, function () { sync.busy = false; });
  }

  /* ---------------- Oppstart ---------------- */
  function init() {
    hydrateIcons(document);
    Jul.installImageFallback(document);
    if (!Jul.auth.available()) {
      $('#data-status').textContent = 'Nettleseren støtter ikke innloggingen her. Bruk en oppdatert nettleser og åpne verktøyet via https.';
      return;
    }
    initUnlock();
    initWorkspace();
    initShareAccess();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
