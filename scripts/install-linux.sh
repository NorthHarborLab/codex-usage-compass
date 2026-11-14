#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mode=${1:-all}
case "$mode" in all|plugin|indicator) ;; *) echo 'Usage: install-linux.sh [all|plugin|indicator]' >&2; exit 2;; esac
if [ "$mode" != indicator ]; then
  command -v codex >/dev/null || { echo 'Install Codex CLI and sign in first.' >&2; exit 1; }
  codex plugin marketplace add "$root"
  codex plugin add weekly-usage@weekly-usage-local
fi
if [ "$mode" != plugin ]; then
  command -v gjs >/dev/null || { echo 'Install gjs, GTK3 and an AppIndicator typelib first.' >&2; exit 1; }
  destination="$HOME/.local/share/codex-weekly-usage"
  install -d "$destination/src" "$destination/desktop" "$HOME/.config/systemd/user"
  install -m 0644 "$root"/src/account.mjs "$root"/src/usage.mjs "$root"/src/i18n.mjs "$destination/src/"
  install -m 0644 "$root"/desktop/indicator.mjs "$root"/desktop/read-usage.mjs "$destination/desktop/"
  install -m 0644 "$root"/desktop/codex-weekly-usage-indicator.service "$HOME/.config/systemd/user/"
  if [ "${USAGE_INSTALL_ONLY:-0}" = 1 ]; then exit 0; fi
  systemctl --user daemon-reload
  systemctl --user enable codex-weekly-usage-indicator.service
  systemctl --user restart codex-weekly-usage-indicator.service
fi
