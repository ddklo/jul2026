# 🎄 Juleønsker 2026

En elegant, mobilvennlig og passordbeskyttet juleønskeliste for **Dagfinn, Kristin, Ellie og Sidney**. Den er helt gratis å drifte via GitHub Pages.

- Statisk nettside (HTML, CSS og JavaScript) uten backend, database, sporing eller eksterne biblioteker
- Ønskelistene er **kryptert** (AES-256-GCM med nøkkel fra passordet via PBKDF2), så innholdet ligger aldri i klartekst i repoet
- Eget **redigeringsverktøy** i nettleseren for å legge til, endre og slette ønsker

---

## Innhold

```
index.html               Selve nettsiden (innlogging + ønskelister)
assets/css/styles.css    Design
assets/js/shared.js      Kryptering, ikoner og produktkort (felles)
assets/js/app.js         Logikken til nettsiden
assets/js/snow.js        Snøfallet i bakgrunnen
data/wishlist.enc.js     ← De krypterte ønskelistene (den eneste filen du bytter ut)
editor/                  Redigeringsverktøyet
tools/onskeliste.mjs     Valgfritt kommandolinjeverktøy (Node) for kryptering
```

---

## 1. Publiser på GitHub Pages (én gang)

1. Last opp alle filene til et repository på GitHub (de ligger allerede i dette repoet).
2. Gå til **Settings → Pages** i repoet.
3. Under **Build and deployment** velger du **Source: Deploy from a branch**.
4. Velg branchen (for eksempel `main`) og mappen **`/ (root)`**, og klikk **Save**.
5. Etter et minutt eller to ligger siden på `https://<brukernavn>.github.io/<repo-navn>/`.

Send lenken og passordet til familien, gjerne hver for seg (for eksempel lenken på e-post og passordet på SMS).

> **Passordet står med vilje ikke i denne README-en.** Står det i repoet, kan hvem som helst lese det. Bruk passordet du valgte da listen ble laget.

### Lenke direkte til én person

Hver person har sin egen lenke, for eksempel `…/#ellie`. Trykk på **Del lenke** på nettsiden for å kopiere eller dele den. Mottakeren må fortsatt ha passordet.

---

## 2. Oppdater ønskene

Du trenger ingen programmer, bare en nettleser.

1. **Åpne redigeringsverktøyet.** Velg én av måtene:
   - Gå til `https://<brukernavn>.github.io/<repo-navn>/editor/`, eller
   - åpne `editor/index.html` direkte fra en lokal kopi av repoet (dobbeltklikk).

   Alt skjer lokalt i nettleseren. Ingenting sendes noe sted.
2. **Skriv inn passordet.** Verktøyet dekrypterer listene.
3. **Rediger.** Velg person, og klikk på et ønske eller på **Nytt ønske**. Endringene lagres fortløpende i verktøyet, og du ser kortet slik familien vil se det.
4. Klikk **Last ned datafil** (eller trykk Ctrl/Cmd + S). Da lastes `wishlist.enc.js` ned.
5. **Last opp filen til GitHub:**
   - Åpne repoet på github.com og gå inn i mappen **`data`**
   - Klikk **Add file → Upload files** og dra inn `wishlist.enc.js`
   - Klikk **Commit changes**

Nettsiden oppdateres i løpet av et par minutter. Familien trenger ikke logge inn på nytt.

> Har nettleseren kalt filen `wishlist.enc (1).js`? Gi den nytt navn til `wishlist.enc.js` før du laster den opp.

### Felter per ønske

| Felt | Forklaring |
|---|---|
| Produktnavn | Påkrevd |
| Person | Hvem ønsket tilhører. Endrer du dette, flyttes ønsket. |
| Kort beskrivelse | Valgfri. Størrelse, farge, modell og lignende. |
| Produktbilde | Lim inn en bildeadresse, eller last opp, dra inn eller lim inn et bilde |
| Bildetilpasning | «Vis hele bildet» passer for produktbilder med hvit bakgrunn. «Fyll rammen» passer for stemningsbilder. |
| Lenke til nettbutikk | Vises som knappen «Se i butikk» |
| Knappetekst | Valgfri. Standard er «Se i butikk», men du kan skrive for eksempel «Se oppskriften». |
| Lenke til Prisjakt | Lenke direkte til produktsiden, for eksempel `https://www.prisjakt.no/product.php?p=…`. Åpne produktet på prisjakt.no og kopier adressen. Står feltet tomt, vises ingen Prisjakt-knapp. Kryss av for «Skjul Prisjakt-knappen» for å skjule en lenke uten å slette den. |
| Prisintervall | Fra–til i NOK. Hurtigknappene fyller inn vanlige intervaller. |
| Prioritet | Ingen, «Hadde vært fint» eller «Ønsker meg veldig». Høy prioritet vises først. |

**Bildetips:** Høyreklikk på produktbildet i nettbutikken og velg **Kopier bildeadresse**, og lim adressen inn i bildefeltet. Opplastede bilder krympes automatisk (maks 900 px, WebP) og krypteres sammen med listen. Mange opplastede bilder gjør datafilen større, så bildeadresser holder filen liten.

**Rekkefølge:** Bruk pilene i listen til venstre. Rekkefølgen styrer standardsorteringen («Anbefalt»), der ønsker med høy prioritet kommer først.

### Andre valg (menyen «Mer»)

- **Eksporter backup:** lagrer alt som *ukryptert* JSON. Ta vare på filen lokalt og **ikke last den opp til GitHub**.
- **Importer backup:** henter inn en tidligere backup.
- **Bytt passord:** krypterer på nytt med nytt passord. Etter opplasting må alle logge inn med det nye passordet.

### Bytte ut eksempelønskene

Listene inneholder eksempelprodukter med illustrasjoner i stedet for ekte produktbilder. Slett dem i redigeringsverktøyet, eller bruk **Start helt på nytt** på åpningsskjermen for å begynne med en tom liste og et nytt passord.

---

## 3. Funksjoner på nettsiden

- Fire faner med antall ønsker per person. På mobil er fanene en bunnmeny, og du kan sveipe mellom personene.
- Produktkort med bilde, beskrivelse, prisintervall og prioritet, pluss knappene «Se i butikk» og «Prisjakt»
- Søk på tvers av alle ønskelister
- Filtrering på prisintervall og sortering på pris eller navn
- Lenke som går direkte til én persons liste
- Tomtilstand når en person ikke har ønsker
- Knapp til toppen og nedtelling til julaften
- Rolig snøfall, blinkende julelys og små animasjoner. Alt slås av når enheten har «redusert bevegelse» på (`prefers-reduced-motion`).
- Innloggingen huskes på enheten. Med «Husk meg» avkrysset varer den til du logger ut, ellers til fanen lukkes.

---

## 4. Sikkerhet ved statisk hosting

Løsningen holder ønskelisten unna nysgjerrige blikk og søkemotorer. Den er ikke laget for å beskytte hemmeligheter. Det er greit å vite følgende:

- **Kryptering i nettleseren.** Dataene er kryptert med AES-256-GCM. Nøkkelen avledes fra passordet med PBKDF2-SHA-256 og 600 000 iterasjoner. Uten passordet er filen uleselig.
- **Den krypterte filen er offentlig.** På GitHub Pages med et offentlig repo kan hvem som helst laste ned `wishlist.enc.js` og prøve å gjette passordet på egen maskin, uten begrensning på antall forsøk. PBKDF2 gjør hvert forsøk tregt, men **et kort eller vanlig passord kan knekkes**. Vil du ha sterkere vern, bytter du til en lengre passordfrase, for eksempel fire tilfeldige ord.
- **Git husker historikken.** Gamle versjoner av datafilen ligger i commit-historikken, kryptert med passordet som gjaldt da. Bytter du passord, kan de gamle versjonene fortsatt åpnes med det gamle passordet.
- **Huskede innlogginger.** Med «Husk meg» lagres den avledede nøkkelen (ikke passordet) i nettleserens `localStorage`. Alle med tilgang til enheten kan da se listene. Logg ut på delte enheter.
- **Ingen brukerkontoer.** Alle med passordet ser alt. Det finnes ingen innlogging per person og ingen logg over hvem som har sett hva.
- **Lenker og bilder.** Når familien åpner listen, henter nettleseren bilder fra adressene du har limt inn. Nettbutikken kan da se at bildet ble lastet. Opplastede bilder har ikke dette problemet. Siden har `noindex` og `no-referrer`, slik at den ikke indekseres og ikke avslører adressen sin til butikkene.
- **Privat repo.** GitHub Pages fra et privat repo krever et betalt GitHub-abonnement. Krypteringen gjør at et offentlig repo er greit for dette formålet.
- **Ikke legg klartekst i repoet.** Backup-filer (`*.json`) og passord skal aldri committes. `.gitignore` stopper de vanligste filnavnene.

---

## 5. For den teknisk interesserte

**Kjøre lokalt:** Åpne `index.html` direkte i nettleseren. Datafilen lastes som et vanlig `<script>`, så det virker også fra `file://`. Du kan også starte en liten server:

```bash
python3 -m http.server 8000
```

**Kommandolinje (valgfritt, Node 20+):**

```bash
node tools/onskeliste.mjs dekrypter backup.json
```

```bash
node tools/onskeliste.mjs krypter backup.json
```

`krypter` skriver `data/wishlist.enc.js` og beholder saltet fra den eksisterende filen, slik at huskede innlogginger fortsatt virker. Passordet leses fra `JUL_PASSORD` eller spørres om.

**Dataformat (før kryptering):**

```json
{
  "version": 1,
  "people": [{ "id": "dagfinn", "name": "Dagfinn", "accent": "#d9b26a" }],
  "wishes": [{
    "id": "w001", "person": "dagfinn", "title": "…", "description": "…",
    "image": "https://…", "imageFit": "contain",
    "storeUrl": "https://…", "prisjaktUrl": "https://…",
    "priceMin": 500, "priceMax": 1000, "priority": 2
  }]
}
```

God jul! 🎁
