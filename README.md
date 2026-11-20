# 🎄 Juleønsker 2026

En elegant og mobilvennlig juleønskeliste for **Dagfinn, Kristin, Ellie og Sidney**. Den er helt gratis å drifte via GitHub Pages.

- Statisk nettside (HTML, CSS og JavaScript) uten backend, database, sporing eller eksterne biblioteker
- Ønskene ligger som vanlige JSON-filer, én per person, som kan redigeres direkte på GitHub
- To passord: ett for å se listene, og ett for administrator, som også kan redigere og oppdatere priser
- Laveste pris fra Prisjakt hentes hver natt

---

## Innhold

```
index.html               Selve nettsiden (innlogging + ønskelister)
assets/css/styles.css    Design
assets/js/shared.js      Innlogging, lasting av data, ikoner og produktkort (felles)
assets/js/app.js         Logikken til nettsiden
assets/js/snow.js        Snøfallet i bakgrunnen
data/personer.json       Personene (navn, farge og rekkefølge)
data/<person>.json       Ønskene til hver person, for eksempel data/ellie.json
data/bilder/             Produktbildene
editor/                  Redigeringsverktøyet (kun administrator)
tools/priser.mjs         Henter priser fra Prisjakt (kjøres av GitHub Actions)
.github/workflows/       Den nattlige prisjobben
```

---

## 1. Publiser på GitHub Pages (én gang)

1. Last opp alle filene til et repository på GitHub (de ligger allerede i dette repoet).
2. Gå til **Settings → Pages** i repoet.
3. Under **Build and deployment** velger du **Source: Deploy from a branch**.
4. Velg branchen (for eksempel `main`) og mappen **`/ (root)`**, og klikk **Save**.
5. Etter et minutt eller to ligger siden på `https://<brukernavn>.github.io/<repo-navn>/`.

Send lenken og passordet for lesetilgang til familien. Passordene står med vilje ikke i denne README-en.

### Passord og roller

| Rolle | Kan |
|---|---|
| Lesetilgang | Se alle ønskelistene |
| Administrator | I tillegg redigere ønskene (blyant-knappen øverst) og oppdatere priser |

Passordene ligger som SHA-256-hasher i `assets/js/shared.js` (`PASSWORDS`). For å bytte passord lager du en ny hash og bytter den ut:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('nytt-passord').digest('hex'))"
```

### Lenke direkte til én person

Hver person har sin egen lenke, for eksempel `…/#ellie`. Trykk på **Del lenke** på nettsiden for å kopiere eller dele den. Mottakeren må fortsatt ha passordet.

---

## 2. Oppdater ønskene

### I redigeringsverktøyet

1. Logg inn som administrator på nettsiden og trykk på **blyanten** øverst, eller gå rett til `…/editor/`.
2. Velg person, og klikk på et ønske eller på **Nytt ønske**. Du ser kortet slik familien vil se det.
3. Klikk **Last ned endrede filer** (eller trykk Ctrl/Cmd + S). Du får én fil per person som er endret, for eksempel `ellie.json`.
4. **Last opp filene til GitHub:** Åpne mappen **`data`** i repoet, klikk **Add file → Upload files**, dra inn filene og klikk **Commit changes**.

Nettsiden oppdateres i løpet av et par minutter.

> Har nettleseren kalt filen `ellie (1).json`? Gi den nytt navn til `ellie.json` før du laster den opp.

### Direkte på GitHub

Filene i `data/` er vanlig JSON og kan redigeres rett på github.com (blyant-ikonet på filen). Rekkefølgen i filen er rekkefølgen på nettsiden.

### Felter per ønske

| Felt | Forklaring |
|---|---|
| `title` | Produktnavn. Påkrevd. |
| `description` | Valgfri. Størrelse, farge, modell og lignende. |
| `image` | Bildeadresse (`https://…`), et bilde i repoet (`data/bilder/…`), eller et bilde lastet opp i verktøyet |
| `imageFit` | `contain` («Vis hele bildet») passer for produktbilder med hvit bakgrunn. `cover` («Fyll rammen») passer for stemningsbilder. |
| `storeUrl` | Vises som knappen «Se i butikk» |
| `linkLabel` | Valgfri knappetekst, for eksempel «Se oppskriften» |
| `prisjaktUrl` | Lenke til Prisjakt, helst direkte til produktsiden (`https://www.prisjakt.no/product.php?p=…`). Tomt felt gir ingen Prisjakt-knapp. |
| `hidePrisjakt` | Skjuler Prisjakt-knappen uten å slette lenken |
| `priceMin`, `priceMax` | Prisantydning i NOK |
| `livePrice` | Settes av prisjobben. Ikke rediger for hånd. |

**Bildetips:** Høyreklikk på produktbildet i nettbutikken og velg **Kopier bildeadresse**, og lim adressen inn i bildefeltet. Bilder du laster opp i verktøyet, krympes automatisk (maks 900 px, WebP) og lagres inni personfilen.

### Andre valg (menyen «Mer»)

- **Oppdater priser nå:** starter prisjobben med en gang i stedet for å vente til natten (se [Priser fra Prisjakt](#priser-fra-prisjakt)).
- **Eksporter backup / Importer backup:** alle ønskene som én JSON-fil.

### Priser fra Prisjakt

En GitHub Actions-jobb ([`.github/workflows/priser.yml`](.github/workflows/priser.yml)) henter laveste pris fra Prisjakt hver natt og lagrer den i personfilene. Kortet viser da «Laveste pris nå» med dato over prisantydningen.

- Bare ønsker som lenker **direkte til et produkt** (`https://www.prisjakt.no/product.php?p=…`) får pris. Kategori- og søkelenker har ingen enkeltpris.
- Prisen skjules hvis den er eldre enn en uke, eller hvis du har byttet produktlenke siden sist.
- En fil committes bare når en pris er endret, eller hver tredje dag for å holde datoen fersk.

**Kjøre manuelt:** Velg **Mer → Oppdater priser nå** i redigeringsverktøyet. Første gang trenger du et [fine-grained token](https://github.com/settings/personal-access-tokens/new) med tilgang til bare dette repoet og **Actions: Read and write**. Tokenet lagres bare i nettleseren der du limer det inn. Uten token kan du åpne **Actions → Oppdater priser** på GitHub og trykke **Run workflow**.

> Laster du opp en personfil fra redigeringsverktøyet etter at prisene er oppdatert, har filen med seg prisene fra da du åpnet verktøyet. De blir riktige igjen ved neste kjøring.

> Prisjakt har ikke noe åpent API. Jobben leser den offentlige produktsiden, og Prisjakt kan når som helst endre siden eller stenge for slike oppslag. Da blir jobben rød i Actions, og prisene forsvinner fra kortene etter en uke. Resten av siden virker som før.

---

## 3. Funksjoner på nettsiden

- Fire faner med antall ønsker per person. På mobil er fanene en bunnmeny, og du kan sveipe mellom personene.
- Produktkort med bilde, beskrivelse, laveste pris og prisantydning, pluss knappene «Se i butikk» og «Prisjakt»
- Lenke som går direkte til én persons liste
- Tomtilstand når en person ikke har ønsker
- Knapp til toppen og nedtelling til julaften
- Rolig snøfall, blinkende julelys og små animasjoner. Alt slås av når enheten har «redusert bevegelse» på (`prefers-reduced-motion`).
- Innloggingen huskes på enheten. Med «Husk meg» avkrysset varer den til du logger ut, ellers til fanen lukkes.

---

## 4. Om passordet

Passordet er en **enkel sperre**, ikke ekte sikkerhet:

- Ønskene ligger åpent i `data/*.json`. Med et offentlig repo kan hvem som helst lese dem direkte, uten passord.
- Passordsjekken skjer i nettleseren. Den som kan litt JavaScript, kommer forbi den, også til redigeringsverktøyet. Verktøyet kan likevel ikke endre noe på GitHub; det laster bare ned filer.
- Innloggingen huskes ved at rollen («view» eller «admin») lagres i nettleserens `localStorage` eller `sessionStorage`.
- Siden har `noindex`, slik at søkemotorer ikke skal vise den.
- Tokenet til «Oppdater priser nå» lagres i nettleserens `localStorage`. Lag det med så lite tilgang som mulig (bare dette repoet, bare Actions), og slett det på GitHub når julen er over.

---

## 5. For den teknisk interesserte

**Kjøre lokalt:** Dataene hentes med `fetch`, så siden må serveres over http (å dobbeltklikke på `index.html` virker ikke):

```bash
python -m http.server 8000
```

**Hente priser lokalt (Node 20+):**

```bash
node tools/priser.mjs
```

**Dataformat:**

```json
// data/personer.json
{ "title": "Juleønsker 2026", "people": [{ "id": "dagfinn", "name": "Dagfinn", "accent": "#d9b26a" }] }

// data/dagfinn.json
{
  "wishes": [{
    "id": "w001", "title": "…", "description": "…",
    "image": "data/bilder/w001.webp", "imageFit": "contain",
    "storeUrl": "https://…", "prisjaktUrl": "https://www.prisjakt.no/product.php?p=13998527",
    "priceMin": 500, "priceMax": 1000,
    "livePrice": { "productId": "13998527", "amount": 776, "offers": 3, "checkedAt": "2026-11-20T03:17:00Z" }
  }]
}
```

God jul! 🎁
