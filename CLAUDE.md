# Juleønsker 2026 – instruks for Claude

Statisk ønskeliste på GitHub Pages (`https://ddklo.github.io/jul2026/`). Se README.md.

## Regler

- `bergen.html` og `sorumsand.html` er like bortsett fra `data-list`, tittel og manifest (`bergen.webmanifest`, `sorumsand.webmanifest`). Endre begge likt.
- Nettsiden committer selv til `main`: kjør `git pull --rebase` før push.
- Personfiler lagres med `Jul.github.saveWishes(path, base, mine, melding)` (fletter via `Jul.mergeWishes`), ikke `saveFile`. Jobbene publiserer med `tools/publiser.sh`.
- Bump `?v=` i `index.html`, `bergen.html`, `sorumsand.html` og `editor/index.html` når CSS/JS endres.
- Feltrekkefølge: `WISH_FIELDS` i `assets/js/shared.js` = `FIELDS` i `tools/felles.mjs`. JSON med 2 mellomrom og linjeskift til slutt.
- Lokal test: `python -m http.server 8000`, åpne `/bergen.html`.
- Skript som endrer kode: bruk `s.replace(a, () => b)`, ellers blir `$$` til `$`.
- Følg minnenotatene (hjemmestrikket hjullasterbukse, ingen «kjøpt»-markering).

## Legge til et ønske

Gjør alt uten å spørre, med mindre noe er helt uklart:

1. **Liste:** «begge steder» = `data/bergen/` og `data/sorumsand/`. Uklart: spør.
2. **Produkt:** konkret modell og variant. Velg den mest sannsynlige og si hvorfor.
3. **Prisjakt:** søk i nettleseren på `https://www.prisjakt.no/search?query=…` (skript får 403). Bruk produktsiden `product.php?p=…`, bekreft navn, `lowPrice` og `offerCount` i JSON-LD. Ikke på Prisjakt: `hidePrisjakt: true`.
4. **`storeUrl`:** produktside i kjent norsk butikk, helst fra Prisjakt-listen. Må svare 200.
5. **Bilde:** butikkens `og:image` eller `cdn.pji.nu/product/standard/800/<id>.jpg`. Se på det. WebP med sharp (maks 900 px, kvalitet 80, hvit bakgrunn) → `data/bilder/<id>.webp`. `imageFit`: `contain` for produktbilder, `cover` for stemningsbilder.
6. **`priceMin`/`priceMax`:** Prisjakt lav–høy, avrundet til nærmeste 50.
7. **Beskrivelse:** kort, norsk: variant, størrelse, farge, ting som må kjøpes i tillegg.
8. **Id:** `"w" + Date.now().toString(36)` + 5 tilfeldige base36-tegn (samme id i begge lister er greit).
9. Legg sist i listen og kjør `node tools/priser.mjs`.
10. Sjekk kortet lokalt (bilde, Prisjakt-knapp, butikk-knapp, pris) før du foreslår commit.

Jobben «Fyll inn manglende» er bare et sikkerhetsnett. Den finner ikke Prisjakt-sider. Ser du saken den lager, tilby å finne dem.
