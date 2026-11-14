# 0.5.0

- Add an automatically managed macOS AppKit menu bar ring for Intel and Apple Silicon, using the built-in JXA runtime.
- Include remaining quota, hover summary, bilingual menus, refresh, hide/restore and parent-exit cleanup without an extra app, compiler or login item.
- Hide unavailable 5-hour quota blocks in Ubuntu, Windows and macOS system menus; restore them when data becomes available.
- Add macOS native IPC/menu tests, fragmented Unicode input coverage, lifecycle checks and clean Codex loader CI on both architectures.

# 0.4.0

- Bundle the desktop ring inside the plugin and start it with the local MCP service; no separate companion install command.
- Add Windows 10+ native tray rendering, click menus, hover summary, bilingual guidance and dynamic ring updates.
- Share a single ring across chats; recover ownership, preserve hide/language preferences and clean up on service exit.
- Add in-panel show/hide controls and a graphical Ubuntu dependency setup action.
- Add Linux isolation and native Windows CI checks, including the actual Codex plugin loader.
- Repair the inherited dependency lock file for reproducible fresh builds.

# Changelog

## 0.3.2

- Six pacing bands from red below 25% to cyan from 150%.
- Suggestions for model capability, reasoning effort and speed, using the tighter available quota window.
- Low-reserve, stale-data and reset safeguards.
- English and Simplified Chinese, manual selectors, locale detection and English fallback.
- Ubuntu installation, update and uninstall scripts, bundled MCP runtime and bilingual documentation.
- Isolated installation, MCP contract, UI and indicator tests.

Supported release target is Ubuntu GNOME. Windows and macOS companions are not included.
