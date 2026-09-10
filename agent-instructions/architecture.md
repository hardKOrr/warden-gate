# Architecture & Layout

## Overview

Use this file when you need to locate behavior quickly or decide where new code
belongs.

## Project Structure

- `src/app.ts`: Express app and `/sse` transport/session handling
- `src/bw/`: `bw` CLI runner plus session/unlock management
- `src/sdk/`: high-level vault operations and redaction behavior
- `src/config/toolsConfig.ts`: loads and validates `tools.yaml`
- `src/tools/registerScopedTools.ts`: registers exactly the tools declared in
  `tools.yaml` — no generic vault-fetch surface
- `src/tools/mintHandlers/`: one file per `mint_*` mode; each exchanges a root
  credential for a short-lived/scoped one on a specific target system
- `src/integration/`: compose-backed integration and end-to-end tests
- `scripts/vaultwarden-bootstrap.mjs`: Playwright bootstrap for the local test
  account

## Placement Rules

- Put transport/session behavior in `src/app.ts` or `src/bw/`
- Put Bitwarden business behavior in `src/sdk/`
- Keep tool registration in `src/tools/registerScopedTools.ts`; add a new
  scoped tool via `tools.yaml` (plus a mint handler if it needs one), not by
  hand-registering another tool elsewhere
- Add integration coverage under `src/integration/` when behavior depends on a
  real Vaultwarden or `bw` runtime
