# Welcome to Your New Wails3 Project!

Congratulations on generating your Wails3 application! This README will guide you through the next steps to get your project up and running.

## Getting Started

1. Navigate to your project directory in the terminal.

2. To run your application in development mode, use the following command:

   ```
   wails3 dev
   ```

   This will start your application and enable hot-reloading for both frontend and backend changes.

3. To build your application for production, use:

   ```
   wails3 build
   ```

   This will create a production-ready executable in the `build` directory.

## Exploring Wails3 Features

Now that you have your project set up, it's time to explore the features that Wails3 offers:

1. **Check out the examples**: The best way to learn is by example. Visit the `examples` directory in the `v3/examples` directory to see various sample applications.

2. **Run an example**: To run any of the examples, navigate to the example's directory and use:

   ```
   go run .
   ```

   Note: Some examples may be under development during the alpha phase.

3. **Explore the documentation**: Visit the [Wails3 documentation](https://v3.wails.io/) for in-depth guides and API references.

4. **Join the community**: Have questions or want to share your progress? Join the [Wails Discord](https://discord.gg/JDdSxwjhGf) or visit the [Wails discussions on GitHub](https://github.com/wailsapp/wails/discussions).

## Project Structure

Take a moment to familiarize yourself with your project structure:

- `frontend/`: Contains your frontend code (HTML, CSS, JavaScript/TypeScript)
- `main.go`: The entry point of your Go backend
- `app.go`: Define your application structure and methods here
- `wails.json`: Configuration file for your Wails project

## Next Steps

1. Modify the frontend in the `frontend/` directory to create your desired UI.
2. Add backend functionality in `main.go`.
3. Use `wails3 dev` to see your changes in real-time.
4. When ready, build your application with `wails3 build`.

Happy coding with Wails3! If you encounter any issues or have questions, don't hesitate to consult the documentation or reach out to the Wails community.

# Android debug workflow (SMS import)

The SMS import feature only exists on Android (it reads the phone's M-Pesa
inbox through an injected bridge), so its whole dev loop lives on a device.

## Build the debug APK

Requires the Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT) and a connected
or downloadable platform + build-tools; the first run can take a while.

    wails3 task android:package

- Production (signed release, arm64) APK is the default target.
- For a faster debug build: `wails3 task android:build` (no APK assembly).
- Fat APK for emulator + device: `wails3 task android:package:fat`.
- Output lands under `build/android/app/build/outputs/apk/…` (signed release
  APK in ...`release`, e.g. `app-release-signed.apk`).
- If only `pnpm` exists but the task wants another package manager, the
  root `Taskfile.yml` already defaults `PACKAGE_MANAGER` to pnpm — always
  build via the root task (`android:package`), not the inner Taskfile.

## Install on a device

Enable Developer options + USB debugging, then either:

    adb install -r build/android/app/build/outputs/apk/release/app-release-signed.apk

or copy the APK onto the phone and open it.

## Using the SMS audit

1. Open the app → in **SMS mode** the header shows **Import SMS**, or go
   to **Settings → SMS import details** (only visible on Android, where
   the bridge is present).
2. Grant READ_SMS when prompted ("Allow SMS access and import").
3. The dialog parses every M-Pesa message in the inbox and shows the audit:
   parsed/skipped counts, per-kind filters (unsupported / malformed /
   invalid / non-transactional), free-text filter, and a detail view per
   message (raw SMS next to everything the parser produced).
4. **Copy audit report** puts a plain-text report of all skipped messages
   (with raw bodies and reasons) plus capped parsed messages on the
   clipboard — paste it back to the agent to extend parser coverage.
5. After closing the dialog, the last audit stays available on the **SMS**
   page (session-only). Importing saves automatically: the batch is
   written into the same store as PDF statements and the app switches
   into SMS mode, so the Dashboard shows the SMS dataset right away.
   Switch between Statements and SMS mode in Settings.

## Useful commands

    go test ./internal/sms/          # parser fixtures + classification tests
    wails3 task android:package      # rebuild after any Go or frontend change
    adb logcat --pid=$(adb shell pidof com.wails.app)   # runtime logs

# Notes from creator

- Onboarding should have the user setup their own icons for categories. For every section have an icon showing how we categorize them
- TODO: Streamline customization, inspiration: https://www.youtube.com/watch?v=MccJdr61xnc - Geoffrey Litt
- The app should have a "what's new" modal on first launch after an update. Can be disabled in the settings
- Make animations disable them in the settings with a "reduce motion" option
