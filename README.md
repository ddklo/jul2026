# 🎄 Juleønsker 2026

En elegant og mobilvennlig juleønskeliste for **Dagfinn, Kristin, Ellie og Sidney**. Den er helt gratis å drifte via GitHub Pages.

Det er to ønskelister, **Bergen** og **Sørumsand**, med de samme personene, men hver sine ønsker. Hver liste har sin egen adresse: `…/bergen` og `…/sorumsand`. Forsiden lar deg velge mellom dem.

- Statisk nettside (HTML, CSS og JavaScript) uten backend, database, sporing eller eksterne biblioteker
- Ønskene ligger som vanlige JSON-filer, én per person og liste, som kan redigeres direkte på GitHub
- To passord: ett for å se listene, og ett for administrator, som også kan redigere og oppdatere priser
- Laveste pris fra Prisjakt hentes hver natt

---

## Innhold

```
index.html               Forsiden: velg Bergen eller Sørumsand
bergen.html              Ønskelisten for Bergen (innlogging + ønskelister)
sorumsand.html           Ønskelisten for Sørumsand – samme side, bare data-list er ulik
assets/css/styles.css    Design
assets/js/shared.js      Innlogging, lasting av data, ikoner og produktkort (felles)
assets/js/app.js         Logikken til nettsiden
assets/js/snow.js        Snøfallet i bakgrunnen
assets/js/effects.js     Stjerner, stjerneskudd, julenissen i sleden og gnister ved klikk
assets/js/music.js       Julemusikk (spilledåse laget med Web Audio) og knappen som demper den
data/personer.json       Listene og personene (navn, farge og rekkefølge)
data/<liste>/<person>.json  Ønskene, for eksempel data/bergen/ellie.json
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

Send lenken til riktig liste (`…/bergen` eller `…/sorumsand`) og familiepassordet til familien. Passordene er de samme for begge listene. Passordene står med vilje ikke i denne README-en.

### Passord og roller

| Rolle | Kan |
|---|---|
| Familien | Se, redigere, flytte og slette ønsker og oppdatere priser. Alle som er logget inn ser en gull-knapp **Rediger** øverst og verktøy på hvert kort. |
| Administrator | Det samme, og i tillegg sette opp lagring (**Mer → Del lagring med familien**). |

Passordene ligger som SHA-256-hasher i `assets/js/shared.js` (`PASSWORDS`). For å bytte passord lager du en ny hash og bytter den ut:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('nytt-passord').digest('hex'))"
```

### Lenke direkte til én person

Hver person har sin egen lenke, for eksempel `…/bergen#ellie`. Trykk på **Del lenke** på nettsiden for å kopiere eller dele den. Mottakeren må fortsatt ha passordet.

---

## 2. Oppdater ønskene

Alle endringer lagres **rett til GitHub** som en commit. Ingen i familien trenger egen GitHub-bruker: siden bruker ett felles GitHub-token, som låses opp med passordet når man logger inn. Nettsiden oppdateres omtrent et minutt etter at du har lagret.

**Oppsett (én gang, administrator):**

1. Lag et [fine-grained token](https://github.com/settings/personal-access-tokens/new) med tilgang til bare dette repoet, **Contents: Read and write** og **Actions: Read and write**, og gjerne utløpsdato i januar.
2. Åpne redigeringsverktøyet, logg inn med administratorpassordet og velg **Mer → Del lagring med familien**.
3. Lim inn tokenet og skriv begge passordene. Tokenet krypteres med passordene og lagres i `data/tilgang.json`.

Når tokenet utløper eller passordene byttes, gjentar du dette. Er man allerede innlogget fra før, ber siden om passordet én gang til første gang man lagrer.

### Rett på ønskelisten

Når du er logget inn, har hvert kort tre knapper:

- **⠿ (håndtaket):** dra kortet til ny plass. Det virker også med fingeren på mobil, og med piltastene når håndtaket har fokus. Rekkefølgen lagres når du slipper.
- **Blyanten:** åpner ønsket i redigeringsverktøyet.
- **Søppelbøtta:** sletter ønsket etter at du har bekreftet.

### I redigeringsverktøyet

1. Trykk **Rediger** øverst på listen, eller gå rett til `…/editor/`.
2. Velg liste (Bergen eller Sørumsand) øverst til venstre, så person, og klikk på et ønske eller på **Nytt ønske**. Du ser kortet slik familien vil se det.
3. Trykk **Lagre** (eller Ctrl/Cmd + S). Hver endret person lagres som én commit.

Er lagring ikke satt opp, kan du velge **Mer → Last ned endrede filer** og laste dem opp selv til `data/bergen` eller `data/sorumsand` på GitHub (**Add file → Upload files**).

### Direkte på GitHub

Filene i `data/bergen/` og `data/sorumsand/` er vanlig JSON og kan redigeres rett på github.com (blyant-ikonet på filen). Rekkefølgen i filen er rekkefølgen på nettsiden.

### Felter per ønske

| Felt | Forklaring |
|---|---|
| `title` | Produktnavn. Påkrevd. |
| `description` | Valgfri. Størrelse, farge, modell og lignende. |
| `image` | Bildeadresse (`https://…`), et bilde i repoet (`data/bilder/…`), eller et bilde lastet opp i verktøyet |
| `imageFit` | `contain` («Vis hele bildet») passer for produktbilder med hvit bakgrunn. `cover` («Fyll rammen») passer for stemningsbilder. |
| `storeUrl` | Valgfri. Vises som en mindre knapp med butikkens navn (for eksempel «Lekekassen»). Uten Prisjakt-lenke (eller med `hidePrisjakt`) blir den hovedknappen, for eksempel «Se hos Panduro». |
| `linkLabel` | Valgfri tekst på nettbutikk-knappen i stedet for butikkens navn, for eksempel «Se oppskriften» |
| `prisjaktUrl` | Hovedknappen. Lenke til Prisjakt, helst direkte til produktsiden (`https://www.prisjakt.no/product.php?p=…`), som gir «Se på Prisjakt» og laveste pris. Kategori- og søkelenker gir «Søk på Prisjakt». |
| `hidePrisjakt` | Skjuler Prisjakt-knappen uten å slette lenken |
| `priceMin`, `priceMax` | Prisantydning i NOK |
| `livePrice` | Settes av prisjobben. Ikke rediger for hånd. |

**Bildetips:** Høyreklikk på produktbildet i nettbutikken og velg **Kopier bildeadresse**, og lim adressen inn i bildefeltet. Bilder du laster opp i verktøyet, krympes automatisk (maks 900 px, WebP) og lagres inni personfilen.

### Andre valg (menyen «Mer»)

- **Oppdater priser nå:** starter prisjobben med en gang i stedet for å vente til natten (se [Priser fra Prisjakt](#priser-fra-prisjakt)).
- **Last ned endrede filer / Publisere filer for hånd:** reserve hvis du ikke vil bruke token.
- **Eksporter backup / Importer backup:** alle ønskene i listen som én JSON-fil.
- **Del lagring med familien** (administrator): legger inn eller bytter det felles GitHub-tokenet.

### Legge til en liste

Legg listen til i `lists` i `data/personer.json`, lag mappen `data/<id>/` med én fil per person (`{ "wishes": [] }`), og kopier `bergen.html` til `<id>.html` med ny `data-list` og tittel. Husk også en knapp på forsiden (`index.html`).

### Priser fra Prisjakt

En GitHub Actions-jobb ([`.github/workflows/priser.yml`](.github/workflows/priser.yml)) henter laveste pris fra Prisjakt hver natt og lagrer den i personfilene. Kortet viser da «Laveste pris nå» med dato over prisantydningen.

- Bare ønsker som lenker **direkte til et produkt** (`https://www.prisjakt.no/product.php?p=…`) får pris. Kategori- og søkelenker har ingen enkeltpris.
- Prisen skjules hvis den er eldre enn en uke, eller hvis du har byttet produktlenke siden sist.
- En fil committes bare når en pris er endret, eller hver tredje dag for å holde datoen fersk.

**Kjøre manuelt:** Velg **Mer → Oppdater priser nå** i redigeringsverktøyet. Det bruker det samme felles tokenet som lagringen. Du kan også åpne **Actions → Oppdater priser** på GitHub og trykke **Run workflow**.

> Lagrer du en person etter at prisene er oppdatert, har filen med seg prisene fra da du åpnet siden. De blir riktige igjen ved neste kjøring.

> Prisjakt har ikke noe åpent API. Jobben leser den offentlige produktsiden, og Prisjakt kan når som helst endre siden eller stenge for slike oppslag. Da blir jobben rød i Actions, og prisene forsvinner fra kortene etter en uke. Resten av siden virker som før.

---

## 3. Funksjoner på nettsiden

- Fire faner med antall ønsker per person. På mobil er fanene en bunnmeny, og du kan sveipe mellom personene.
- Produktkort med bilde, beskrivelse, laveste pris og prisantydning. Hovedknappen går til Prisjakt, og en mindre knapp går til nettbutikken. Bildet og tittelen går også til Prisjakt.
- Lenke som går direkte til én persons liste
- Tomtilstand når en person ikke har ønsker
- Knapp til toppen og nedtelling til julaften
- Rolig snøfall, blinkende julelys og stjerner, stjerneskudd, julenissen som flyr forbi i sleden innimellom, gnister når du klikker og en snøfonn nederst. Alle bevegelser slås av når enheten har «redusert bevegelse» på (`prefers-reduced-motion`).
- Julemusikk i bakgrunnen: «Jingle Bells», «Glade jul», «We Wish You a Merry Christmas» og «Deck the Halls» som spilledåse. Melodiene er falt i det fri, og lyden lages i nettleseren, så det finnes ingen lydfiler. Musikken starter ved første klikk (nettlesere tillater ikke lyd før det), og knappen nederst til venstre demper den. Valget huskes på enheten.
- Innloggingen huskes på enheten. Med «Husk meg» avkrysset varer den til du logger ut, ellers til fanen lukkes.

---

## 4. Om passordet

Passordet er en **enkel sperre**, ikke ekte sikkerhet:

- Ønskene ligger åpent i `data/*.json`. Med et offentlig repo kan hvem som helst lese dem direkte, uten passord.
- Passordsjekken skjer i nettleseren. Den som kan litt JavaScript, kommer forbi den.
- Innloggingen huskes ved at rollen («view» eller «admin») lagres i nettleserens `localStorage` eller `sessionStorage`.
- Siden har `noindex`, slik at søkemotorer ikke skal vise den.
- **Det felles GitHub-tokenet** ligger kryptert med passordene i `data/tilgang.json`, som er offentlig. Et kort passord som familiepassordet kan knekkes på sekunder, og den som får tokenet, kan endre hele repoet (også selve nettsiden). Det er akseptert her fordi siden bare er en ønskeliste. Begrens skaden: gi tokenet tilgang til bare dette repoet og bare Contents og Actions, sett utløpsdato i januar, og slett det på GitHub når julen er over. Blir noe ødelagt, kan alt hentes tilbake fra git-historikken.
- Når man er logget inn, lagres tokenet i nettleseren (`localStorage` med «Husk meg», ellers `sessionStorage`). «Logg ut» fjerner det.

---

## 5. For den teknisk interesserte

**Kjøre lokalt:** Dataene hentes med `fetch`, så siden må serveres over http (å dobbeltklikke på `index.html` virker ikke). Lokalt må du bruke `/bergen.html`; adressen uten `.html` virker bare på GitHub Pages.

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
{
  "title": "Juleønsker 2026",
  "lists": [{ "id": "bergen", "name": "Bergen" }, { "id": "sorumsand", "name": "Sørumsand" }],
  "people": [{ "id": "dagfinn", "name": "Dagfinn", "accent": "#d9b26a" }]
}

// data/bergen/dagfinn.json
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
