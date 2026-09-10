# Security & Runtime

## Overview

Use this file for secrets handling, runtime safety, and request-contract work.

## Rules

- Tools must not accept connection credentials as normal tool arguments
- The full set of exposed tools comes from `tools.yaml` only — never
  hand-register another tool that bypasses that config
- `mint_*` handlers fetch a root credential from Vaultwarden internally and
  must never include it in their returned value
- Audit-log tool name, timestamp, and outcome; never log a resolved
  field/token value
- Do not log secrets
- Keep `KEYCHAIN_DEBUG_HTTP=false` unless debugging transport issues

## Runtime Notes

- Treat `X-BW-Host` as an HTTPS origin, not an arbitrary URL (still true for
  the dormant HTTP transport)
- Preserve the distinction between raw CLI state and operational readiness in
  agent-facing responses
