# Rilascio

## Web e PWA

Qualunque hosting statico in **HTTPS** (necessario per il service worker e per installare l'app su iPhone).

- **Netlify** o **Cloudflare Pages**: build `npm run build`, cartella `dist`. `public/_headers` imposta CSP, cache immutabile per gli asset e nessuna cache per `index.html` e `sw.js`.
- **GitHub Pages**: pubblica `dist` (es. con `actions/deploy-pages`). Il percorso base è relativo, funziona anche in sottocartella.

A ogni nuova versione l'app mostra *Nuova versione disponibile* con il pulsante *Aggiorna*.

Installazione: su iPhone Safari → Condividi → *Aggiungi alla schermata Home*; su Android Chrome propone *Installa app*.

## iOS → TestFlight (senza Mac)

Il workflow [`ios-testflight.yml`](../.github/workflows/ios-testflight.yml) compila l'app su un Mac di GitHub, la firma con la firma cloud di Apple e la carica su App Store Connect.

**Una tantum**

1. Su App Store Connect crea l'app con bundle id `app.ponte.officina`.
2. In *Utenti e accessi* → *Integrazioni* → *App Store Connect API* crea una chiave del team con ruolo **Admin** e scarica il file `.p8`.
3. Nel repository, *Settings* → *Secrets and variables* → *Actions*, aggiungi:

| Secret | Valore |
|---|---|
| `APPLE_TEAM_ID` | Team ID (10 caratteri, da developer.apple.com → Membership) |
| `ASC_KEY_ID` | Key ID della chiave API |
| `ASC_ISSUER_ID` | Issuer ID mostrato sopra l'elenco chiavi |
| `ASC_KEY_P8` | contenuto completo del file `.p8` |

La chiave privata vive solo nei secret di GitHub: non va mai nel repository né in chat.

**A ogni versione**

- *Actions* → *iOS → TestFlight* → *Run workflow*, oppure un tag `v*` (`git tag v2.1.0 && git push --tags`).
- Il numero di build è `run_number + 100`, sempre crescente.
- Dopo circa 10 minuti di elaborazione la build compare in TestFlight. Se il workflow fallisce, il motivo è nelle annotazioni del job.

## Android

```bash
npm run cap:android   # build web, sync e apre Android Studio
```

Da Android Studio: *Build* → *Generate Signed App Bundle* per il Play Store.

## Prima della pubblicazione sugli store

- **Identificativo**: `app.ponte.officina` (in `capacitor.config.ts`, `android/app/build.gradle`, progetto iOS). Dopo la prima pubblicazione non si cambia più.
- **Permessi** già dichiarati con testi in italiano: fotocamera e libreria foto.
- **Versione**: `version` in `package.json` è quella mostrata in *Impostazioni*.
