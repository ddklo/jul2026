# Juleønsker 2026 – instruks for Claude

Statisk ønskeliste på GitHub Pages (`https://ddklo.github.io/jul2026/`). Se README.md for detaljer.

- To lister med de samme personene: `bergen.html` og `sorumsand.html`. Sidene er like bortsett fra `data-list` og tittel. Endrer du den ene, endre den andre likt.
- Data: `data/personer.json` (lister og personer), `data/<liste>/<person>.json` (ønskene, i visningsrekkefølge) og `data/bilder/` (produktbilder).
- Nettsiden lagrer selv endringer som commits på `main`. Kjør derfor alltid `git pull --rebase` før du pusher.
- Bump `?v=` i alle fire HTML-filene (`index.html`, `bergen.html`, `sorumsand.html`, `editor/index.html`) når CSS eller JS endres.
- Lokal test: `python -m http.server 8000` og åpne `/bergen.html` (adressen uten `.html` virker bare på GitHub Pages).
- Feltrekkefølgen i ønskene må være lik `WISH_FIELDS` i `assets/js/shared.js` og `FIELDS` i `tools/felles.mjs`. Filene skrives som JSON med 2 mellomrom og linjeskift til slutt.
- NB: I JavaScripts `String.replace` blir `$$` i erstatningsteksten til `$`. Bruk en funksjon som erstatning (`s.replace(a, () => b)`) når du endrer kode med skript.

## Når brukeren ber om å legge til et ønske

Gjør alt dette uten å spørre, med mindre noe er helt uklart:

1. **Person og liste.** «Begge steder» betyr både `data/bergen/` og `data/sorumsand/`. Er det uklart hvilken liste, spør.
2. **Riktig produkt.** Finn den konkrete modellen og varianten. Velg den mest sannsynlige når det er flere (for eksempel herre/dame, passform eller størrelse), og si i svaret hva du valgte og hvorfor.
3. **Prisjakt-produktside** (`https://www.prisjakt.no/product.php?p=…`). Prisjakts søk blokkerer skript (403), så søk i nettleseren på `https://www.prisjakt.no/search?query=…`. Bekreft navn, laveste pris og antall butikker fra produktsidens JSON-LD (`offers.lowPrice`, `offerCount`). Finnes produktet ikke på Prisjakt: sett `hidePrisjakt: true`, så blir nettbutikken hovedknapp.
4. **Nettbutikk-lenke** (`storeUrl`): direkte produktside i en kjent norsk butikk, gjerne en fra Prisjakt-listen (Fjellsport, Anton Sport, XXL, Lekekassen, Panduro …). Sjekk at siden svarer 200.
5. **Bilde.** Hent produktbildet (butikkens `og:image` eller `cdn.pji.nu/product/standard/800/<id>.jpg`) og se på det før du bruker det. Konverter til WebP (maks 900 px, kvalitet 80, hvit bakgrunn) med sharp, lagre som `data/bilder/<ønske-id>.webp`, og sett `image` til `data/bilder/<ønske-id>.webp`. Bruk `imageFit: "contain"` for produktbilder med hvit bakgrunn og `"cover"` for stemningsbilder.
6. **Prisantydning** (`priceMin`, `priceMax`): ut fra Prisjakt (lav–høy), avrundet til nærmeste 50.
7. **Beskrivelse** på norsk, kort: variant, størrelse og farge, og ting som må kjøpes i tillegg (for eksempel batterier).
8. **Id:** `"w" + Date.now().toString(36) + 5 tilfeldige base36-tegn`. Samme ønske i begge lister kan ha samme id.
9. Legg ønsket sist i personens liste, og kjør `node tools/priser.mjs` så det får `livePrice`.
10. Sjekk kortet lokalt (bilde, «Se på Prisjakt», butikk-knapp, laveste pris) før du foreslår commit.

Jobben «Fyll inn manglende» (`tools/fyll-inn.mjs`) fyller inn bilde og prisantydning hvis noe er glemt, og melder ønsker uten Prisjakt-produktlenke i en GitHub-sak. Den er et sikkerhetsnett, ikke en erstatning for sjekklisten: den kan ikke finne Prisjakt-siden eller velge riktig variant. Ser du den saken, kan du tilby å finne Prisjakt-sidene.

Følg også notatene i minnet (for eksempel at hjullasterbuksa er hjemmestrikket og at det ikke skal være noen «kjøpt»-markering).
