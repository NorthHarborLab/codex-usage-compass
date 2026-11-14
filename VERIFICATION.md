# Release verification — v0.3.2

Tested on Ubuntu with GNOME Shell 50.1, Node.js 26.11.1, GJS/GTK3 and the desktop's Codex CLI.

- Six automated tests passed for duration-based window discovery, budget calculations, interval boundaries, low-quota overrides, stale/expired data, and language fallback.
- Chromium MCP-host simulation passed for bilingual rendering, two independently coloured rings, conservative combined advice, moving countdowns, missing windows and narrow layouts.
- Clean installation used a new temporary HOME and CODEX_HOME with no prior plugin cache, credentials or node_modules. The packaged MCP launched, advertised its tools, returned the UI, and gave a readable signed-out error.
- The companion installed into that fresh home and ran on a separate session D-Bus with a test StatusNotifierWatcher. A simulated Codex process supplied both windows. Exported menu data, second-by-second countdown changes and the English-to-Chinese menu action passed.
- The real user session was upgraded through the same installer. Its systemd service and registered top-panel indicator were checked, and the real Codex account returned weekly quota.

This is an isolated application installation on the existing operating system, not a freshly installed VM. Native UI automation cannot inspect the full GNOME panel here; menu integration is verified through its D-Bus contract. The user previously confirmed the in-app panel renders and counts down. The live account did not supply a 5-hour window, so that path uses fixtures. The Ayatana fallback, Windows and macOS are untested.

To repeat:

```sh
npm ci
npm test
npm run build
node scripts/verify-ui.mjs
node scripts/verify-clean.mjs
# Use the temporary home path printed by the previous command:
env HOME=/tmp/quota-clean-XXXXXX/home dbus-run-session -- python3 scripts/verify-indicator.py
```

The clean installer test sets USAGE_INSTALL_ONLY=1 to stage the companion without changing the active user's service manager. It then launches that staged companion directly in its isolated session.
