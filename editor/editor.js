/*!
 * Juleønsker 2026 – lokalt redigeringsverktøy.
 * Dekrypterer datafilen i nettleseren, lar deg endre ønskene og
 * lager en ny kryptert datafil (wishlist.enc.js) som lastes opp til GitHub.
 */
(function (global) {
  'use strict';

  var Jul = global.Jul;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var e = Jul.escape;

  var state = {
    payload: null,   // kryptert innhold som ble lastet
    key: null,       // AES-nøkkel
    salt: null,
    iter: Jul.crypto.ITERATIONS,
    data: null,      // { version, title, people, wishes }
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
    d.textContent = on ? 'Ulagrede endringer – last ned datafilen' : 'Alt er lagret';
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
      version: 1,
      title: data.title || 'Juleønsker 2026',
      people: (data.people && data.people.length ? data.people : Jul.DEFAULT_PEOPLE).map(function (p) {
        return { id: p.id, name: p.name, accent: p.accent };
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
          priority: +w.priority || 0,
          createdAt: w.createdAt || new Date().toISOString()
        };
      })
    };
    return out;
  }

  /* ---------------- Åpning ---------------- */
  function initUnlock() {
    Jul.loadDataScript('../data/wishlist.enc.js').then(function (payload) {
      var st = $('#data-status');
      if (payload) {
        state.payload = payload;
        st.innerHTML = Jul.icon('check') + 'Fant den krypterte datafilen <code>data/wishlist.enc.js</code>';
        st.className = 'ed-status is-ok';
        if (!matchMedia('(pointer: coarse)').matches) $('#ed-password').focus();
      } else {
        st.innerHTML = Jul.icon('file') + 'Fant ingen datafil. Velg «Åpne en annen datafil» eller «Start helt på nytt».';
        st.className = 'ed-status is-warn';
      }
    });

    $('#open-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pw = $('#ed-password').value;
      var err = $('#open-error');
      if (!state.payload) { err.textContent = 'Ingen datafil er valgt.'; return; }
      if (!pw) { err.textContent = 'Skriv inn passordet.'; return; }
      var btn = $('#open-btn');
      btn.classList.add('is-loading'); btn.disabled = true;
      err.textContent = '';
      Jul.crypto.unlockWithPassword(state.payload, pw).then(function (res) {
        state.key = res.key;
        state.salt = state.payload.salt;
        state.iter = state.payload.iter || Jul.crypto.ITERATIONS;
        openWorkspace(res.data);
      }).catch(function () {
        err.textContent = 'Feil passord, eller filen er skadet.';
        $('#ed-password').select();
      }).then(function () {
        btn.classList.remove('is-loading'); btn.disabled = false;
      });
    });

    $('#open-file').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      readText(f).then(function (text) {
        try {
          state.payload = Jul.parseDataFile(text);
          var st = $('#data-status');
          st.innerHTML = Jul.icon('check') + 'Valgt fil: <code>' + e(f.name) + '</code>';
          st.className = 'ed-status is-ok';
          showNewForm(false);
          $('#ed-password').focus();
        } catch (err) {
          $('#open-error').textContent = 'Kunne ikke lese filen: ' + err.message;
        }
      });
      ev.target.value = '';
    });

    $('#toggle-new').addEventListener('click', function () {
      showNewForm($('#new-form').hidden);
    });

    $('#new-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var a = $('#new-pw').value, b = $('#new-pw2').value, err = $('#new-error');
      if (a.length < 6) { err.textContent = 'Passordet må ha minst 6 tegn.'; return; }
      if (a !== b) { err.textContent = 'Passordene er ikke like.'; return; }
      if (state.payload && !global.confirm('Dette erstatter dagens ønskeliste når du laster opp den nye filen. Fortsette?')) return;
      var salt = Jul.crypto.randomSalt();
      Jul.crypto.keyFromPassword(a, salt).then(function (key) {
        state.key = key; state.salt = salt; state.iter = Jul.crypto.ITERATIONS;
        openWorkspace({ people: Jul.DEFAULT_PEOPLE, wishes: [] });
        setDirty(true);
      });
    });
  }

  function showNewForm(show) {
    $('#new-form').hidden = !show;
    $('#open-form').hidden = show;
    $('#toggle-new').textContent = show ? 'Åpne eksisterende liste' : 'Start helt på nytt';
    if (show) $('#new-pw').focus();
  }

  function openWorkspace(data) {
    state.data = normalize(data);
    state.person = people()[0].id;
    var first = wishesFor(state.person)[0];
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
        '<span class="ed-person__dot" aria-hidden="true">' + e(p.name.charAt(0)) + '</span>' +
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
        (+w.priority === 2 ? Jul.icon('star', 'ed-star') : '') + e(w.title || 'Uten navn') + '</span>' +
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
    setRadio(form, 'priority', String(+w.priority || 0));
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
      storeUrl: '', prisjaktUrl: '', hidePrisjakt: false, linkLabel: '', priceMin: null, priceMax: null, priority: 0
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
    if (!global.confirm('Slette «' + (w.title || 'Uten navn') + '»?')) return;
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

  /* ---------------- Lagring / nedlasting ---------------- */
  function buildFile() {
    var data = JSON.parse(JSON.stringify(state.data));
    data.updatedAt = new Date().toISOString();
    return Jul.crypto.encryptWithKey(data, state.key, state.salt, state.iter).then(function (payload) {
      state.payload = payload;
      return Jul.buildDataFile(payload);
    });
  }

  function downloadDataFile() {
    var missing = state.data.wishes.filter(function (w) { return !w.title.trim(); }).length;
    if (missing && !global.confirm(missing + ' ønske(r) mangler produktnavn. Laste ned likevel?')) return;
    var btn = $('#download-btn');
    btn.disabled = true;
    buildFile().then(function (text) {
      download('wishlist.enc.js', text, 'text/javascript');
      setDirty(false);
      $('#publish-dialog').showModal();
    }).catch(function (err) {
      global.alert('Noe gikk galt: ' + err.message);
    }).then(function () { btn.disabled = false; });
  }

  function exportBackup() {
    if (!global.confirm('Backupen er IKKE kryptert. Ta vare på den lokalt og ikke last den opp til GitHub. Fortsette?')) return;
    var d = new Date().toISOString().slice(0, 10);
    download('onskeliste-backup-' + d + '.json', JSON.stringify(state.data, null, 2), 'application/json');
  }

  function importBackup(file) {
    readText(file).then(function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.wishes)) throw new Error('Filen ser ikke ut som en backup av ønskelisten');
      if (!global.confirm('Erstatte alle ønsker med innholdet i backupen (' + data.wishes.length + ' ønsker)?')) return;
      state.data = normalize(data);
      if (!personById(state.person)) state.person = people()[0].id;
      var first = wishesFor(state.person)[0];
      state.selected = first ? first.id : null;
      buildStaticSelects();
      renderAll();
      setDirty(true);
      toast('Backupen er importert');
    }).catch(function (err) { global.alert('Kunne ikke importere: ' + err.message); });
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
        case 'priority':
          w.priority = +t.value;
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
    $('#download-btn').addEventListener('click', downloadDataFile);
    $('.ed-menu').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cmd]');
      if (!b) return;
      $('.ed-menu').open = false;
      var cmd = b.getAttribute('data-cmd');
      if (cmd === 'export') exportBackup();
      if (cmd === 'import') $('#import-file').click();
      if (cmd === 'password') openPasswordDialog();
      if (cmd === 'help') $('#publish-dialog').showModal();
      if (cmd === 'lock') {
        if (state.dirty && !global.confirm('Du har ulagrede endringer. Lukke likevel?')) return;
        state.dirty = false;
        global.location.reload();
      }
    });
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
        downloadDataFile();
      }
    });

    global.addEventListener('beforeunload', function (ev) {
      if (state.dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });

    // Bytt passord
    $('#password-form').addEventListener('submit', function (ev) {
      var dlg = $('#password-dialog');
      if (ev.submitter && ev.submitter.value === 'cancel') return;
      ev.preventDefault();
      var a = $('#chg-pw').value, b = $('#chg-pw2').value, err = $('#chg-error');
      if (a.length < 6) { err.textContent = 'Passordet må ha minst 6 tegn.'; return; }
      if (a !== b) { err.textContent = 'Passordene er ikke like.'; return; }
      var salt = Jul.crypto.randomSalt();
      $('#chg-save').disabled = true;
      Jul.crypto.keyFromPassword(a, salt).then(function (key) {
        state.key = key; state.salt = salt; state.iter = Jul.crypto.ITERATIONS;
        setDirty(true);
        dlg.close();
        toast('Passordet er byttet – last ned og last opp datafilen');
      }).then(function () { $('#chg-save').disabled = false; });
    });
  }

  function openPasswordDialog() {
    $('#chg-pw').value = '';
    $('#chg-pw2').value = '';
    $('#chg-error').textContent = '';
    $('#password-dialog').showModal();
  }

  /* ---------------- Oppstart ---------------- */
  function init() {
    hydrateIcons(document);
    Jul.installImageFallback(document);
    if (!Jul.crypto.hasCrypto()) {
      $('#data-status').textContent = 'Nettleseren støtter ikke Web Crypto her. Bruk en oppdatert Chrome, Edge, Firefox eller Safari.';
      return;
    }
    initUnlock();
    initWorkspace();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
