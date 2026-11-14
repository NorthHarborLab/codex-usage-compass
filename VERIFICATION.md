# Verification for 0.5.0

Local environment: Ubuntu GNOME 50.1, GJS/GTK3/AppIndicator, the desktop's Codex CLI, Node.js 26.11.1. CI uses Node.js 20 on Ubuntu, Windows Server 2022, and macOS 15 (Apple Silicon and Intel).

- Twelve unit tests cover quota discovery and thresholds, pacing advice, languages, concurrent single-owner locking, stale-owner recovery, Windows/macOS launch arguments, hidden unavailable short windows and native tray view models.
- Chromium UI tests cover dual quotas, conservative advice, EN/ZH switching, second-by-second countdown, unavailable windows and narrow layouts.
- A clean HOME/CODEX_HOME installs only the plugin, discovers its server using `codex mcp list`, starts its packaged MCP server, discovers tools and resources, and displays a signed-out account error. No separate indicator install is performed.
- A separate D-Bus session starts the installed plugin launcher with a simulated Codex account. Its automatic GJS child exports the expected menu, countdown and language actions. Two loaded plugins share one owner; closing the owner transfers ownership to the second; hiding the ring persists and removes the lock.
- Codex's own app-server discovers and starts the plugin from a fresh profile with spaces and Chinese characters in its path. This caught and fixed a launcher-path compatibility issue that direct server tests could not reveal.
- Windows CI compiles the shipped C# renderer using Windows PowerShell 5.1 and .NET Framework, creates a NotifyIcon and menu, checks Unicode guidance, invokes refresh/language actions, and repeatedly replaces/disposes ring icons.
- Windows lifecycle CI runs the packaged `.cmd` launcher from a directory containing spaces and Chinese characters, uses two MCP clients, hides/restarts the ring, and checks final lock cleanup.
- macOS native tests run the bundled JXA file through `/usr/bin/osascript` from a Unicode/spaces path, create AppKit status items, check English/Chinese rows, split UTF-8 input, countdown updates, all ring colours/fills, refresh/language/hide actions and EOF cleanup. Lifecycle tests cover shared ownership, hide/restore and cleanup; the Codex host check installs the plugin into an isolated profile.
- System menu tests verify that a missing 5-hour window is hidden and that newly available data restores it; known exhausted/expired windows remain represented. Ubuntu checks the actual D-Bus menu visibility and both native renderers check their menu item visibility.
- CI performs `npm ci` in a fresh environment. A broken inherited transitive dependency URL was repaired by regenerating the lock file from the pinned direct dependencies. Production dependency license notices were regenerated.

Windows smoke/lifecycle reference run: https://github.com/NorthHarborLab/codex-usage-compass/actions/runs/43584285185
Native Codex loader check also passed on Windows: https://github.com/NorthHarborLab/codex-usage-compass/actions/runs/43584558875

## Limits

The Linux clean install uses an isolated application profile on the existing OS, rather than a new OS VM. GNOME integration is checked via D-Bus, with previous user confirmation of the panel's visual rendering. Windows CI is Windows Server 2022; interactive Windows 10/11 desktop acceptance, taskbar overflow placement and actual account usage on Windows remain unverified. Current live account data provides only the weekly window; five-hour tests use fixtures. The Ubuntu graphical authorization flow for dependency installation was not invoked on this already-provisioned machine. Newly installed GNOME extensions can need enabling/relogin. macOS uses a real AppKit menu and image in CI; personal Mac visual acceptance, menu bar overflow/notch placement, live account data and older macOS versions remain unverified.

Automatic startup happens when Codex loads the local MCP service. There is no install-completed hook, and a host that defers local service startup can require opening the quota panel once. Disabling/uninstalling takes effect when the host unloads existing MCP connections. No registry startup key or new systemd service is installed by the automatic mode.

## Reproduce

```sh
npm ci
npm test
npm run build
node scripts/verify-ui.mjs
node scripts/verify-clean.mjs
node scripts/verify-host.mjs
# Use the fresh home and plugin cache printed by verify-clean:
env HOME=/tmp/quota-clean-XXXX/home dbus-run-session -- python3 scripts/verify-auto-indicator.py /tmp/quota-clean-XXXX/home/.codex/plugins/cache/weekly-usage-local/weekly-usage/0.5.0
```

Windows CI uses `scripts/verify-windows.ps1`, `scripts/verify-native-lifecycle.mjs`, and `scripts/verify-host.mjs` with the npm Codex launcher. macOS uses `scripts/verify-macos.mjs` plus the same lifecycle and host checks. The Windows-only historical lifecycle script is retained for reproducing 0.4.0 tests.
