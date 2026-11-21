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
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
    let j;
    try {
      j = JSON.parse(m[1]);
    } catch {
      // Noen butikker har komma til slutt eller linjeskift i tekster: prøv en mildere variant
      try { j = JSON.parse(m[1].replace(/,(\s*[}\]])/g, '$1').replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; }
    }
    for (const node of [].concat(j['@graph'] || j)) if (node) out.push(node);
  }
  return out;
}

/**
 * Prisen på en nettbutikks produktside, i hele kroner, fra JSON-LD (Product,
 * ProductGroup) eller meta-taggene product:price:amount / og:price:amount.
 * Bare priser i NOK. Kaster en feil når ingen pris finnes.
 */
export async function storePrice(url) {
  const html = await fetchText(url);
  const nok = (cur) => !cur || /^NOK$/i.test(String(cur).trim());
  const fromOffer = (o) => {
    if (!o || !nok(o.priceCurrency || (o.priceSpecification && o.priceSpecification.priceCurrency))) return 0;
    const v = o.lowPrice ?? o.price ?? (o.priceSpecification && o.priceSpecification.price);
    return Math.round(Number(String(v ?? '').replace(',', '.'))) || 0;
  };
  const prices = [];
  for (const node of jsonLd(html)) {
    const types = [].concat(node['@type'] || []);
    if (types.includes('Product')) for (const o of [].concat(node.offers || [])) prices.push(fromOffer(o));
    if (types.includes('ProductGroup')) {
      for (const v of [].concat(node.hasVariant || [])) for (const o of [].concat(v.offers || [])) prices.push(fromOffer(o));
    }
  }
  const valid = prices.filter((p) => p > 0);
  if (valid.length) return Math.min(...valid);
  const meta = (prop) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i'));
    const c = m && m[0].match(/content=["']([^"']+)["']/i);
    return c ? c[1] : null;
  };
  for (const p of ['product:price', 'og:price']) {
    const amount = meta(`${p}:amount`);
    if (amount && nok(meta(`${p}:currency`))) {
      const v = Math.round(Number(amount.replace(',', '.')));
      if (v > 0) return v;
    }
  }
  // Mikrodata: første itemprop="price" (hovedproduktet står først), med content eller tall som tekst
  for (const m of html.matchAll(/<[^>]*itemprop=["']price["'][^>]*>([^<]*)/gi)) {
    const c = m[0].match(/content=["']([\d.,\s]+)["']/i);
    const raw = (c ? c[1] : m[1]).replace(/\s/g, '');
    if (!/^\d+([.,]\d{1,2})?$/.test(raw)) continue;
    const v = Math.round(Number(raw.replace(',', '.')));
    if (v > 0) return v;
  }
  throw new Error('fant ingen pris på butikksiden');
}

/**
 * Produktdata fra en Prisjakt-produktside:
 * { name, amount (laveste pris), high, offers, image }
 */
export async function prisjaktProduct(id) {
  const html = await fetchText(`https://www.prisjakt.no/product.php?p=${id}`);
  for (const node of jsonLd(html)) {
    // Produkter med varianter (f.eks. farger) ligger som ProductGroup med pris per variant.
    // Bruk laveste pris på tvers av variantene, og flest butikker for én variant.
    if (node['@type'] === 'ProductGroup' && Array.isArray(node.hasVariant)) {
      const offers = node.hasVariant.map((v) => [].concat(v.offers || [])[0]).filter(Boolean);
      const lows = offers.map((o) => Math.round(Number(o.lowPrice ?? o.price))).filter((n) => n > 0);
      if (lows.length) {
        const highs = offers.map((o) => Math.round(Number(o.highPrice ?? o.lowPrice ?? o.price))).filter((n) => n > 0);
        return {
          name: node.name,
          amount: Math.min(...lows),
          high: Math.max(...highs),
          offers: Math.max(...offers.map((o) => Number(o.offerCount) || 0)) || null,
          image: [].concat(node.image || [])[0] || null
        };
      }
    }
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
