# Niyamasabha AI

A mobile-first React app for exploring Kerala Legislative Assembly information. Capacitor packages the web frontend as an Android app.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system diagram, current data flow, service boundaries, and Android packaging flow.

## Features

- Home screen with a featured Assembly session, trending topics, and a latest updates area.
- Search for available Assembly questions and browse MLA information.
- Claim verification interface.
- Preferences for language, dark mode, and text size.
- About and Help & Feedback screens.
- Local question bookmarks and Android back-button support.

## Current data and service status

The app currently has no verified Assembly records or MLA directory connected, so those screens may show empty states. The latest updates area, Saved Searches, and Notifications are also empty until their data sources are connected. Sign-in is not implemented because there is no authentication service configured.

`src/services/api.js` contains a small fetch helper. Set `VITE_API_BASE_URL` to the backend base URL when a compatible backend is available. No specific backend endpoints are currently wired to the screens.

## Requirements

- Node.js and npm
- For Android builds: Android Studio with the Android SDK and Java 21
- For direct device installation: an Android phone; USB debugging is only needed when installing through Android Studio or ADB

## Run the web app

```bash
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

## Build for Android

On Windows, build and sync the frontend into Capacitor and assemble a debug APK:

```powershell
npm run android:build
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Transfer that APK to a phone and install it to update the app. Android may ask you to allow installation from the file manager or browser used to open the APK.

To open the Android project in Android Studio:

```powershell
npm run android:open
```

After frontend changes, `npm run android:sync` rebuilds the web assets and copies them into the Android project. `npm run android:build` performs the sync and APK build together.

## Project layout

```text
src/
  App.jsx           React screens and navigation
  data.js           App image path and data collections
  styles.css        Shared layout, responsive styling, and themes
  services/api.js   Optional backend fetch helper
public/images/      Static image assets
android/            Capacitor Android project
```
