# Repository Guidelines

Credential-gate MCP server backed by Vaultwarden via the official Bitwarden
CLI (`bw`). Fork of icoretech/warden-mcp; exposes only the scoped tools
declared in `tools.yaml`, never a generic vault-fetch tool. Ships stdio-only
in this fork — see [README.md](README.md).

## Quick Reference

- `npm run dev`: watch-mode server
- `npm run lint`: Biome + `tsc --noEmit`
- `npm run test`: build + all tests
- `make up`: boot local Vaultwarden stack and MCP server
- `make test`: run compose-backed integration tests
- quick live MCP smoke: see `agent-instructions/testing.md`
- `make down`: stop the local stack

Endpoints: `http://localhost:3005/healthz`, `http://localhost:3005/sse`

## Detailed Instructions

- [Architecture & Layout](agent-instructions/architecture.md)
- [Compatibility & Releases](agent-instructions/compatibility.md)
- [TypeScript & Naming](agent-instructions/typescript.md)
- [Testing](agent-instructions/testing.md)
- [Security & Runtime](agent-instructions/security.md)
- [Git & PRs](agent-instructions/git-workflow.md)
