#!/usr/bin/env bash
# Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
# Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
# SPDX-License-Identifier: AGPL-3.0-only
# https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

# Rubinny kiosk for Raspberry Pi OS (Bookworm or newer, Lite or Desktop).
#
# Turns the Pi into a dedicated screen: on boot, the Rubinny web player opens full
# screen in Chromium on the "cage" Wayland kiosk compositor, as an unprivileged user,
# and restarts if it ever stops. Rotation (portrait screens) is set per screen in the
# CMS, not here. See docs/players.md.
#
#   sudo ./install.sh --url https://signage.example.com [--auto-updates] [--watchdog]
#   sudo ./install.sh --uninstall
#   ./install.sh --url https://signage.example.com --dry-run   (prints, changes nothing)
#
# License: AGPL-3.0-only. Part of Rubinny (https://github.com/diamondrubinny/freescreensign).

set -euo pipefail

readonly KIOSK_USER="rubinny"
readonly CONF="/etc/rubinny-kiosk.conf"
readonly LAUNCHER="/usr/local/bin/rubinny-kiosk"
readonly UNIT="/etc/systemd/system/rubinny-kiosk.service"
readonly PAM="/etc/pam.d/rubinny-kiosk"
readonly WATCHDOG_CONF="/etc/systemd/system.conf.d/rubinny-watchdog.conf"

URL=""
AUTO_UPDATES=0
WATCHDOG=0
UNINSTALL=0
DRY_RUN=0
readonly ARGS="$*"

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Runs a command, or prints it in --dry-run mode.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# Writes stdin to a file (mode $2), or prints it in --dry-run mode.
write_file() {
  local path="$1" mode="$2" content
  content="$(cat)"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] write %s (mode %s):\n%s\n' "$path" "$mode" "$content"
    return
  fi
  install -d -m 0755 "$(dirname "$path")"
  local temp
  temp="$(mktemp "${path}.XXXXXX")"
  printf '%s\n' "$content" >"$temp"
  chmod "$mode" "$temp"
  mv -f "$temp" "$path"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      [ $# -ge 2 ] || die "--url needs a value"
      URL="$2"
      shift 2
      ;;
    --url=*)
      URL="${1#--url=}"
      shift
      ;;
    --auto-updates) AUTO_UPDATES=1 && shift ;;
    --watchdog) WATCHDOG=1 && shift ;;
    --uninstall) UNINSTALL=1 && shift ;;
    --dry-run) DRY_RUN=1 && shift ;;
    -h | --help) usage 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  die "run as root: sudo $0 $ARGS"
fi

# ----------------------------------------------------------------------------- uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  log "Removing the Rubinny kiosk"
  run systemctl disable --now rubinny-kiosk.service || true
  run rm -f "$UNIT" "$PAM" "$LAUNCHER" "$CONF" "$WATCHDOG_CONF"
  run systemctl daemon-reload
  run systemctl enable getty@tty1.service || true
  for cmdline in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
    if [ -f "$cmdline" ]; then run sed -i 's/ consoleblank=0//' "$cmdline"; fi
  done
  log "Done. The user '$KIOSK_USER' was kept (remove it with: sudo userdel -r $KIOSK_USER)."
  exit 0
fi

# ----------------------------------------------------------------------------- checks
# Only https: the device token travels to this server. No credentials, paths or queries.
[[ "$URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]] ||
  die "--url must be the https address of your Rubinny server, e.g. https://signage.example.com"
URL="${URL%/}"

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${VERSION_CODENAME:-}" in
    bookworm | trixie) ;;
    *) log "warning: tested on Raspberry Pi OS Bookworm/Trixie; this is '${PRETTY_NAME:-unknown}'" ;;
  esac
fi

# Raspberry Pi OS names the browser "chromium-browser" on older releases.
CHROMIUM_PKG="chromium"
CHROMIUM_BIN="/usr/bin/chromium"
if apt-cache show chromium-browser >/dev/null 2>&1 && ! apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG="chromium-browser"
  CHROMIUM_BIN="/usr/bin/chromium-browser"
fi

# ----------------------------------------------------------------------------- packages
log "Installing packages (cage, $CHROMIUM_PKG)"
run env DEBIAN_FRONTEND=noninteractive apt-get update -q
run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
  cage "$CHROMIUM_PKG" fonts-noto-core fonts-noto-color-emoji dbus-user-session

if [ "$AUTO_UPDATES" -eq 1 ]; then
  log "Enabling automatic security updates"
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q unattended-upgrades
  write_file /etc/apt/apt.conf.d/20auto-upgrades 0644 <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
fi

# ----------------------------------------------------------------------------- user
if id "$KIOSK_USER" >/dev/null 2>&1; then
  log "User '$KIOSK_USER' exists"
else
  log "Creating the unprivileged user '$KIOSK_USER' (no password, no sudo)"
  run useradd --create-home --shell /usr/sbin/nologin --comment "Rubinny kiosk" "$KIOSK_USER"
fi
# Display, GPU, input and sound devices (only the groups this system has).
for group in video render input audio; do
  if getent group "$group" >/dev/null; then run usermod -aG "$group" "$KIOSK_USER"; fi
done

# ----------------------------------------------------------------------------- files
log "Writing $CONF"
write_file "$CONF" 0644 <<CONF
# Rubinny kiosk settings (read by $LAUNCHER). Change the address and run:
#   sudo systemctl restart rubinny-kiosk
RUBINNY_URL="$URL"
CONF

log "Writing $LAUNCHER"
write_file "$LAUNCHER" 0755 <<LAUNCH
#!/bin/sh
# Starts the Rubinny player full screen (run by rubinny-kiosk.service inside cage).
set -eu
. $CONF
case "\$RUBINNY_URL" in https://*) ;; *) echo "RUBINNY_URL must be https" >&2; exit 1 ;; esac
exec $CHROMIUM_BIN \\
  --kiosk --noerrdialogs --disable-infobars --no-first-run \\
  --disable-session-crashed-bubble --disable-features=Translate,TranslateUI \\
  --autoplay-policy=no-user-gesture-required --password-store=basic \\
  --ozone-platform=wayland --check-for-update-interval=31536000 \\
  --user-data-dir="\$HOME/.config/rubinny-chromium" \\
  "\$RUBINNY_URL/player/"
LAUNCH

# PAM stack for the kiosk session (seat and logind session for the Wayland compositor).
write_file "$PAM" 0644 <<'CONF'
auth     required pam_unix.so nullok
account  required pam_unix.so
session  required pam_unix.so
session  required pam_systemd.so
CONF

log "Writing $UNIT"
write_file "$UNIT" 0644 <<UNIT
[Unit]
Description=Rubinny kiosk (Chromium on the cage Wayland compositor, tty1)
Documentation=https://github.com/diamondrubinny/freescreensign#readme
After=systemd-user-sessions.service plymouth-quit-wait.service network-online.target
Wants=network-online.target dbus.socket systemd-logind.service
After=dbus.socket systemd-logind.service
Conflicts=getty@tty1.service
After=getty@tty1.service
ConditionPathExists=/dev/tty1

[Service]
Type=simple
User=$KIOSK_USER
PAMName=rubinny-kiosk
WorkingDirectory=~
Environment=XDG_SESSION_TYPE=wayland
ExecStart=/usr/bin/cage -d -- $LAUNCHER
Restart=always
RestartSec=5
UtmpIdentifier=tty1
UtmpMode=user
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty-fail
StandardOutput=journal
StandardError=journal
NoNewPrivileges=yes
ProtectSystem=full
PrivateTmp=yes

[Install]
WantedBy=graphical.target
UNIT

if [ "$WATCHDOG" -eq 1 ]; then
  log "Enabling the hardware watchdog (reboots a frozen Pi)"
  write_file "$WATCHDOG_CONF" 0644 <<'CONF'
[Manager]
RuntimeWatchdogSec=15
RebootWatchdogSec=2min
CONF
fi

# ----------------------------------------------------------------------------- screen blanking
# The console must never blank the screen (kernel parameter on the Pi's boot partition).
CMDLINE=""
for candidate in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
  if [ -f "$candidate" ]; then CMDLINE="$candidate" && break; fi
done
if [ -n "$CMDLINE" ] && ! grep -q 'consoleblank=0' "$CMDLINE"; then
  log "Disabling console blanking in $CMDLINE"
  run sed -i '1 s/$/ consoleblank=0/' "$CMDLINE"
fi

# ----------------------------------------------------------------------------- enable
log "Enabling the kiosk on boot"
run systemctl daemon-reload
run systemctl disable getty@tty1.service || true
run systemctl set-default graphical.target
run systemctl enable rubinny-kiosk.service

log "Installed. Reboot to start: sudo reboot"
log "Then pair the screen: the player shows a code; enter it in Rubinny › Screens › Add screen."
