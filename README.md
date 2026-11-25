# phone-app-lyra
lyra phone app v1

Mini Lyra: a standalone Android app (Capacitor). It doesn't need a PC or Tailscale.

- **Brain:** NVIDIA's free API. Nemotron Ultra replies, Bolt plans each turn, and Lightning is the backup.
- **Voice:** Fish Audio.
- **Memory:** stored on the phone, using nemotron embeddings for recall.
- **Features:** reminders (phone notifications), shopping list, diary, photos and camera, and Share → Lyra.
- **Approved apps only:** each app needs a tick to be opened, and another for its notifications to be read. "Call" only opens the dialer.
- **No keys in the app:** API keys are typed into the app's Settings and stay on the phone.

## Build
JDK 21 and the Android SDK are needed.

```
npm install
npx cap sync android
cd android && gradlew.bat assembleDebug
```

## Updates
The app checks this repo's releases for a tag like `mobile-v1.0.1` with an `.apk` asset, and offers an Update button.
Bump `versionCode` and `versionName` in `android/app/build.gradle` before building a new release.
Sign updates with the same key, or Android won't install them over the old version.
