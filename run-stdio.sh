#!/usr/bin/env bash
# Launches warden-gate over stdio, sourcing this machine's local credentials
# for the server's own Vaultwarden automation account from .env.local
# (gitignored, mode 600, never committed — see README "Setting credentials").
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$DIR/.env.local" ]; then
    echo "warden-gate: missing $DIR/.env.local (BW_HOST/BW_CLIENTID/BW_CLIENTSECRET/BW_PASSWORD) — see README" >&2
    exit 1
fi

# MCP hosts spawn this script directly, not through an interactive login
# shell, so ~/.bashrc's nvm init never runs and plain `node` on PATH may
# resolve to an older system install. Requires Node ~22 (see .nvmrc /
# package.json engines); prefer nvm's copy when present, otherwise fall back
# to whatever `node` already resolves to (e.g. a machine with a system Node
# 22 and no nvm at all).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || true
fi

set -a
# shellcheck source=/dev/null
. "$DIR/.env.local"
set +a

# tools.yaml resolves relative to the server's cwd, not this script's own
# directory, when TOOLS_CONFIG_PATH is unset — and an MCP host is not
# guaranteed to cd here before spawning this script (Claude Code doesn't).
# Pin it explicitly so this works regardless of the caller's cwd.
export TOOLS_CONFIG_PATH="${TOOLS_CONFIG_PATH:-$DIR/tools.yaml}"

exec node "$DIR/bin/warden-mcp.js" --stdio
