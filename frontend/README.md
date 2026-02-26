# Polyglot Writing Coach Frontend

## Run

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000

## PWA

- Install prompt is shown when browser supports `beforeinstallprompt`.
- Service worker: `/public/sw.js`
- Web manifest: `/src/app/manifest.ts`

## Learning data

- Saved words and quiz queue are auto-saved in browser local storage.
- Use `Backup data` to export JSON and keep it in your own cloud account (iCloud/Drive/etc.).
  - Optional: add a PIN to export encrypted backup.
- Use `Restore backup` to import the same JSON on another device.
- Backup files include checksum validation to detect corrupted/tampered files.
