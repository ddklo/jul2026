/*!
 * Juleønsker – felles kode for nettsiden og redigeringsverktøyet.
 * Kryptering (Web Crypto: PBKDF2 + AES-GCM), ikoner og produktkort.
 * Ingen eksterne avhengigheter.
 */
(function (global) {
  'use strict';

  var Jul = (global.Jul = global.Jul || {});

  /* ------------------------------------------------------------------ *
   * Base64-hjelpere (tåler store datamengder, f.eks. innebygde bilder)
   * ------------------------------------------------------------------ */
  function bytesToB64(bytes) {
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64ToBytes(str) {
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Kryptering
   * Format på datafilen (window.JUL_WISHLIST):
   * { v, alg, kdf, iter, salt, iv, data }  – alt binært som base64.
   * ------------------------------------------------------------------ */
  var ITERATIONS = 600000; // PBKDF2-SHA-256, OWASP-anbefaling
  var te = new TextEncoder();
  var td = new TextDecoder();

  function hasCrypto() {
    return !!(global.crypto && global.crypto.subtle);
  }

  function deriveKey(password, saltBytes, iterations) {
    return global.crypto.subtle
      .importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return global.crypto.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iterations || ITERATIONS },
          base,
          { name: 'AES-GCM', length: 256 },
          true, // kan eksporteres slik at innloggingen kan huskes uten å lagre passordet
          ['encrypt', 'decrypt']
        );
      });
  }

  function randomBytes(n) {
    var b = new Uint8Array(n);
    global.crypto.getRandomValues(b);
    return b;
  }

  /** Krypterer et objekt med en ferdig nøkkel. */
  function encryptWithKey(obj, key, saltB64, iterations) {
    var iv = randomBytes(12);
    var plain = te.encode(JSON.stringify(obj));
    return global.crypto.subtle
      .encrypt({ name: 'AES-GCM', iv: iv }, key, plain)
      .then(function (ct) {
        return {
          v: 1,
          alg: 'AES-256-GCM',
          kdf: 'PBKDF2-SHA-256',
          iter: iterations || ITERATIONS,
          salt: saltB64,
          iv: bytesToB64(iv),
          data: bytesToB64(new Uint8Array(ct))
        };
      });
  }

  /** Krypterer med passord. Ny salt lages hvis ingen oppgis. */
  function encryptWithPassword(obj, password, saltB64) {
    var salt = saltB64 ? b64ToBytes(saltB64) : randomBytes(16);
    var sB64 = saltB64 || bytesToB64(salt);
    return deriveKey(password, salt, ITERATIONS).then(function (key) {
      return encryptWithKey(obj, key, sB64, ITERATIONS).then(function (payload) {
        return { payload: payload, key: key };
      });
    });
  }

  function decryptWithKey(payload, key) {
    return global.crypto.subtle
      .decrypt({ name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.data))
      .then(function (buf) {
        return JSON.parse(td.decode(buf));
      });
  }

  function decryptWithPassword(payload, password) {
    return deriveKey(password, b64ToBytes(payload.salt), payload.iter || ITERATIONS).then(function (key) {
      return decryptWithKey(payload, key).then(function (data) {
        return { data: data, key: key };
      });
    });
  }

  /**
   * Prøver passordet slik det er skrevet, så uten mellomrom foran/bak og til
   * slutt med små bokstaver. Mobiltastaturer legger ofte til et mellomrom
   * eller gjør første bokstav stor. Gir feil med wrongPassword = true hvis
   * ingen av variantene passer; andre feil sendes videre uendret.
   */
  function unlockWithPassword(payload, password) {
    var tries = [];
    [password, password.trim(), password.trim().toLowerCase()].forEach(function (p) {
      if (p && tries.indexOf(p) === -1) tries.push(p);
    });
    var i = 0;
    function next() {
      if (i >= tries.length) {
        var err = new Error('Feil passord');
        err.wrongPassword = true;
        return Promise.reject(err);
      }
      return decryptWithPassword(payload, tries[i++]).catch(function (err) {
        // Feil nøkkel gir OperationError fra AES-GCM; alt annet er en ekte feil
        if (err && err.name === 'OperationError') return next();
        throw err;
      });
    }
    return next();
  }

  function exportKey(key) {
    return global.crypto.subtle.exportKey('raw', key).then(function (raw) {
      return bytesToB64(new Uint8Array(raw));
    });
  }
  function importKey(b64) {
    return global.crypto.subtle.importKey('raw', b64ToBytes(b64), { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt'
    ]);
  }

  Jul.crypto = {
    ITERATIONS: ITERATIONS,
    hasCrypto: hasCrypto,
    deriveKey: deriveKey,
    encryptWithKey: encryptWithKey,
    encryptWithPassword: encryptWithPassword,
    decryptWithKey: decryptWithKey,
    decryptWithPassword: decryptWithPassword,
    unlockWithPassword: unlockWithPassword,
    exportKey: exportKey,
    importKey: importKey,
    randomSalt: function () {
      return bytesToB64(randomBytes(16));
    },
    /** Avleder nøkkel fra passord og salt (base64). */
    keyFromPassword: function (password, saltB64, iterations) {
      return deriveKey(password, b64ToBytes(saltB64), iterations || ITERATIONS);
    }
  };

  /* ------------------------------------------------------------------ *
   * Husket innlogging: lagrer den avledede nøkkelen (ikke passordet).
   * «Husk meg» → localStorage, ellers sessionStorage (gjelder fanen).
   * ------------------------------------------------------------------ */
  var SESSION_KEY = 'juleonsker:key';
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
  Jul.session = {
    save: function (salt, keyB64, persistent) {
      var value = JSON.stringify({ salt: salt, key: keyB64 });
      var ls = safeStore('localStorage');
      var ss = safeStore('sessionStorage');
      if (persistent && ls) ls.setItem(SESSION_KEY, value);
      if (ss) ss.setItem(SESSION_KEY, value);
    },
    load: function () {
      var stores = [safeStore('sessionStorage'), safeStore('localStorage')];
      for (var i = 0; i < stores.length; i++) {
        if (!stores[i]) continue;
        try {
          var v = JSON.parse(stores[i].getItem(SESSION_KEY) || 'null');
          if (v && v.salt && v.key) return v;
        } catch (e) { /* ignorer */ }
      }
      return null;
    },
    clear: function () {
      ['localStorage', 'sessionStorage'].forEach(function (t) {
        var s = safeStore(t);
        if (s) s.removeItem(SESSION_KEY);
      });
    }
  };

  /* ------------------------------------------------------------------ *
   * Laster den krypterte datafilen som <script> (fungerer også fra
   * file:// uten webserver). Cache-buster sikrer ferske data.
   * ------------------------------------------------------------------ */
  Jul.loadDataScript = function (src) {
    return new Promise(function (resolve) {
      global.JUL_WISHLIST = undefined;
      var s = document.createElement('script');
      s.src = src + (src.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
      s.onload = function () {
        resolve(global.JUL_WISHLIST || null);
        s.remove();
      };
      s.onerror = function () {
        resolve(null);
        s.remove();
      };
      document.head.appendChild(s);
    });
  };

  /** Lager innholdet i datafilen wishlist.enc.js */
  Jul.buildDataFile = function (payload) {
    return (
      '/*\n' +
      ' * Juleønsker – kryptert ønskelistedata (AES-256-GCM, PBKDF2-SHA-256).\n' +
      ' * Generert av redigeringsverktøyet. Ikke rediger for hånd.\n' +
      ' */\n' +
      'window.JUL_WISHLIST = ' +
      JSON.stringify(payload) +
      ';\n'
    );
  };

  /** Leser en datafil (.js eller .json) som tekst og returnerer payload-objektet. */
  Jul.parseDataFile = function (text) {
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Fant ingen data i filen');
    var obj = JSON.parse(text.slice(start, end + 1));
    if (!obj.salt || !obj.iv || !obj.data) throw new Error('Filen er ikke en kryptert ønskeliste');
    return obj;
  };

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
    menu: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'
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

  /** Pris brukt til sortering (midtpunkt av intervallet). */
  Jul.priceValue = function (w) {
    var a = +w.priceMin || 0;
    var b = +w.priceMax || 0;
    if (a && b) return (a + b) / 2;
    return a || b || 0;
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
    return Jul.safeUrl(url);
  };

  Jul.prisjaktSearch = function (title) {
    return 'https://www.prisjakt.no/search?search=' + encodeURIComponent(title || '');
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
   * opts: { index, personName, accent }
   * ------------------------------------------------------------------ */
  Jul.cardHTML = function (w, opts) {
    opts = opts || {};
    var e = Jul.escape;
    var img = Jul.safeImage(w.image);
    var store = Jul.safeUrl(w.storeUrl);
    var pj = w.hidePrisjakt ? '' : Jul.safeUrl(w.prisjaktUrl) || (w.title ? Jul.prisjaktSearch(w.title) : '');
    var price = Jul.formatPrice(+w.priceMin, +w.priceMax);
    var fit = w.imageFit === 'cover' ? ' card__media--cover' : '';

    var media = img
      ? '<img src="' + e(img) + '" alt="' + e(w.title || '') + '" loading="lazy" decoding="async">'
      : Jul.placeholderArt();

    var person = opts.personName
      ? '<span class="card__person" style="--accent:' + e(opts.accent || 'var(--gold)') + '">' + e(opts.personName) + '</span>'
      : '';

    var actions = '';
    if (store) {
      actions += '<a class="btn btn--primary btn--sm" href="' + e(store) + '" target="_blank" rel="noopener noreferrer">' + e(w.linkLabel || 'Se i butikk') + Jul.icon('external') + '</a>';
    }
    if (pj) {
      actions += '<a class="btn btn--ghost btn--sm" href="' + e(pj) + '" target="_blank" rel="noopener noreferrer" title="Sammenlign priser på Prisjakt">' + Jul.icon('chart') + 'Prisjakt</a>';
    }

    return (
      '<article class="card" style="--i:' + (opts.index || 0) + '" data-id="' + e(w.id) + '">' +
      '<div class="card__media' + (img ? fit : ' card__media--art') + '">' + media + '</div>' +
      '<div class="card__body">' +
      (person ? '<div class="card__meta">' + person + '</div>' : '') +
      '<h3 class="card__title">' + e(w.title || 'Uten navn') + '</h3>' +
      (w.description ? '<p class="card__desc">' + e(w.description) + '</p>' : '') +
      '<div class="card__bottom">' +
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
