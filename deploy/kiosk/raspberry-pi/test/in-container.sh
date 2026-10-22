#!/usr/bin/env bash
# Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
# Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
# SPDX-License-Identifier: AGPL-3.0-only
# https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

# Runs install.sh for real inside a throwaway Debian container and checks the result.
# Only apt-get and systemctl are stubbed (no package mirror or init system needed).
#
#   docker run --rm -v "$PWD/deploy/kiosk/raspberry-pi:/src:ro" debian:trixie /src/test/in-container.sh

set -euo pipefail

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}
ok() { printf 'ok - %s\n' "$*"; }

[ -f /.dockerenv ] || fail "run this only inside a throwaway container"

for cmd in apt-get systemctl; do
  printf '#!/bin/sh\necho "%s $*" >>/var/log/stub-calls\n' "$cmd" >"/usr/local/sbin/$cmd"
  chmod +x "/usr/local/sbin/$cmd"
done
mkdir -p /boot/firmware
echo "console=tty1 root=PARTUUID=x rootwait" >/boot/firmware/cmdline.txt

# Input checks.
for bad in "http://signage.example.com" "https://user:pw@example.com" "https://example.com/x?y" "javascript:alert(1)" ""; do
  if /src/install.sh --url "$bad" >/dev/null 2>&1; then fail "accepted --url '$bad'"; fi
done
ok "rejects unsafe or missing --url"
if su nobody -s /bin/bash -c '/src/install.sh --url https://a.example' >/dev/null 2>&1; then
  fail "ran without root"
fi
ok "refuses to run without root"
/src/install.sh --url https://a.example --dry-run >/dev/null
[ ! -e /etc/rubinny-kiosk.conf ] || fail "--dry-run changed the system"
ok "--dry-run changes nothing"

# Install twice (idempotent).
/src/install.sh --url https://signage.example.com/ --auto-updates --watchdog >/dev/null
/src/install.sh --url https://signage.example.com >/dev/null

id rubinny >/dev/null || fail "no kiosk user"
[ "$(getent passwd rubinny | cut -d: -f7)" = /usr/sbin/nologin ] || fail "kiosk user has a login shell"
[ "$(passwd -S rubinny | cut -d' ' -f2)" = L ] || fail "kiosk user has a password"
if id -nG rubinny | grep -qwE 'sudo|root|adm'; then fail "kiosk user is privileged"; fi
ok "unprivileged kiosk user without password or login shell"

grep -qx 'RUBINNY_URL="https://signage.example.com"' /etc/rubinny-kiosk.conf || fail "config"
# shellcheck disable=SC2016 # a literal $RUBINNY_URL in the launcher
grep -q '"$RUBINNY_URL/player/"' /usr/local/bin/rubinny-kiosk || fail "launcher URL"
sh -n /usr/local/bin/rubinny-kiosk || fail "launcher syntax"
[ "$(stat -c %a /usr/local/bin/rubinny-kiosk)" = 755 ] || fail "launcher mode"
for f in /etc/rubinny-kiosk.conf /etc/systemd/system/rubinny-kiosk.service /etc/pam.d/rubinny-kiosk; do
  [ "$(stat -c '%a %U' "$f")" = "644 root" ] || fail "mode/owner of $f"
done
[ -z "$(find /etc /usr/local/bin -name 'rubinny-kiosk*.??????' -print -quit)" ] || fail "temp files left"
ok "config, launcher, PAM and unit written with safe modes"

grep -q 'User=rubinny' /etc/systemd/system/rubinny-kiosk.service || fail "unit runs as root"
grep -q 'Restart=always' /etc/systemd/system/rubinny-kiosk.service || fail "unit does not restart"
ok "service runs as the kiosk user and always restarts"

[ "$(grep -o 'consoleblank=0' /boot/firmware/cmdline.txt | wc -l)" = 1 ] || fail "consoleblank"
[ -f /etc/systemd/system.conf.d/rubinny-watchdog.conf ] || fail "watchdog"
[ -f /etc/apt/apt.conf.d/20auto-upgrades ] || fail "auto-updates"
grep -q 'systemctl enable rubinny-kiosk.service' /var/log/stub-calls || fail "not enabled"
ok "blanking off once, watchdog, auto-updates, enabled on boot"

/src/install.sh --uninstall >/dev/null
for f in /etc/systemd/system/rubinny-kiosk.service /usr/local/bin/rubinny-kiosk /etc/rubinny-kiosk.conf /etc/pam.d/rubinny-kiosk; do
  [ ! -e "$f" ] || fail "uninstall left $f"
done
if grep -q consoleblank /boot/firmware/cmdline.txt; then fail "uninstall left consoleblank"; fi
ok "uninstall removes everything it added"
