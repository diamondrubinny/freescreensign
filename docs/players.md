# Installing players

[עברית](players.he.md)

Every Rubinny player shows the same web player, served by **your** server at
`https://<your-domain>/player/`. Updates to the player reach every screen on its own; the
wrappers below only add what a browser cannot do on its own: starting with the device, staying
full screen and awake, recovering from crashes, and (where noted) remote screenshots.

| Device                      | Use                                       | Remote screenshots |
| --------------------------- | ----------------------------------------- | :----------------: |
| Any modern browser          | [Browser](#browser)                       |         —          |
| Windows / Linux PC, mini-PC | [Desktop app](#desktop-app-windows-linux) |         ✓          |
| Raspberry Pi 4 / 5          | [Raspberry Pi kiosk](#raspberry-pi)       |         —          |

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
