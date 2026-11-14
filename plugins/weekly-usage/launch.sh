#!/bin/sh
set -eu

for node_path in \
  "${CODEX_MCP_NODE_PATH:-}" \
  "${CODEX_ELECTRON_RESOURCES_PATH:-/usr/lib/chatgpt/resources}/cua_node/bin/node" \
  "${HOME:-}/.local/lib/nodejs/bin/node"
do
  if [ -x "$node_path" ]; then
    exec "$node_path" "$@"
  fi
done

exec node "$@"
