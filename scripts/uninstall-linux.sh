#!/bin/sh
set -eu
mode=${1:-all}
case "$mode" in all|plugin|indicator) ;; *) echo 'Usage: uninstall-linux.sh [all|plugin|indicator]' >&2; exit 2;; esac
rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/codex-usage-compass.desktop"
if [ "$mode" != plugin ]; then
  systemctl --user disable --now codex-weekly-usage-indicator.service || true
  rm -f "$HOME/.config/systemd/user/codex-weekly-usage-indicator.service"
  rm -rf "$HOME/.local/share/codex-weekly-usage"
  systemctl --user daemon-reload
fi
if [ "$mode" != indicator ]; then
  codex plugin remove weekly-usage@weekly-usage-local
fi
