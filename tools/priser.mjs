#!/usr/bin/env node
/**
 * Henter laveste pris fra Prisjakt for ønsker som lenker direkte til et produkt
 * (https://www.prisjakt.no/product.php?p=…), og lagrer den som `livePrice` på
 * ønsket i data/<liste>/<person>.json. Ønsker uten Prisjakt-produkt får i stedet
 * prisen fra nettbutikken (`storeUrl`), når butikken oppgir den på siden.
 * Ønsker med egen knappetekst (`linkLabel`, f.eks. en strikkeoppskrift) hoppes over. Kjøres hver natt av GitHub Actions
 * (.github/workflows/priser.yml), eller manuelt:
 *
 *   node tools/priser.mjs [--force]
 *
 * En fil skrives bare når en pris er endret, når en lagret pris er eldre
 * enn REFRESH_DAYS, eller med --force (manuell kjøring). Slik blir det færre commits.
 */
import { personFiles, readJSON, writeWishes, prisjaktId, prisjaktProduct, storePrice, sleep } from './felles.mjs';

const REFRESH_DAYS = 3;
const DELAY_MS = 1500;

const force = process.argv.includes('--force');
const ageDays = (iso) => (Date.now() - Date.parse(iso)) / 864e5;

async function main() {
  const now = new Date().toISOString();
  let ok = 0, failed = 0, storeOk = 0, storeFailed = 0, first = true;
  const written = [];
  // Samme produkt kan stå på flere lister; hent det bare én gang per kjøring
  const cache = new Map();
  const getPrice = async (id) => {
    if (!cache.has(id)) {
      if (!first) await sleep(DELAY_MS);
      first = false;
      cache.set(id, prisjaktProduct(id));
    }
    return cache.get(id);
  };
  const storeCache = new Map();
  const getStorePrice = async (url) => {
    if (!storeCache.has(url)) {
      if (!first) await sleep(DELAY_MS);
      first = false;
      storeCache.set(url, storePrice(url));
    }
    return storeCache.get(url);
  };

  for (const { file } of await personFiles()) {
    const data = await readJSON(file);
    let changed = false;

    for (const w of data.wishes || []) {
      const id = w.hidePrisjakt ? null : prisjaktId(w.prisjaktUrl);
      const old = w.livePrice;
      if (!id) {
        const url = w.storeUrl && !w.linkLabel ? w.storeUrl : null;
        if (!url) {
          if (old) { delete w.livePrice; changed = true; }
          continue;
        }
        try {
          const amount = await getStorePrice(url);
          storeOk++;
          const same = old && old.source === 'store' && old.url === url && old.amount === amount;
          if (!same || force || !old.checkedAt || ageDays(old.checkedAt) > REFRESH_DAYS) changed = true;
          w.livePrice = { source: 'store', url, amount, checkedAt: now };
          console.log(`  ${amount} kr  ${w.title} (butikk)`);
        } catch (e) {
          storeFailed++;
          console.warn(`- ${w.title} (butikk): ${e.name === 'TimeoutError' ? 'tidsavbrudd' : e.message}`);
          if (old && (old.source !== 'store' || old.url !== url)) { delete w.livePrice; changed = true; }
        }
        continue;
      }
      try {
        const { amount, offers } = await getPrice(id);
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
      await writeWishes(file, data);
      written.push(file);
    }
  }

  console.log(`Prisjakt: ${ok} hentet, ${failed} feilet. Nettbutikker: ${storeOk} hentet, ${storeFailed} uten pris.`);
  console.log(written.length ? `✓ Oppdaterte ${written.join(', ')}` : 'Ingen endringer');
  // Feilet alle, er vi trolig blokkert. Da skal jobben bli rød, så det blir lagt merke til.
  if (failed && !ok) process.exit(1);
}

main().catch((e) => {
  console.error('✗ ' + e.message);
  process.exit(1);
});
