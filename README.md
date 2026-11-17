# Tempo

An offline-first, encrypted study-routine app for Android. Photograph notes, add PDFs or type a syllabus; Tempo reads it on the phone, turns it into Unit › Chapter › Topic, and schedules it into daily and weekly routines with spaced revision.

- **Android app** (Capacitor): installs as an APK, built for you by GitHub Actions.
- **Everything local and encrypted**: AES-256-GCM, key protected by your passphrase. No account, server or analytics.
- **Reads on-device**: OCR (Tesseract) and PDF text extraction run inside the app. Optional AI structuring uses your own API key and sends only extracted text.
- **Smart planner**: spaced revision (2 and 7 days after each topic), even pacing toward an exam date with a buffer, the last two study days kept for final revision, and one-tap catch-up when you miss sessions.
- **Reminders** (scheduled on the phone, no server): daily plan summary, evening nudge only if work is left, routine start alerts, and backup reminders.
- **Four themes** (Paper, Midnight, Matcha, Dusk) and **three Today layouts** (Timeline, Cards, Focus).

## Get the APK (no computer-side Android tooling needed)

1. Create a new empty GitHub repo and push this folder to it (`main` branch).
2. Open the repo's **Actions** tab → **Build Android app** → wait for it to finish (first run ≈ 10 min).
3. Open the finished run → **Artifacts** → download `tempo-apk` → install the APK on your phone.

Commit the `package-lock.json` that the first `npm install` creates so later builds are reproducible.

### Sign the release build (recommended)
Without a signing key the workflow builds a *debug* APK. It installs fine and your data is still encrypted, but a debug build is debuggable over USB and cannot be updated by a different build later. To sign:

```
keytool -genkeypair -v -keystore tempo.jks -alias tempo -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 tempo.jks     # copy the output
```
In the repo: **Settings → Secrets and variables → Actions**, add `KEYSTORE_B64` (that output), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`tempo`). Keep `tempo.jks` safe: losing it means future updates cannot install over the old app. Never commit it (`.gitignore` already excludes it).

### Screenshots
The app blocks screenshots and hides its preview in the recent-apps screen (`FLAG_SECURE`). To allow screenshots, set `SECURE_WINDOW: 'false'` in `.github/workflows/android.yml`.

## Develop

```
npm install
npm test          # 52 tests: encryption, backup/restore, parser, planner, reminders, AI handling, security scans
npm run dev       # browser preview
```

## How it is organised

```
src/core/    pure logic, tested in Node: crypto, vault, storage adapters, parser, planner, AI, schema
src/io/      browser-only: OCR, PDF, image preparation, upload pipeline
src/         dom builder, state, views, styles, entry point
scripts/     OCR asset copy, Android hardening
```

Data model: `Material → units → chapters → topics`, `Task` (dated session, from a plan or typed by hand), `Routine` (weekly recurring block), `Settings`.

## Room to grow
- Biometric unlock: wrap the data key with an Android Keystore key (storage format already uses an envelope key, so no data migration).
- Camera capture, home-screen widget, share-to-Tempo, tap-a-reminder-to-open-that-day.
- More OCR languages: drop another `*.traineddata.gz` into `public/ocr/lang` and pass the language to `createWorker`.
- SQLite storage: implement the same small interface as `src/core/storage.js`.
- Other AI providers: add a client next to `src/core/ai.js` and its host to `connect-src` in `index.html`.

## Reminders: how they work
Android only fires notifications that were scheduled in advance. Tempo schedules the next 14 days (up to 150 notifications) each time you unlock it or change your plan or settings, so **open the app at least every couple of weeks**. Settings → Reminders lets you pick times, turn each kind on or off, and send a test. Notification text shows counts only by default; session names appear only if you opt in. On some phones (Xiaomi, Oppo, Vivo, Samsung) battery savers can delay or block alarms: set Tempo's battery usage to "Unrestricted" if reminders arrive late.

## Status
Core logic, encryption, backup/restore and the full interface were exercised in tests and a real headless Chrome. The Android build itself runs in GitHub Actions and has not been run by the author of this scaffold; if `npm install` rejects a pinned version, adjust it in `package.json`.
