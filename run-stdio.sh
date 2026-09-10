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

set -a
# shellcheck source=/dev/null
. "$DIR/.env.local"
set +a

exec node "$DIR/bin/warden-mcp.js" --stdio
