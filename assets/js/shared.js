/*!
 * Juleønsker – felles kode for nettsiden og redigeringsverktøyet.
 * Innlogging, lasting av data, ikoner og produktkort.
 * Ingen eksterne avhengigheter.
 */
(function (global) {
  'use strict';

  var Jul = (global.Jul = global.Jul || {});

  /* ------------------------------------------------------------------ *
   * Stier
   * ROOT er veien fra siden til nettstedets rot: '' for nettsiden,
   * '../' for redigeringsverktøyet (settes av editor.js).
   * ------------------------------------------------------------------ */
  Jul.ROOT = '';

  /* ------------------------------------------------------------------ *
   * Innlogging
   * Passordet er bare en enkel sperre, ikke ekte sikkerhet: dataene ligger
   * åpent i data/*.json. Passordene lagres som SHA-256 her, slik at de ikke
   * står i klartekst i koden.
   *   jul2026      → «view»  (se, redigere, flytte og slette ønsker og oppdatere priser)
   *   jul2026admin → «admin» (det samme, og sette opp lagring: Del lagring med familien)
   * Navnet «view» er beholdt så huskede innlogginger fortsatt virker.
   * Ny hash: node -e "console.log(require('crypto').createHash('sha256').update('passord').digest('hex'))"
   * ------------------------------------------------------------------ */
  var PASSWORDS = {
    ccd5c56ba634a45001b947000dd469de84e68e7a4b37f992dcc5b8673067a4ac: 'view',
    '1a298537be786c591ffb5e2da84f11c13ad7e1af5737d29677430d8c7f488e25': 'admin'
  };

  function sha256hex(text) {
    return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  /** Passordet som skrevet, uten mellomrom foran/bak, og med små bokstaver. */
  function passwordVariants(password) {
    var tries = [];
    [password, password.trim(), password.trim().toLowerCase()].forEach(function (p) {
      if (p && tries.indexOf(p) === -1) tries.push(p);
    });
    return tries;
  }

  var ROLE_KEY = 'juleonsker:role';
  function safeStore(type) {
    try {
      var s = global[type];
      var t = '__t';
      s.setItem(t, t);
      s.removeItem(t);
      return s;
    } catch (e) {
      return null;
    }
  }

  Jul.auth = {
    available: function () {
      return !!(global.crypto && global.crypto.subtle);
    },
    /**
     * Gir rollen ('view' eller 'admin') for passordet, eller null.
     * Prøver også uten mellomrom foran/bak og med små bokstaver, fordi
     * mobiltastaturer ofte legger til mellomrom eller stor forbokstav.
     */
    check: function (password) {
      return Promise.all(passwordVariants(password).map(sha256hex)).then(function (hashes) {
        for (var i = 0; i < hashes.length; i++) if (PASSWORDS[hashes[i]]) return PASSWORDS[hashes[i]];
        return null;
      });
    },
    /**
     * Logger inn: sjekker passordet, husker rollen og låser opp det felles
     * GitHub-tokenet (se Jul.access), slik at alle kan lagre endringer.
     * Gir rollen, eller null ved feil passord.
     */
    login: function (password, persistent) {
      return Jul.auth.check(password).then(function (role) {
        if (!role) return null;
        Jul.auth.save(role, persistent);
        return Jul.access.unlock(password).then(function (token) {
          if (token) Jul.github.setToken(token, persistent);
          return role;
        }, function () { return role; });
      });
    },
    /** Om innloggingen huskes på enheten («Husk meg»). */
    remembered: function () {
      var ls = safeStore('localStorage');
      return !!(ls && ls.getItem(ROLE_KEY));
    },
    /** «Husk meg» → localStorage, ellers sessionStorage (gjelder fanen). */
    save: function (role, persistent) {
      var ls = safeStore('localStorage');
      var ss = safeStore('sessionStorage');
      if (persistent && ls) ls.setItem(ROLE_KEY, role);
      if (ss) ss.setItem(ROLE_KEY, role);
    },
    load: function () {
      var stores = [safeStore('sessionStorage'), safeStore('localStorage')];
      for (var i = 0; i < stores.length; i++) {
        var r = stores[i] && stores[i].getItem(ROLE_KEY);
        if (r === 'view' || r === 'admin') return r;
      }
      return null;
    },
    clear: function () {
      ['localStorage', 'sessionStorage'].forEach(function (t) {
        var s = safeStore(t);
        if (s) {
          s.removeItem(ROLE_KEY);
          s.removeItem('jul-gh-token');
          s.removeItem('juleonsker:key'); // fra da listen var kryptert
        }
      });
    }
  };

  /* ------------------------------------------------------------------ *
   * Data
   * data/personer.json        { title, lists: [{ id, name }], people: [{ id, name, accent }] }
   * data/<liste>/<person>.json { wishes: [...] }  – én fil per person og liste, i visningsrekkefølge
   * Ønskene får feltet `person` når de lastes inn; det lagres ikke i filene.
   * ------------------------------------------------------------------ */
  function getJSON(path) {
    return fetch(Jul.ROOT + path + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' (' + r.status + ')');
      return r.json();
    });
  }

  /** Listene (Bergen, Sørumsand …) og personene, uten ønsker. */
  Jul.loadMeta = function () {
    return getJSON('data/personer.json');
  };

  /** Ønskene i én liste. Gir { title, list, lists, people, wishes }. */
  Jul.loadData = function (listId) {
    return Jul.loadMeta().then(function (meta) {
      var list = (meta.lists || []).filter(function (l) { return l.id === listId; })[0];
      if (!list) throw new Error('Fant ikke listen «' + listId + '» i data/personer.json');
      var people = meta.people && meta.people.length ? meta.people : Jul.DEFAULT_PEOPLE;
      return Promise.all(people.map(function (p) {
        return getJSON('data/' + list.id + '/' + p.id + '.json');
      })).then(function (files) {
        var wishes = [];
        files.forEach(function (f, i) {
          (f.wishes || []).forEach(function (w) {
            w.person = people[i].id;
            wishes.push(w);
          });
        });
        return { title: meta.title, list: list, lists: meta.lists, people: people, wishes: wishes };
      });
    });
  };

  // Feltene i personfilene, i fast rekkefølge (person ligger i filnavnet)
  var WISH_FIELDS = ['id', 'title', 'description', 'image', 'imageFit', 'storeUrl', 'linkLabel', 'prisjaktUrl',
    'hidePrisjakt', 'priceMin', 'priceMax', 'livePrice', 'createdAt'];

  /** Innholdet i data/<liste>/<person>.json for ønskene til én person. */
  Jul.serializeWishes = function (wishes) {
    return JSON.stringify({
      wishes: wishes.map(function (w) {
        var o = {};
        WISH_FIELDS.forEach(function (k) { if (w[k] !== undefined) o[k] = w[k]; });
        return o;
      })
    }, null, 2) + '\n';
  };

  /** Filen i repoet for én person i én liste. */
  Jul.dataPath = function (listId, personId) {
    return 'data/' + listId + '/' + personId + '.json';
  };

  /* ------------------------------------------------------------------ *
   * Lagring til GitHub
   * Endringer committes rett til repoet med GitHub-API-et. Alle bruker ett
   * felles fine-grained token for dette repoet («Contents» og «Actions»:
   * Read and write). Administrator legger det inn én gang
   * (redigeringsverktøyet → Mer → Del lagring med familien). Tokenet lagres
   * kryptert med passordene i data/tilgang.json og låses opp i nettleseren
   * når noen logger inn. Passordet er en enkel sperre, ikke ekte sikkerhet:
   * se «Om passordet» i README.
   * ------------------------------------------------------------------ */
  var TOKEN_KEY = 'jul-gh-token';
  var API = 'https://api.github.com/repos/';
  var BRANCH = 'main';
  var ACCESS_FILE = 'data/tilgang.json';
  var ACCESS_ITER = 100000;

  function b64utf8(text) {
    return bytesToB64(new TextEncoder().encode(text));
  }
  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToBytes(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function ghError(status, what) {
    var msg =
      status === 401 ? 'GitHub-tokenet er ugyldig eller utløpt. Be administrator om å legge inn et nytt.' :
      status === 403 || status === 404 ? 'GitHub-tokenet mangler tilgang til ' + what + ' i ' + Jul.REPO + '.' :
      'GitHub svarte med feil ' + status + '.';
    var err = new Error(msg);
    err.status = status;
    return err;
  }
  function cancelled() {
    return Object.assign(new Error('Avbrutt'), { cancelled: true });
  }

  /* ---------- Det felles tokenet, kryptert med passordene ---------- */
  function passwordKey(password, salt, iter) {
    var subtle = global.crypto.subtle;
    return subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  var accessFile = null;
  Jul.access = {
    /** Innholdet i data/tilgang.json, eller null hvis lagring ikke er satt opp. */
    load: function () {
      if (!accessFile) {
        accessFile = fetch(Jul.ROOT + ACCESS_FILE + '?t=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      }
      return accessFile;
    },
    /** Låser opp det felles tokenet med et passord. Gir tokenet, eller null. */
    unlock: function (password) {
      return Jul.access.load().then(function (file) {
        if (!file || !file.entries) return null;
        var jobs = [];
        passwordVariants(password).forEach(function (p) {
          file.entries.forEach(function (entry) { jobs.push([p, entry]); });
        });
        var i = 0;
        function next() {
          if (i >= jobs.length) return null;
          var job = jobs[i++];
          return passwordKey(job[0], b64ToBytes(job[1].salt), file.iter || ACCESS_ITER)
            .then(function (key) {
              return global.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(job[1].iv) }, key, b64ToBytes(job[1].data));
            })
            .then(function (buf) { return new TextDecoder().decode(buf); }, next);
        }
        return next();
      });
    },
    /** Lager innholdet i data/tilgang.json: tokenet kryptert én gang per passord. */
    build: function (token, passwords) {
      return Promise.all(passwords.map(function (pw) {
        var salt = global.crypto.getRandomValues(new Uint8Array(16));
        var iv = global.crypto.getRandomValues(new Uint8Array(12));
        return passwordKey(pw, salt, ACCESS_ITER).then(function (key) {
          return global.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(token));
        }).then(function (ct) {
          return { salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(ct)) };
        });
      })).then(function (entries) {
        accessFile = null;
        return JSON.stringify({ v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iter: ACCESS_ITER, entries: entries }, null, 2) + '\n';
      });
    },
    path: ACCESS_FILE
  };

  /* ---------- Dialoger ---------- */
  function makeDialog(o) {
    var d = document.createElement('dialog');
    d.className = 'ed-dialog';
    d.innerHTML =
      '<form method="dialog" class="ed-dialog__inner glass" novalidate>' +
      '<span class="ed-dialog__icon">' + Jul.icon(o.icon) + '</span>' +
      '<h2>' + o.title + '</h2>' + o.body +
      '<div class="field"><span class="field__icon">' + Jul.icon(o.icon) + '</span>' +
      '<input type="password" name="value" placeholder="' + o.placeholder + '" autocomplete="' + (o.autocomplete || 'off') + '" ' +
      'autocapitalize="off" spellcheck="false" aria-label="' + o.placeholder + '"></div>' +
      (o.hint ? '<p class="ed-hint">' + o.hint + '</p>' : '') +
      '<p class="login__error" role="alert"></p>' +
      '<div class="ed-dialog__actions">' +
      '<button class="btn btn--ghost" value="cancel" formnovalidate>Avbryt</button>' +
      '<button class="btn btn--gold" value="ok">' + o.ok + '</button></div></form>';
    document.body.appendChild(d);
    return d;
  }

  /**
   * Viser en dialog med ett felt. check(verdi) gir et Promise med resultatet,
   * eller kaster en feil med meldingen som skal vises. Avbryt gir { cancelled }.
   */
  function askInDialog(d, check) {
    var form = d.querySelector('form'), input = form.elements.value, err = d.querySelector('.login__error');
    input.value = '';
    err.textContent = '';
    d.showModal();
    input.focus();
    return new Promise(function (resolve, reject) {
      var busy = false;
      function done() {
        form.removeEventListener('submit', onSubmit);
        d.removeEventListener('close', onClose);
      }
      function onClose() { done(); reject(cancelled()); }
      function onSubmit(ev) {
        if (ev.submitter && ev.submitter.value === 'cancel') return;
        ev.preventDefault();
        if (busy) return;
        var v = input.value.trim();
        if (!v) { err.textContent = 'Feltet er tomt.'; return; }
        busy = true;
        err.textContent = 'Sjekker …';
        check(v).then(function (result) {
          done();
          d.close();
          resolve(result);
        }, function (e) {
          err.textContent = e instanceof TypeError ? 'Fikk ikke kontakt med GitHub. Er du på nett?' : e.message;
          input.select();
        }).then(function () { busy = false; });
      }
      form.addEventListener('submit', onSubmit);
      d.addEventListener('close', onClose);
    });
  }

  var passwordDialog = null, tokenDialog = null;

  /** Sjekker at et token virker mot repoet. */
  function verifyToken(t) {
    return fetch(API + Jul.REPO, { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + t } })
      .then(function (r) {
        if (!r.ok) throw ghError(r.status, 'repoet');
        return t;
      });
  }

  Jul.github = {
    getToken: function () {
      var stores = [safeStore('sessionStorage'), safeStore('localStorage')];
      for (var i = 0; i < stores.length; i++) {
        var t = stores[i] && stores[i].getItem(TOKEN_KEY);
        if (t) return t;
      }
      return '';
    },
    /** Husker tokenet like lenge som innloggingen («Husk meg» → localStorage). */
    setToken: function (v, persistent) {
      ['localStorage', 'sessionStorage'].forEach(function (t) {
        var s = safeStore(t);
        if (!s) return;
        if (v && (t === 'sessionStorage' || persistent)) s.setItem(TOKEN_KEY, v);
        else s.removeItem(TOKEN_KEY);
      });
    },

    /**
     * Gir tokenet: det som ble låst opp ved innlogging, ellers spør om
     * passordet på nytt. Er lagring ikke satt opp, får administrator legge
     * inn et token direkte.
     */
    token: function () {
      var saved = Jul.github.getToken();
      if (saved) return Promise.resolve(saved);
      return Jul.access.load().then(function (file) {
        if (file) {
          passwordDialog = passwordDialog || makeDialog({
            icon: 'lock', title: 'Skriv passordet', ok: 'Lagre',
            placeholder: 'Passord', autocomplete: 'current-password',
            body: '<p>For å lagre endringer må du skrive passordet ditt én gang til.</p>'
          });
          return askInDialog(passwordDialog, function (pw) {
            return Jul.access.unlock(pw).then(function (t) {
              if (!t) throw new Error('Feil passord – prøv igjen.');
              Jul.github.setToken(t, Jul.auth.remembered());
              return t;
            });
          });
        }
        if (Jul.auth.load() !== 'admin') {
          throw new Error('Lagring er ikke satt opp ennå. Be administrator om å velge «Del lagring med familien» i redigeringsverktøyet.');
        }
        return Jul.github.askToken();
      });
    },

    /** Ber om et GitHub-token (administrator) og sjekker det mot repoet. */
    askToken: function () {
      tokenDialog = tokenDialog || makeDialog({
        icon: 'key', title: 'Koble til GitHub', ok: 'Koble til', placeholder: 'github_pat_…',
        body:
          '<p>Lagring er ikke satt opp ennå. Lag ett token som hele familien kan bruke:</p>' +
          '<ol class="ed-steps">' +
          '<li>Lag et <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">fine-grained token</a> med tilgang til bare <strong>' + Jul.escape(Jul.REPO) + '</strong>.</li>' +
          '<li>Under <strong>Permissions</strong>: <strong>Contents: Read and write</strong> og <strong>Actions: Read and write</strong>.</li>' +
          '<li>Lim inn tokenet her.</li></ol>',
        hint: 'Del det med familien etterpå med <strong>Mer → Del lagring med familien</strong> i redigeringsverktøyet.'
      });
      return askInDialog(tokenDialog, function (t) {
        return verifyToken(t).then(function () {
          Jul.github.setToken(t, Jul.auth.remembered());
          return t;
        });
      });
    },

    verifyToken: verifyToken,

    request: function (method, path, body) {
      return Jul.github.token().then(function (t) {
        return fetch(API + Jul.REPO + path, {
          method: method,
          cache: 'no-store',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + t,
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: body ? JSON.stringify(body) : undefined
        }).then(function (r) {
          // Ugyldig token: glem det, så neste forsøk ber om et nytt
          if (r.status === 401) Jul.github.setToken('');
          return r;
        });
      });
    },

    /**
     * Lagrer (committer) en tekstfil i repoet. Lagringer til samme fil står i kø,
     * slik at raske endringer etter hverandre ikke kolliderer.
     */
    saveFile: function (path, text, message) {
      var prev = queue[path] || Promise.resolve();
      var job = prev.catch(function () {}).then(function () { return putFile(path, text, message, true); });
      queue[path] = job;
      return job;
    },

    /** Starter prisjobben (.github/workflows/priser.yml). */
    runPrices: function () {
      return Jul.github.request('POST', '/actions/workflows/priser.yml/dispatches', { ref: BRANCH }).then(function (r) {
        if (r.status !== 204) throw ghError(r.status, 'Actions');
      });
    }
  };

  var queue = {};
  var shas = {};

  function currentSha(path) {
    return Jul.github.request('GET', '/contents/' + path + '?ref=' + BRANCH).then(function (r) {
      if (r.status === 404) return null; // ny fil
      if (!r.ok) throw ghError(r.status, 'Contents');
      return r.json().then(function (j) { return j.sha; });
    });
  }

  function putFile(path, text, message, retry) {
    var sha = shas[path] ? Promise.resolve(shas[path]) : currentSha(path);
    return sha.then(function (s) {
      var body = { message: message, content: b64utf8(text), branch: BRANCH };
      if (s) body.sha = s;
      return Jul.github.request('PUT', '/contents/' + path, body);
    }).then(function (r) {
      // Filen er endret av noen andre siden sist (f.eks. prisjobben): hent ny sha og prøv igjen
      if ((r.status === 409 || r.status === 422) && retry) {
        delete shas[path];
        return putFile(path, text, message, false);
      }
      if (!r.ok) throw ghError(r.status, 'Contents');
      return r.json().then(function (j) { shas[path] = j.content && j.content.sha; });
    });
  }

  /* ------------------------------------------------------------------ *
   * Ikoner (egne, linjebaserte SVG-ikoner)
   * ------------------------------------------------------------------ */
  var ICONS = {
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="m4.14 15.08 2.86-1.08 3 2 4-3 3 1.5"/>',
    blocks: '<rect x="14" y="3" width="7" height="7" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>',
    gamepad: '<path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    lamp: '<path d="M8 2h8l4 10H4L8 2Z"/><path d="M12 12v6"/><path d="M8 22v-2c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v2H8Z"/>',
    sparkles: '<path d="M10 3.5 11.7 8.3 16.5 10l-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7z"/><path d="m18 14 .9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/><path d="m18 2 .6 1.4L20 4l-1.4.6L18 6l-.6-1.4L16 4l1.4-.6z"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2"/><path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>',
    star: '<path d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.5 9.4l6.6-1z"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
    snowflake: '<path d="M12 2v20"/><path d="m4.9 6 14.2 12"/><path d="m4.9 18 14.2-12"/><path d="m9 4 3 2 3-2"/><path d="m9 20 3-2 3 2"/><path d="m3.5 9.5 3.4-.4-1-3.3"/><path d="m20.5 14.5-3.4.4 1 3.3"/><path d="m3.5 14.5 3.4.4-1 3.3"/><path d="m20.5 9.5-3.4-.4 1-3.3"/>',
    tree: '<path d="m12 2 5 6h-3l4 5h-3l4 5H5l4-5H6l4-5H7z"/><path d="M12 18v4"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
    menu: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>'
  };

  Jul.icon = function (name, cls) {
    var body = ICONS[name] || ICONS.gift;
    var fill = name === 'star' ? ' fill="currentColor"' : ' fill="none"';
    return (
      '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24"' + fill +
      ' stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      body + '</svg>'
    );
  };
  Jul.ICONS = ICONS;

  /* ------------------------------------------------------------------ *
   * Formatering og sikkerhet
   * ------------------------------------------------------------------ */
  var nf = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
  function n(v) { return nf.format(v).replace(/\s/g, ' '); }

  Jul.formatPrice = function (min, max) {
    var hasMin = typeof min === 'number' && !isNaN(min) && min > 0;
    var hasMax = typeof max === 'number' && !isNaN(max) && max > 0;
    if (hasMin && hasMax) {
      if (min === max) return n(min) + ' kr';
      return n(Math.min(min, max)) + '–' + n(Math.max(min, max)) + ' kr';
    }
    if (hasMin) return 'Fra ' + n(min) + ' kr';
    if (hasMax) return 'Opptil ' + n(max) + ' kr';
    return '';
  };

  /** GitHub-repoet nettsiden publiseres fra (brukes av «Oppdater priser nå» for administrator). */
  Jul.REPO = 'ddklo/jul2026';

  /** Produkt-ID fra en Prisjakt-produktlenke (product.php?p=…), ellers null. */
  Jul.prisjaktId = function (url) {
    var m = /^https:\/\/(?:www\.)?prisjakt\.no\/product\.php\?(?:.*&)?p=(\d+)(?:&|#|$)/.exec(url || '');
    return m ? m[1] : null;
  };

  /**
   * Laveste pris hentet fra Prisjakt av den nattlige jobben (tools/priser.mjs).
   * Vises bare når den hører til produktet ønsket lenker til nå, og er ferskere enn en uke.
   */
  var LIVE_MAX_AGE = 8 * 864e5;
  var df = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
  Jul.livePrice = function (w) {
    var lp = w && w.livePrice;
    if (!lp || w.hidePrisjakt || !(lp.amount > 0)) return null;
    if (lp.productId !== Jul.prisjaktId(w.prisjaktUrl)) return null;
    var t = Date.parse(lp.checkedAt);
    if (!t || Date.now() - t > LIVE_MAX_AGE) return null;
    return { amount: lp.amount, offers: lp.offers || 0, text: n(lp.amount) + ' kr', date: df.format(t) };
  };

  /** Kort butikknavn fra en lenke: https://www.lekekassen.no/… → «Lekekassen». */
  Jul.storeName = function (url) {
    var m = /^https?:\/\/(?:www\.)?([^/:?#]+)/i.exec(url || '');
    if (!m) return '';
    var parts = m[1].split('.');
    var base = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  };

  Jul.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  Jul.safeUrl = function (url) {
    if (!url) return '';
    url = String(url).trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (/^www\./i.test(url)) return 'https://' + url;
    return '';
  };
  Jul.safeImage = function (url) {
    if (!url) return '';
    url = String(url).trim();
    if (/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml)[;,]/i.test(url)) return url;
    // Bilder i repoet (data/bilder/…) – relativt til nettstedets rot
    if (/^data\/bilder\/[\w.-]+\.(png|jpe?g|webp|gif|avif)$/i.test(url)) return Jul.ROOT + url;
    return Jul.safeUrl(url);
  };

  /* ------------------------------------------------------------------ *
   * Plassholder-illustrasjon når et ønske mangler bilde
   * ------------------------------------------------------------------ */
  Jul.placeholderArt = function () {
    var tint = ['#1c2230', '#3e4a63'];
    var uid = 'g' + Math.random().toString(36).slice(2, 8);
    return (
      '<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><radialGradient id="' + uid + '" cx="50%" cy="38%" r="75%">' +
      '<stop offset="0" stop-color="' + tint[1] + '"/><stop offset="1" stop-color="' + tint[0] + '"/></radialGradient></defs>' +
      '<rect width="400" height="300" fill="url(#' + uid + ')"/>' +
      '<circle cx="200" cy="150" r="78" fill="#fff" fill-opacity=".05"/>' +
      '<g fill="#f3e3bd" fill-opacity=".55"><circle cx="70" cy="60" r="1.6"/><circle cx="330" cy="80" r="1.2"/><circle cx="300" cy="230" r="1.8"/><circle cx="96" cy="220" r="1.1"/><circle cx="350" cy="160" r=".9"/></g>' +
      '<g transform="translate(152 102) scale(4)" fill="none" stroke="#f3e3bd" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' +
      ICONS.gift +
      '</g></svg>'
    );
  };

  /* ------------------------------------------------------------------ *
   * Produktkort
   * opts: { index, personName, accent, editUrl }
   * Med editUrl får kortet administratorverktøy: dra-håndtak, rediger og slett.
   * ------------------------------------------------------------------ */
  Jul.cardHTML = function (w, opts) {
    opts = opts || {};
    var e = Jul.escape;
    var img = Jul.safeImage(w.image);
    var store = Jul.safeUrl(w.storeUrl);
    var pj = w.hidePrisjakt ? '' : Jul.safeUrl(w.prisjaktUrl);
    var price = Jul.formatPrice(+w.priceMin, +w.priceMax);
    var live = Jul.livePrice(w);
    var fit = w.imageFit === 'cover' ? ' card__media--cover' : '';

    var media = img
      ? '<img src="' + e(img) + '" alt="' + e(w.title || '') + '" loading="lazy" decoding="async">'
      : Jul.placeholderArt();

    var person = opts.personName
      ? '<span class="card__person" style="--accent:' + e(opts.accent || 'var(--gold)') + '">' + e(opts.personName) + '</span>'
      : '';

    // Prisjakt er hovedknappen. Nettbutikken er en mindre knapp ved siden av,
    // med butikkens navn (eller egen knappetekst). Uten Prisjakt blir butikken hovedknapp.
    var ext = ' target="_blank" rel="noopener noreferrer"';
    var storeLabel = w.linkLabel || Jul.storeName(store) || 'Nettbutikk';
    var actions = '';
    if (pj) {
      actions += '<a class="btn btn--primary btn--sm" href="' + e(pj) + '"' + ext + ' title="Sammenlign priser på Prisjakt">' +
        Jul.icon('chart') + (Jul.prisjaktId(pj) ? 'Se på Prisjakt' : 'Søk på Prisjakt') + '</a>';
      if (store) {
        actions += '<a class="btn btn--ghost btn--sm card__store" href="' + e(store) + '"' + ext + ' title="' + e(storeLabel) + ' – åpnes i ny fane">' +
          '<span>' + e(storeLabel) + '</span>' + Jul.icon('external') + '</a>';
      }
    } else if (store) {
      var shop = Jul.storeName(store);
      actions += '<a class="btn btn--primary btn--sm" href="' + e(store) + '"' + ext + '>' +
        e(w.linkLabel || (shop ? 'Se hos ' + shop : 'Se i butikk')) + Jul.icon('external') + '</a>';
    }
    var mainUrl = pj || store;

    var name = e(w.title || 'Uten navn');
    var admin = opts.editUrl
      ? '<div class="card__admin">' +
        '<button type="button" class="card__tool card__grip" data-admin="drag" aria-label="Flytt «' + name + '» (dra)" title="Dra for å flytte">' + Jul.icon('grip') + '</button>' +
        '<span class="card__tools">' +
        '<a class="card__tool" href="' + e(opts.editUrl) + '" aria-label="Rediger «' + name + '»" title="Rediger">' + Jul.icon('pencil') + '</a>' +
        '<button type="button" class="card__tool card__tool--danger" data-admin="delete" aria-label="Slett «' + name + '»" title="Slett">' + Jul.icon('trash') + '</button>' +
        '</span></div>'
      : '';

    return (
      '<article class="card" style="--i:' + (opts.index || 0) + '" data-id="' + e(w.id) + '">' + admin +
      // Bilde og tittel er også lenker til hovedknappen – større trykkflate på mobil
      '<div class="card__media' + (img ? fit : ' card__media--art') + '">' + media +
      (mainUrl ? '<a class="card__media-link" href="' + e(mainUrl) + '"' + ext + ' tabindex="-1" aria-hidden="true"></a>' : '') +
      '</div>' +
      '<div class="card__body">' +
      (person ? '<div class="card__meta">' + person + '</div>' : '') +
      '<h3 class="card__title">' + (mainUrl ? '<a href="' + e(mainUrl) + '"' + ext + '>' + name + '</a>' : name) + '</h3>' +
      (w.description ? '<p class="card__desc">' + e(w.description) + '</p>' : '') +
      '<div class="card__bottom">' +
      (live
        ? '<p class="card__price card__price--live" title="Laveste pris på Prisjakt, sjekket ' + e(live.date) + '">' +
          '<span>Laveste pris nå<small>Prisjakt' + (live.offers > 1 ? ' · ' + live.offers + ' butikker' : '') + ' · ' + e(live.date) + '</small></span>' +
          '<strong>' + e(live.text) + '</strong></p>'
        : '') +
      (price ? '<p class="card__price"><span>Prisantydning</span><strong>' + price + '</strong></p>' : '') +
      (actions ? '<div class="card__actions">' + actions + '</div>' : '') +
      '</div></div></article>'
    );
  };

  /** Erstatter bilder som ikke laster med en gave-illustrasjon. */
  Jul.installImageFallback = function (root) {
    (root || document).addEventListener(
      'error',
      function (ev) {
        var t = ev.target;
        if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList.contains('card__media')) {
          var media = t.parentNode;
          media.classList.remove('card__media--cover');
          media.classList.add('card__media--art');
          var tmp = document.createElement('div');
          tmp.innerHTML = Jul.placeholderArt();
          media.replaceChild(tmp.firstChild, t);
        }
      },
      true
    );
  };

  /** Standardpersoner (brukes når datafilen mangler personer). */
  Jul.DEFAULT_PEOPLE = [
    { id: 'dagfinn', name: 'Dagfinn', accent: '#d9b26a' },
    { id: 'kristin', name: 'Kristin', accent: '#e06a7b' },
    { id: 'ellie', name: 'Ellie', accent: '#5cbf95' },
    { id: 'sidney', name: 'Sidney', accent: '#8cb8e6' }
  ];

  Jul.uid = function () {
    return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
})(window);
