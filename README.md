# 🎄 Juleønsker 2026

Juleønskeliste for Dagfinn, Kristin, Ellie og Sidney på GitHub Pages: <https://ddklo.github.io/jul2026/>

- To lister med de samme personene: `…/bergen` og `…/sorumsand`. Lenke til én person: `…/bergen#ellie`.
- Statisk side uten backend. Ønskene er JSON-filer i repoet.
- Laveste pris fra Prisjakt (eller nettbutikken) hentes hver natt.
- «Nytt» på ønsker lagt til siden du var her sist (per enhet).

## Filer

```
index.html, bergen.html, sorumsand.html   Forside og de to listene (like, bortsett fra data-list)
editor/                                   Redigeringsverktøyet
assets/js/shared.js                       Innlogging, data, lagring til GitHub, produktkort
assets/js/app.js                          Listesiden
assets/js/snow.js, effects.js, music.js   Snø, juleeffekter og figurer (desktop), musikk
data/personer.json                        Listene og personene
data/<liste>/<person>.json                Ønskene, i visningsrekkefølge
data/bilder/                              Produktbilder (WebP)
data/tilgang.json                         Det felles GitHub-tokenet, kryptert
tools/                                    Pris- og utfyllingsjobben (Node)
.github/workflows/                        Kjører jobbene
```

## Passord

| Passord | Kan |
|---|---|
| Familie | Se og redigere alt, og oppdatere priser |
| Administrator | Det samme, og sette opp lagring |

Passordene står ikke her. Hashene ligger i `PASSWORDS` i `assets/js/shared.js`. Ny hash:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('nytt-passord').digest('hex'))"
```

## Redigere

Alt lagres som en commit rett til GitHub. Siden er oppdatert etter et minutt.

- **På listen:** dra ⠿ for å flytte (også med piltaster), blyant for å redigere, søppelbøtte for å slette.
- **I verktøyet** (`…/editor/`): velg liste og person, rediger, trykk **Lagre** (Ctrl/Cmd + S).
- **På GitHub:** rediger filene i `data/<liste>/` direkte.

Lagring fletter: siden henter nyeste versjon og skriver bare dine endringer, så det andre har lagret blir stående. Endrer to det samme ønsket, vinner den som lagrer sist. En åpen side henter ønskene på nytt når du kommer tilbake til fanen.

**Oppsett av lagring (administrator, én gang):**

1. Lag et [fine-grained token](https://github.com/settings/personal-access-tokens/new) for bare dette repoet: **Contents** og **Actions**, read and write. Utløp i januar.
2. Verktøyet → **Mer → Del lagring med familien** → lim inn tokenet og skriv begge passordene.

Gjenta når tokenet utløper eller passordene byttes. Uten token: **Mer → Last ned endrede filer** og last dem opp på GitHub.

## Felter per ønske

| Felt | |
|---|---|
| `title` | Produktnavn (påkrevd) |
| `description` | Variant, størrelse, farge |
| `image` | `data/bilder/<id>.webp`, en URL, eller opplastet bilde |
| `imageFit` | `contain` for produktbilder, `cover` for stemningsbilder |
| `prisjaktUrl` | Hovedknappen. Produktside (`product.php?p=…`) gir laveste pris |
| `storeUrl` | Nettbutikk, mindre knapp (hovedknapp uten Prisjakt) |
| `linkLabel` | Egen tekst på butikk-knappen |
| `hidePrisjakt` | Skjul Prisjakt-knappen |
| `priceMin`, `priceMax` | Prisantydning i NOK |
| `livePrice` | Settes av prisjobben (Prisjakt, eller `source: "store"` fra nettbutikken) |

## Jobber (GitHub Actions)

- **Oppdater priser** (natt, eller **Mer → Oppdater priser nå**): laveste pris for ønsker med Prisjakt-produktlenke. Uten det: prisen på butikksiden, hvis butikken oppgir den (ikke for ønsker med `linkLabel`). Prisen skjules etter 8 dager uten oppdatering.
- **Fyll inn manglende** (ved endring og natt): henter manglende bilder og prisantydning, og holder én GitHub-sak med ønsker som mangler Prisjakt-lenke.

Begge publiserer med `tools/publiser.sh`: ved konflikt med en lagring fra nettsiden hentes nyeste versjon og jobben kjøres på nytt.

Prisjakt har ikke API. Endrer de siden, blir prisjobben rød, og prisene forsvinner fra kortene.

## Sikkerhet

Passordet er en liten sperre, ikke sikkerhet. Repoet er offentlig, og passordsjekken skjer i nettleseren. Tokenet i `data/tilgang.json` er kryptert med passordene, men kan knekkes. Gi det derfor minst mulig tilgang, kort levetid, og slett det etter jul. Alt kan hentes tilbake fra git-historikken.

## Lokalt

```bash
python -m http.server 8000      # åpne /bergen.html (uten .html virker bare på Pages)
node tools/priser.mjs           # hent priser
npm install --no-save sharp@0.33.5 && node tools/fyll-inn.mjs
```

**Ny liste:** legg den i `lists` i `data/personer.json`, lag `data/<id>/<person>.json` (`{ "wishes": [] }`), kopier `bergen.html` til `<id>.html` med ny `data-list` og tittel, og legg en knapp på `index.html`.
