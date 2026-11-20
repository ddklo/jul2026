/**
 * Felles hjelpere for skriptene i tools/ (prisjobben og utfyllingsjobben).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Datamappen. Kan overstyres med JUL_DATA (brukes ved testing). */
export const DATA = process.env.JUL_DATA ? resolve(process.env.JUL_DATA) : resolve(ROOT, 'data');
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

// Må være lik WISH_FIELDS i assets/js/shared.js
export const FIELDS = ['id', 'title', 'description', 'image', 'imageFit', 'storeUrl', 'linkLabel', 'prisjaktUrl',
  'hidePrisjakt', 'priceMin', 'priceMax', 'livePrice', 'createdAt'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readJSON(name) {
  return JSON.parse(await readFile(resolve(DATA, name), 'utf8'));
}

/** Skriver en personfil i samme format som nettsiden (feltrekkefølge, 2 mellomrom, linjeskift). */
export async function writeWishes(name, data) {
  data.wishes = (data.wishes || []).map((w) => {
    const o = {};
    for (const k of FIELDS) if (w[k] !== undefined) o[k] = w[k];
    for (const k of Object.keys(w)) if (!(k in o)) o[k] = w[k];
    return o;
  });
  await writeFile(resolve(DATA, name), JSON.stringify(data, null, 2) + '\n');
}

/** Alle personfiler: [{ file: 'bergen/ellie.json', list, person }]. */
export async function personFiles() {
  const { lists, people } = await readJSON('personer.json');
  return lists.flatMap((l) => people.map((p) => ({ file: `${l.id}/${p.id}.json`, list: l, person: p })));
}

/** Produkt-ID fra en Prisjakt-produktlenke, ellers null (kategori- og søkelenker har ingen enkeltpris). */
export function prisjaktId(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)prisjakt\.no$/.test(u.hostname) || u.pathname !== '/product.php') return null;
    const p = u.searchParams.get('p');
    return p && /^\d+$/.test(p) ? p : null;
  } catch {
    return null;
  }
}

export async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'nb-NO,nb;q=0.9' },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Alle JSON-LD-objekter på en side (flatet ut, også @graph). */
export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      for (const node of [].concat(j['@graph'] || j)) if (node) out.push(node);
    } catch { /* ugyldig JSON-LD – hopp over */ }
  }
  return out;
}

/**
 * Produktdata fra en Prisjakt-produktside:
 * { name, amount (laveste pris), high, offers, image }
 */
export async function prisjaktProduct(id) {
  const html = await fetchText(`https://www.prisjakt.no/product.php?p=${id}`);
  for (const node of jsonLd(html)) {
    if (node['@type'] !== 'Product' || !node.offers) continue;
    const o = [].concat(node.offers)[0];
    const amount = Math.round(Number(o.lowPrice ?? o.price));
    if (amount > 0) {
      return {
        name: node.name,
        amount,
        high: Math.round(Number(o.highPrice ?? amount)),
        offers: Number(o.offerCount) || null,
        image: [].concat(node.image || [])[0] || null
      };
    }
  }
  throw new Error('fant ingen pris på siden');
}
