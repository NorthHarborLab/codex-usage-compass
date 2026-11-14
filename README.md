# Codex Usage Compass

[简体中文](README.zh-CN.md)

[Download v0.3.2](https://github.com/NorthHarborLab/codex-usage-compass/releases/tag/v0.3.2)
A local Codex plugin with 7-day and 5-hour budget rings, pacing suggestions, and an optional Ubuntu top-panel indicator.

## Install on Ubuntu / GNOME

Requirements: signed-in Codex CLI (the desktop app's bundled CLI also works), Node.js 20+, and a Codex desktop version supporting MCP Apps. Keep the extracted folder after installing the plugin, because it is the marketplace source.

Download and extract the release archive, then run from its folder:

```sh
sh scripts/install-linux.sh plugin
```

Open the plugin **Codex Usage Compass** from the desktop sidebar, or ask Codex to open the usage rings. If the previous title “Codex 周额度” is cached, reopen the app. Local tool startup must be permitted by your host.

For the Ubuntu top-panel indicator, install desktop dependencies:

```sh
sudo apt install gjs gir1.2-gtk-3.0 gir1.2-appindicator3-0.1 gnome-shell-extension-appindicator
sh scripts/install-linux.sh indicator
```

On distributions providing Ayatana instead, install `gir1.2-ayatanaappindicator3-0.1`. The indicator supports either typelib. Enable the AppIndicator GNOME extension if it is disabled. Ubuntu normally includes it.

The installer copies the indicator into `~/.local/share/codex-weekly-usage`, installs a user systemd service, and enables it for graphical logins. Click the coloured ring in the system top panel to open the quota menu while keeping your chat visible. The icon follows the available window with the lowest budget coverage. The menu includes a refresh action and language selector.

Run both installers with `sh scripts/install-linux.sh all`. Updates use the same command from the new release folder.

### Uninstall

```sh
sh scripts/uninstall-linux.sh all
# Or uninstall one component:
sh scripts/uninstall-linux.sh indicator
sh scripts/uninstall-linux.sh plugin
```

The language preference is kept at `~/.config/codex-weekly-usage-language`. Remove that file to reset the indicator language. The marketplace registration can be removed with `codex plugin marketplace remove weekly-usage-local`.

## Languages

English and Simplified Chinese are fully translated in the panel and indicator, including errors, guidance, explanations and missing-data states. The panel initially uses the browser language and stores a manual selection when host storage permits. The indicator uses the OS locale and saves its menu selection locally. Other languages fall back to English; Chinese locale variants use Simplified Chinese. Set `USAGE_LANGUAGE=en` or `zh-CN` for server text.

## How guidance works

`reserve = time until reset / window duration × 100%`

`coverage = remaining quota / reserve × 100%`

| Coverage | Colour | Guidance |
|---|---|---|
| <25% | Red | Save for essentials; lighter model / standard speed |
| 25–<50% | Orange | Reduce model size or reasoning effort |
| 50–<80% | Amber | Strong models for difficult work, lighter models for routine work |
| 80–<100% | Blue | Keep a steady pace |
| 100–<150% | Green | Comfortable reserve for more demanding tasks |
| ≥150% | Cyan | Consider a stronger model or Fast mode if available |

The ring is capped at a full circle. Its centre shows actual remaining quota. Suggestions consider both available windows and use the tighter budget. A reserve of 5% or less overrides encouragement to spend more. Expired or stale data suppresses spending suggestions. Missing windows display “No data available” and never imply an unlimited allowance.

This is a steady-pacing heuristic. It does not learn habits or predict model costs. It does not change models or speed settings. A higher speed can consume quota differently depending on the product and plan. Timers update each second; usage refreshes every minute.

## Platform support

Ubuntu GNOME 50 is the tested release target. The plugin launcher uses a POSIX shell. The top-panel companion uses GJS, GTK3, AppIndicator, and systemd. Windows and macOS desktop companions are not implemented or tested in this release.

Each user must sign into their own Codex account. Current accounts may return only a weekly limit. The 5-hour path is tested with fixtures until the account supplies that window.

## Data and security

The plugin invokes the installed `codex app-server` and reads `account/rateLimits/read`. Codex handles authentication and talks to its account service. The plugin does not copy credentials, collect chat contents, run inference, upload quota data to a project server, or persist usage history. Usage stays in process memory; the indicator writes generated ring images to the user's runtime directory. Local language preferences are persisted.

This project is independently developed and is not affiliated with OpenAI. The account protocol and desktop extension interfaces can change.

## Build and verify

```sh
npm ci
npm test
npm run build
CHROME_PATH=/usr/bin/google-chrome node scripts/verify-ui.mjs
```

Prebuilt MCP server and HTML are included, so installing a release does not require npm. See [verification notes](VERIFICATION.md) for the precise clean-install scope and remaining limitations. Bundled dependencies retain their upstream licences in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).
