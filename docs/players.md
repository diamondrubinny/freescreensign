# Installing players

[עברית](players.he.md)

Every Rubinny player shows the same web player, served by **your** server at
`https://<your-domain>/player/`. Updates to the player reach every screen on its own; the
wrappers below only add what a browser cannot do on its own: starting with the device, staying
full screen and awake, recovering from crashes, and (where noted) remote screenshots.

| Device                            | Use                                       | Remote screenshots |
| --------------------------------- | ----------------------------------------- | :----------------: |
| Any modern browser                | [Browser](#browser)                       |         —          |
| Windows / Linux PC, mini-PC       | [Desktop app](#desktop-app-windows-linux) |         ✓          |
| Raspberry Pi 4 / 5                | [Raspberry Pi kiosk](#raspberry-pi)       |         —          |
| Android 8.0+, Android TV, tablets | [Android app](#android-and-android-tv)    |         ✓          |
| Samsung (2020+), LG webOS screens | [Samsung and LG](#samsung-and-lg-screens) |         —          |

**Pairing is the same everywhere:** the screen shows a 6-character code; in the dashboard go to
**Screens › Add screen** and enter it. The screen then keeps a device token and needs no
further setup.

**Portrait or upside-down screens:** set the orientation of the screen in the dashboard
(**Screens › Edit › Orientation**). The player rotates the content itself, on every
device, so there is nothing to configure on the device.

**The server address must use https** (a real domain with the automatic certificate from
`deploy/`). The device token travels to it.

## Browser

Open `https://<your-domain>/player/` in full-screen or kiosk mode (for example
`chromium --kiosk https://<your-domain>/player/`). Turn off the device's screen saver and sleep.
Good for trying Rubinny and for devices with a built-in kiosk mode.

## Desktop app (Windows, Linux)

The **Rubinny Player** app (`apps/desktop`, Electron) opens full screen, keeps the display
awake, starts with the computer, reloads after a crash or a network outage at boot, and can send
a real screenshot to the dashboard.

1. Download the installer for your system: **Windows** `rubinny-player-<version>-x64.exe`,
   **Linux** `.AppImage` or `.deb`. Until signed releases are published, CI builds them on every
   change (GitHub › Actions › CI › the latest run › _Artifacts_), or build them yourself:
   `pnpm --filter @rubinny/desktop dist:linux` (or `dist:win` on Windows).
2. Run it. On the first start it asks for your server address (`https://signage.example.com`).
3. Pair the screen.

- **Admin keys:** `Ctrl+Shift+Alt+S` returns to the server address page, `Ctrl+Shift+Alt+Q`
  quits.
- **Windows SmartScreen** warns about the installer because it is not code-signed yet
  (_More info › Run anyway_).
- **No GPU** (some virtual machines): if screenshots come out black or fail, start the app with
  the environment variable `RUBINNY_DISABLE_GPU=1`.
- **Managed installs** can preset the server with `RUBINNY_SERVER_URL=https://…`.
- **Security:** the app only shows pages from the configured server; it blocks other sites,
  pop-ups and every permission request (camera, location…), and the page gets no access to the
  computer except taking a screenshot of its own window.

## Raspberry Pi

A script turns a Raspberry Pi 4 or 5 into a dedicated screen: on boot, Chromium opens the player
full screen on the **cage** Wayland kiosk compositor, as an unprivileged user, and restarts if it
ever stops.

1. Install **Raspberry Pi OS (64-bit) Bookworm or newer** — Lite is enough — with Raspberry Pi
   Imager. In the Imager settings, enable SSH **with a public key** and set Wi-Fi if needed.
2. Copy the script to the Pi and run it:

   ```bash
   scp deploy/kiosk/raspberry-pi/install.sh <user>@<pi-address>:
   ssh <user>@<pi-address>
   sudo ./install.sh --url https://signage.example.com --auto-updates --watchdog
   sudo reboot
   ```

3. Pair the screen.

| Option           | What                                                           |
| ---------------- | -------------------------------------------------------------- |
| `--url`          | Your Rubinny server (https only). Required.                    |
| `--auto-updates` | Installs `unattended-upgrades` for automatic security updates. |
| `--watchdog`     | Turns on the hardware watchdog: a frozen Pi reboots by itself. |
| `--dry-run`      | Prints every command and file without changing anything.       |
| `--uninstall`    | Removes the kiosk (the `rubinny` user is kept).                |

- **Change the server later:** edit `/etc/rubinny-kiosk.conf`, then
  `sudo systemctl restart rubinny-kiosk`.
- **Logs:** `journalctl -u rubinny-kiosk`.
- **Re-running the script is safe** (for example, to change options).
- **What it changes:** installs `cage`, Chromium and fonts; creates the user `rubinny` (no
  password, no login shell, no sudo; only the video, render, input and audio groups); writes
  `/etc/rubinny-kiosk.conf`, `/usr/local/bin/rubinny-kiosk`, `/etc/pam.d/rubinny-kiosk` and
  `rubinny-kiosk.service` on the first console (tty1, replacing its login prompt); adds
  `consoleblank=0` to the kernel command line so the screen never blanks.
- **Remote screenshots** are not available on the Pi yet (Chromium has no safe bridge for them).
- **Tested** with ShellCheck, a real install/uninstall in a Debian container, `systemd-analyze
verify`, and the launcher running in a real cage with Chromium. Testing on Raspberry Pi
  hardware is still to be done (see [phase 8 results](phases/08-wrappers.md)).

## Android and Android TV

The **Rubinny Player** Android app (`apps/android`) shows the player full screen on Android
8.0 or newer — TV boxes, smart TVs with Android TV / Google TV, tablets and phones. It keeps the
screen on, recovers from crashes, and can send a real screenshot to the dashboard.

1. Get the APK: until a signed release is published, CI builds a debug APK on every change of
   the app (GitHub › Actions › Android › the latest run › _Artifacts_ ›
   `rubinny-player-android-debug`).
2. Install it: allow installing apps from unknown sources for your file manager or browser, or
   from a computer with `adb install app-debug.apk`.
3. Open **Rubinny Player**, enter your server address, and pair the screen.

**Starting with the device** (Android 10 and newer restrict apps that open by themselves):

- **Best:** make Rubinny Player the **home app** (Settings › Apps › Default apps › Home app).
  The device then always opens the player, also after Home is pressed.
- **Or:** on the setup page, tap **Allow display over other apps**; the player then opens
  after a restart. Many TV devices do not have this setting — use the home app there.

- **Admin access:** press **Back five times quickly** to return to the setup page (Back never
  leaves the player otherwise).
- **Security:** the app only shows pages of your server (other sites inside a web page widget
  are allowed in their frame, but never get the screenshot channel), refuses every permission,
  and its data (the device token) is excluded from backups and device transfers.
- **Debug build:** the APK from CI is signed with a debug key and allows inspecting the page
  over USB debugging. A signed release build for stores is not part of this phase.

## Samsung and LG screens

> **Not yet verified on a real screen.** The player is built and checked for the browser engine
> of these screens, but every step below **requires verification against the official
> documentation** of Samsung and LG and a test on a device. Please report what works.

**Which screens:** the player needs Chromium 69 or newer.

- **Samsung** (Tizen): 2020 models (Tizen 5.5) and newer, per Samsung's
  [web engine table](https://developer.samsung.com/tv/develop/specifications/web-engine-specifications).
- **LG** (webOS Signage): 6.0 and newer. LG publishes no engine table for signage; the version
  comes from other vendors' notes.
- **Older screens are not supported.** Their browser engine no longer gets security fixes;
  use a [desktop app](#desktop-app-windows-linux) or [Android](#android-and-android-tv) box
  instead.

**Option 1, nothing to install (recommended for signage models):** many signage screens can
open a web address on their own. Point it at `https://<your-domain>/player/`:

- **Samsung:** the **URL Launcher** of the screen's menu.
- **LG:** the screen's setting for a web address or "SI Server".

The names and menus differ by model; see the screen's manual.

**Option 2, the Rubinny loader app:** each release has two small packages. They contain a
loader page only: it asks for the server address once and then opens your server's player.
Updates of the player still come from your server.

- `rubinny-tv-tizen-<version>-unsigned.wgt` (Samsung): **unsigned.** Samsung screens install
  only apps signed with a certificate that names the device. Sign it with **Tizen Studio**
  (Certificate Manager, a Samsung certificate with your screens' IDs), then install it with
  Tizen Studio's Device Manager or the `tizen` command. You may need to change the package ID
  in `config.xml` (`RbnyPlayer`) to one of your own.
- `rubinny-tv-webos-<version>.ipk` (LG): install it with LG's
  [`ares-install`](https://www.npmjs.com/package/@webos-tools/cli) on a screen in
  **Developer Mode**, or the way your signage model installs apps.

**Using the loader:**

1. **First start:** enter your server address with the remote (a bare `signage.example.com`
   works; only https is accepted), then **Save and start**.
2. **Later starts:** the player opens after 10 seconds. Any key stops the countdown;
   **Change server** goes back to the address.
3. **Back** in the player returns to the loader page.

**What the loader can't do (yet):** remote screenshots, turning the screen on and off on a
schedule, and updating itself. Those need the vendors' own APIs and a device to test on.

**Security and privacy:** the loader runs no code from the network itself, only opens your
server's player; it keeps only the server address on the screen (the player keeps its device
token, as on every device). Because the server is chosen on the screen, the app's network
permissions allow any https address; the loader refuses anything else.
