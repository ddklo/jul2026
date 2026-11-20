#!/usr/bin/env node
/**
 * Fyller inn det som mangler på ønskene, slik at nye ønsker lagt inn fra
 * mobilen (ofte med bare en lenke) blir komplette. Kjøres av GitHub Actions
 * (.github/workflows/fyll-inn.yml) når ønskelistene endres og hver natt, eller manuelt:
 *
 *   node tools/fyll-inn.mjs [--mangler mangler.md]
 *
 * Fikser automatisk:
 *  - Bilde som mangler: hentes fra Prisjakt-produktsiden, ellers fra nettbutikkens
 *    delingsbilde (og:image). Lagres som WebP i data/bilder/<ønske-id>.webp.
 *  - Bilde som er en ekstern adresse eller lastet opp i verktøyet (data:-URL):
 *    lagres som fil i repoet, så det ikke forsvinner eller gjør datafilen stor.
 *  - Prisantydning som mangler: fra Prisjakts laveste pris (opp til 1,6 × laveste pris).
 *
 * Kan ikke fikses automatisk (Prisjakts søk blokkerer skript): ønsker uten
 * Prisjakt-produktlenke. De skrives til --mangler-filen (markdown), som
 * arbeidsflyten bruker til en GitHub-sak. Sett «Skjul Prisjakt-knappen» på
 * ønsker som ikke finnes på Prisjakt, så blir de ikke meldt.
 *
 * Krever sharp for bildekonvertering: npm install --no-save sharp@0.33.5
 */
import { existsSync } from 'node:fs';
import { writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DATA, UA, personFiles, readJSON, writeWishes, prisjaktId, prisjaktProduct, fetchText, jsonLd, sleep } from './felles.mjs';

const args = process.argv.slice(2);
const manglerFile = args.includes('--mangler') ? args[args.indexOf('--mangler') + 1] : null;

/* ---------------- Bilder ---------------- */
let sharpLib = null;
async function toWebp(buf) {
  if (!sharpLib) {
    try {
      sharpLib = (await import('sharp')).default;
    } catch {
      throw new Error('mangler «sharp» – kjør: npm install --no-save sharp@0.33.5');
    }
  }
  return sharpLib(buf)
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 80 })
    .toBuffer();
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Noen butikker sender bilder som «application/octet-stream»; bare HTML/tekst avvises her,
  // resten sjekkes når sharp leser bildet.
  const type = res.headers.get('content-type') || '';
  if (/^(text\/|application\/(json|xhtml))/i.test(type)) throw new Error(`ikke et bilde (${type})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Delingsbildet til en nettbutikkside: og:image, twitter:image eller Product.image i JSON-LD. */
async function storeImage(url) {
  const html = await fetchText(url);
  const meta = (name) => {
    const tag = (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')) || [])[0];
    const c = tag && tag.match(/content=["']([^"']+)["']/i);
    return c && c[1];
  };
  let img = meta('og:image') || meta('og:image:secure_url') || meta('twitter:image') || meta('twitter:image:src');
  if (!img) {
    for (const n of jsonLd(html)) {
      if (n['@type'] === 'Product' && n.image) {
        const i = [].concat(n.image)[0];
        img = typeof i === 'string' ? i : i && i.url;
        if (img) break;
      }
    }
  }
  if (!img) throw new Error('fant ikke noe bilde på butikksiden');
  return new URL(img.replace(/&amp;/g, '&'), url).href;
}

/* ---------------- Hovedløkke ---------------- */
async function main() {
  const fixes = [];      // det som ble fikset
  const attention = [];  // det som må fikses av et menneske
  const errors = [];     // forsøk som feilet (prøves igjen neste kjøring)
  const pjCache = new Map();
  const saved = new Map(); // ønske-id → bildefil laget i denne kjøringen (samme ønske kan stå i flere lister)

  async function product(pid) {
    if (!pjCache.has(pid)) {
      pjCache.set(pid, prisjaktProduct(pid).catch((e) => ({ error: e.message })));
      await sleep(1200);
    }
    const p = await pjCache.get(pid);
    return p && !p.error ? p : null;
  }

  for (const { file, list, person } of await personFiles()) {
    const data = await readJSON(file);
    let changed = false;

    for (const w of data.wishes || []) {
      const label = `«${w.title || 'Uten navn'}» (${list.name}, ${person.name})`;
      const pid = prisjaktId(w.prisjaktUrl);
      const img = w.image || '';
      const rel = `data/bilder/${w.id}.webp`;

      // 1) Bilde: alt som ikke allerede er en fil i data/bilder/
      if (!/^data\/bilder\//.test(img)) {
        try {
          let source = '';
          if (saved.has(w.id) || (!img && existsSync(resolve(DATA, 'bilder', `${w.id}.webp`)))) {
            source = 'eksisterende bildefil';
          } else {
            let buf = null;
            if (/^data:image\//.test(img)) {
              buf = Buffer.from(img.slice(img.indexOf(',') + 1), 'base64');
              source = 'opplastet bilde';
            } else if (/^https?:\/\//i.test(img)) {
              buf = await download(img);
              source = 'bildeadressen';
            } else {
              const p = pid ? await product(pid) : null;
              if (p && p.image) {
                buf = await download(p.image);
                source = 'Prisjakt';
              } else if (w.storeUrl) {
                buf = await download(await storeImage(w.storeUrl));
                source = 'nettbutikken';
              }
            }
            if (buf) {
              await writeFile(resolve(DATA, 'bilder', `${w.id}.webp`), await toWebp(buf));
              saved.set(w.id, rel);
            }
          }
          if (source) {
            w.image = rel;
            if (!w.imageFit) w.imageFit = 'contain';
            changed = true;
            fixes.push(`Bilde fra ${source}: ${label}`);
          } else if (!img) {
            attention.push(`${label}: mangler bilde, og har ingen lenke å hente det fra`);
          }
        } catch (e) {
          errors.push(`Bilde til ${label}: ${e.message}`);
        }
      }

      // 2) Prisantydning fra Prisjakt
      if (w.priceMin == null && w.priceMax == null && pid) {
        const p = await product(pid);
        if (p) {
          // Én dyr butikk skal ikke dra toppen langt opp: maks 1,6 × laveste pris
          w.priceMin = Math.floor(p.amount / 50) * 50 || null;
          w.priceMax = Math.ceil(Math.min(p.high, p.amount * 1.6) / 50) * 50;
          changed = true;
          fixes.push(`Prisantydning ${w.priceMin ?? 0}–${w.priceMax} kr: ${label}`);
        }
      }

      // 3) Prisjakt-lenke (kan ikke fikses automatisk)
      if (!w.hidePrisjakt && !pid) {
        attention.push(`${label}: ${w.prisjaktUrl ? 'Prisjakt-lenken går til et søk eller en kategori, ikke til et produkt' : 'mangler Prisjakt-lenke'}`);
      } else if (w.hidePrisjakt && !w.storeUrl) {
        attention.push(`${label}: har verken Prisjakt-knapp eller nettbutikk-lenke`);
      }
      if (pid && pjCache.has(pid)) {
        const p = await pjCache.get(pid);
        if (p && p.error) errors.push(`Prisjakt-siden til ${label}: ${p.error}`);
      }
    }

    if (changed) await writeWishes(file, data);
  }

  /* ---------------- Rapport ---------------- */
  const list = (items) => items.map((t) => `- ${t}`).join('\n');
  console.log(`Fikset: ${fixes.length}, trenger tilsyn: ${attention.length}, feil: ${errors.length}`);
  if (fixes.length) console.log(list(fixes));
  if (attention.length) console.log('Trenger tilsyn:\n' + list(attention));
  if (errors.length) console.log('Feil:\n' + list(errors));

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      '## Fyll inn manglende\n\n' +
      (fixes.length ? `### Fikset\n${list(fixes)}\n\n` : 'Ingenting å fikse.\n\n') +
      (attention.length ? `### Trenger tilsyn\n${list(attention)}\n\n` : '') +
      (errors.length ? `### Feil (prøves igjen neste gang)\n${list(errors)}\n` : ''));
  }

  if (manglerFile) {
    const body = attention.length || errors.length
      ? 'Disse ønskene mangler noe som ikke kan fylles inn automatisk:\n\n' +
        attention.map((t) => `- [ ] ${t}`).join('\n') + '\n\n' +
        (errors.length ? `Kunne ikke hentes (prøves igjen neste natt):\n\n${list(errors)}\n\n` : '') +
        'Rett dem i redigeringsverktøyet, eller be Claude om å finne Prisjakt-produktsiden. ' +
        'Finnes et produkt ikke på Prisjakt, kryss av for «Skjul Prisjakt-knappen».\n\n' +
        '_Denne saken oppdateres og lukkes automatisk av jobben «Fyll inn manglende»._\n'
      : '';
    await writeFile(manglerFile, body);
  }
}

main().catch((e) => {
  console.error('✗ ' + e.message);
  process.exit(1);
});
