#!/usr/bin/env node
/**
 * Henter laveste pris fra Prisjakt for ønsker som lenker direkte til et produkt
 * (https://www.prisjakt.no/product.php?p=…), og lagrer den som `livePrice` på
 * ønsket i data/<person>.json. Kjøres hver natt av GitHub Actions
 * (.github/workflows/priser.yml), eller manuelt:
 *
 *   node tools/priser.mjs [--force]
 *
 * En personfil skrives bare når en pris er endret, når en lagret pris er eldre
 * enn REFRESH_DAYS, eller med --force (manuell kjøring). Slik blir det færre commits.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const REFRESH_DAYS = 3;
const DELAY_MS = 1500;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const force = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = async (name) => JSON.parse(await readFile(resolve(DATA, name), 'utf8'));
const ageDays = (iso) => (Date.now() - Date.parse(iso)) / 864e5;

/** Produkt-ID fra en Prisjakt-produktlenke, ellers null (kategori- og søkelenker har ingen enkeltpris). */
function prisjaktId(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)prisjakt\.no$/.test(u.hostname) || u.pathname !== '/product.php') return null;
    const p = u.searchParams.get('p');
    return p && /^\d+$/.test(p) ? p : null;
  } catch {
    return null;
  }
}

/** Finner laveste pris og antall butikker i produktsidens JSON-LD. */
function parsePrice(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    for (const node of [].concat(j['@graph'] || j)) {
      if (node?.['@type'] !== 'Product' || !node.offers) continue;
      const o = [].concat(node.offers)[0];
      const amount = Math.round(Number(o.lowPrice ?? o.price));
      if (amount > 0) return { amount, offers: Number(o.offerCount) || null };
    }
  }
  return null;
}

async function fetchPrice(id) {
  const res = await fetch(`https://www.prisjakt.no/product.php?p=${id}`, {
    headers: { 'user-agent': UA, 'accept-language': 'nb-NO,nb;q=0.9' },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const price = parsePrice(await res.text());
  if (!price) throw new Error('fant ingen pris på siden');
  return price;
}

async function main() {
  const { people } = await readJSON('personer.json');
  const now = new Date().toISOString();
  let ok = 0, failed = 0, first = true;
  const written = [];

  for (const person of people) {
    const file = `${person.id}.json`;
    const data = await readJSON(file);
    let changed = false;

    for (const w of data.wishes || []) {
      const id = w.hidePrisjakt ? null : prisjaktId(w.prisjaktUrl);
      const old = w.livePrice;
      if (!id) {
        if (old) { delete w.livePrice; changed = true; }
        continue;
      }
      if (!first) await sleep(DELAY_MS);
      first = false;
      try {
        const { amount, offers } = await fetchPrice(id);
        ok++;
        const same = old && old.productId === id && old.amount === amount && old.offers === offers;
        if (!same || force || !old.checkedAt || ageDays(old.checkedAt) > REFRESH_DAYS) changed = true;
        w.livePrice = { productId: id, amount, offers, checkedAt: now };
        console.log(`  ${amount} kr  ${w.title}`);
      } catch (e) {
        failed++;
        console.warn(`! ${w.title}: ${e.name === 'TimeoutError' ? 'tidsavbrudd' : e.message}`);
        if (old && old.productId !== id) { delete w.livePrice; changed = true; }
      }
    }

    if (changed) {
      await writeFile(resolve(DATA, file), JSON.stringify(data, null, 2) + '\n');
      written.push(file);
    }
  }

  console.log(`Priser hentet: ${ok}, feilet: ${failed}`);
  console.log(written.length ? `✓ Oppdaterte ${written.join(', ')}` : 'Ingen endringer');
  // Feilet alle, er vi trolig blokkert. Da skal jobben bli rød, så det blir lagt merke til.
  if (failed && !ok) process.exit(1);
}

main().catch((e) => {
  console.error('✗ ' + e.message);
  process.exit(1);
});
