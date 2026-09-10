# Threat Model

> Fork of icoretech/warden-mcp's threat model, rewritten for the scoped-tool
> design. Last updated: 2026-09-09.

## 1. Overview

`warden-gate` is a Node/TypeScript MCP server that gives AI agents access to
a small, pre-declared set of credentials backed by Vaultwarden, through the
official Bitwarden CLI (`bw`). Unlike upstream `warden-mcp`, it does **not**
expose a generic vault-proxy tool surface (search/get-any-item/CRUD). At
startup it reads `tools.yaml` and registers exactly the tool names declared
there; each tool is pre-scoped to one Vaultwarden item by config, not by
caller input. There is no tool that takes an item id or search term as an
argument.

Transport: stdio only in this fork's documented/supported path. The upstream
Streamable HTTP transport (`src/transports/http.ts`) still compiles and is
wired to the same scoped tool registration, but is undocumented and dormant
— treat it as unreviewed for this threat model until it is deliberately
brought back into scope.

## 2. Trust Boundaries

### Process boundary

`warden-gate` invokes `bw` via `spawn` (`src/bw/bwCli.ts`, inherited from
upstream unchanged). The CLI performs all authentication, decryption, and
network I/O against Vaultwarden. `BW_BIN` is operator-controlled and
untrusted-input-free — same trust level as any other PATH binary.

### Agent boundary

Every registered tool call is fully pre-scoped by `tools.yaml`: there is no
tool parameter through which an agent can select a different Vaultwarden
item, field, or organization. Prompt injection against the agent can at most
cause it to *call* one of the declared tools — it cannot make the server
fetch anything not already declared in `tools.yaml`.

### Config boundary

`tools.yaml` is not secret (item ids and field names only) but it is
security-relevant: it is the entire allowlist of what this server can ever
return. Treat a change to `tools.yaml` with the same review weight as a code
change, since it is equivalent to widening what the agent can reach.

### File system boundary

Unchanged from upstream: `bw` state is isolated per credential set under
`KEYCHAIN_BW_HOME_ROOT` (SHA-256-hashed profile directories).

## 3. Attacker-Controlled Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Tool call itself (which of the declared tools to call) | MCP JSON-RPC | Tool names are a fixed enum from `tools.yaml`; no free-form item/field selection |
| stdio input | Local MCP host | Trusted operator process, but may be influenced by prompt injection against the agent |

Compared to upstream, this removes the largest attacker-controlled input
surface entirely (item ids, search terms, field names, organization ids,
attachment payloads) because none of those are tool parameters anymore.

## 4. Operator-Controlled Inputs

| Input | Purpose |
|-------|---------|
| `BW_HOST`, `BW_PASSWORD`, `BW_CLIENTID`/`BW_CLIENTSECRET` or `BW_USER` | Credentials for this server's dedicated Vaultwarden automation account |
| `BW_BIN` | Path to `bw` binary (same trust as PATH) |
| `TOOLS_CONFIG_PATH` | Location of `tools.yaml` — the tool allowlist |
| `PROXMOX_TLS_INSECURE` | Skip TLS verification in `mint_proxmox_token` for a self-signed cert; keep `false` unless the target is known self-signed |

## 5. Security Controls

| Control | File | Description |
|---------|------|--------------|
| Config-driven allowlist | `src/config/toolsConfig.ts`, `tools.yaml` | Only tools declared here are ever registered; the schema rejects malformed entries |
| Scoped tool registration | `src/tools/registerScopedTools.ts` | Each tool is bound to one item id and one field/mint mode at registration time, not at call time |
| Mint handlers never return root credentials | `src/tools/mintHandlers/*.ts` | Root credential is fetched internally via `sdk.getItem(..., {reveal: true})` and never included in the returned string |
| Audit logging without value leakage | `src/tools/registerScopedTools.ts` (`auditLog`) | Logs tool name, timestamp, outcome to stderr; never the resolved value |
| Per-credential isolation | `src/bw/bwPool.ts` (inherited) | Separate `bw` HOME directories keyed by SHA-256 hash of credentials |
| CLI mutex | `src/bw/mutex.ts`, `src/bw/bwSession.ts` (inherited) | Serializes concurrent CLI invocations per session |

## 6. Attack Scenarios and Residual Risk

### Mitigated by the scoping redesign

| Scenario | Mitigation | Residual risk |
|----------|-------------|----------------|
| Agent enumerates or reads arbitrary vault items | No tool accepts an item id, search term, or field name as a parameter | None from this server; a compromised Vaultwarden automation account credential itself is still a single point of failure — see below |
| Prompt injection tricks the agent into revealing an unrelated secret | The agent can only invoke tools already declared in `tools.yaml`; there is nothing to trick it into calling that isn't already an intended exposure | An operator who declares an overly broad `raw_field` tool has effectively pre-authorized that exposure — review `tools.yaml` changes accordingly |

### Accepted / by design

| Scenario | Rationale |
|----------|-----------|
| No built-in authn/authz for stdio | stdio mode trusts the local process launch, same as any other MCP server Claude Code/Codex/an Ollama bridge starts directly |
| `raw_field` tools return the literal secret | Explicitly a last resort per `tools.yaml`'s own documentation; use `mint_*` wherever the target system supports it |
| HTTP transport dormant but present | Kept compiling deliberately (fork plan says "leave dormant, don't delete") rather than actively supported; do not deploy it without a fresh review of `src/transports/http.ts` and its bearer/header auth story |

### Residual / not yet reviewed

| Scenario | Current state | Recommendation |
|----------|----------------|-----------------|
| `mint_proxmox_token` TLS handling | `PROXMOX_TLS_INSECURE` disables cert verification when set; defaults to verifying | Keep `false` in any network-reachable deployment; only use for a known self-signed homelab cert reached over a trusted network |
| Compromise of this server's Vaultwarden automation account | Not mitigated by this server — it's the single point of failure for everything in `tools.yaml` | Scope that account's Vaultwarden collection membership tightly (only the items this server needs) and rotate it independently of any other automation account on the same Vaultwarden |

## 7. Out of Scope

- OAuth2/SSO — not implemented by design.
- Bitwarden CLI vulnerabilities — `bw` is a trusted dependency; upstream concern.
- The dormant HTTP transport's own threat model — needs its own pass before
  it is ever documented as supported.
