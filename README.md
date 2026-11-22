# ADHdeer 🦌

A gentle day planner for ADHD brains — now packaged as an **Android app** (and still a fully offline installable web app).

- Day / week / month calendar views
- To-dos that automatically slot into your free gaps
- Events, deadlines (with step spread over the days before), and habits with streaks
- Light / dark themes, high-legibility font, no hover-only controls
- Everything stays on the device (localStorage)

## Project layout

| Path | What it is |
| --- | --- |
| `index.html` | The editable source of the whole app (single file) |
| `www/` | The built web bundle the Android app actually serves |
| `android/` | Capacitor Android project |
| `capacitor.config.json` | App id `com.adhdeer.app`, app name `ADHdeer` |
| `apk/ADHdeer-debug-v1.0.apk` | Prebuilt installable APK |

## Install on your phone

1. Transfer `apk/ADHdeer-debug-v1.0.apk` to your Android phone (or download it from the repo / a CI run).
2. Tap the file and allow "install from unknown sources" for your file manager when asked.
3. Open ADHdeer from your home screen — it works fully offline.

This is a *debug-signed* build: perfect for personal use and sideloading, but not for the Play Store.

## Get a fresh APK automatically

Every push to `main` runs [`.github/workflows/android.yml`](.github/workflows/android.yml),
which builds a new debug APK and uploads it as a workflow artifact — check the
**Actions** tab → latest run → **ADHdeer-debug-apk**.

## Build it yourself

Prereqs: Node.js 22, JDK 21, Android SDK (platform 36, build-tools 36.0.0).

```bash
npm install
npm run sync        # npx cap sync android
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

## How it was wrapped

- The web app (`index.html`) is served by Capacitor's WebView — no server needed.
- `manifest.json` and `sw.js` (missing from the original upload) were added, so the same files work as an installable PWA if you ever host them.
- Launcher icons and splash screens were generated from `vector.png` (the 450×450 deer) — the wide `logo.png` banner stays as the in-app header logo.
- The app registers `sw.js` and stores data in localStorage; inside the WebView that behaves as on disk and persists across launches.
- `CapacitorHttp` is enabled so the **home-storage (NAS) sync** works from inside the app — native HTTP bypasses WebView CORS restrictions that would otherwise block calls to your storage box.

## Updating the app

1. Edit `index.html` (the source of truth).
2. Copy it over `www/index.html` (or just run `npx cap sync android` after replacing `www/`).
3. Bump `versionCode` / `versionName` in `android/app/build.gradle`.
4. Rebuild.
