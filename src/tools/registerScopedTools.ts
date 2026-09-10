// src/tools/registerScopedTools.ts
//
// Registers exactly the tools declared in tools.yaml — nothing else. There is
// no generic "get any item" or "search vault" tool here; every registered
// tool is pre-scoped to one Vaultwarden item by config, not by caller input.

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolConfigEntry, ToolsConfig } from '../config/toolsConfig.js';
import type { KeychainSdk } from '../sdk/keychainSdk.js';
import { mintHandlers as defaultMintHandlers } from './mintHandlers/index.js';
import type { MintHandler } from './mintHandlers/types.js';

export interface RegisterScopedToolsDeps {
  getSdk: (authInfo?: AuthInfo) => Promise<KeychainSdk>;
  config: ToolsConfig;
  /** Overridable for tests; defaults to the real mint handler registry. */
  mintHandlers?: Record<string, MintHandler>;
}

const outputSchema = {
  value: z.string().nullable(),
};

function auditLog(
  tool: string,
  outcome: 'success' | 'failure',
  durationMs: number,
): void {
  // Deliberately no value/field/token content here — audit trail only.
  console.error(
    `[warden-gate] ${new Date().toISOString()} tool=${tool} outcome=${outcome} duration_ms=${durationMs}`,
  );
}

function extractField(item: unknown, field: string, toolName: string): string {
  if (!item || typeof item !== 'object') {
    throw new Error(`Vault item for "${toolName}" returned no data`);
  }
  const rec = item as Record<string, unknown>;
  const login =
    rec.login && typeof rec.login === 'object'
      ? (rec.login as Record<string, unknown>)
      : undefined;

  switch (field) {
    case 'password':
      if (typeof login?.password === 'string') return login.password;
      break;
    case 'username':
      if (typeof login?.username === 'string') return login.username;
      break;
    case 'notes':
      if (typeof rec.notes === 'string') return rec.notes;
      break;
    case 'uri': {
      const uris = Array.isArray(login?.uris) ? login.uris : [];
      const first =
        uris[0] && typeof uris[0] === 'object'
          ? (uris[0] as Record<string, unknown>)
          : undefined;
      if (typeof first?.uri === 'string') return first.uri;
      break;
    }
    default: {
      const fields = Array.isArray(rec.fields) ? rec.fields : [];
      const match = fields.find(
        (f) =>
          f &&
          typeof f === 'object' &&
          (f as Record<string, unknown>).name === field,
      ) as Record<string, unknown> | undefined;
      if (typeof match?.value === 'string') return match.value;
    }
  }

  throw new Error(
    `Field "${field}" not found on vault item for tool "${toolName}"`,
  );
}

export function registerScopedTools(
  server: McpServer,
  deps: RegisterScopedToolsDeps,
): void {
  const handlers = deps.mintHandlers ?? defaultMintHandlers;
  for (const [name, entry] of Object.entries(deps.config.tools)) {
    registerOne(server, name, entry, deps.getSdk, handlers);
  }
}

function registerOne(
  server: McpServer,
  name: string,
  entry: ToolConfigEntry,
  getSdk: RegisterScopedToolsDeps['getSdk'],
  handlers: Record<string, MintHandler>,
): void {
  const isMint = entry.mode !== 'raw_field';

  server.registerTool(
    name,
    {
      title: name,
      description: isMint
        ? `Mint a short-lived, scoped credential for one homelab target (mode: ${entry.mode}). The underlying vault item is fetched server-side and never returned.`
        : `Return the "${entry.field}" field of one pre-configured Vaultwarden item. No other vault item or field is reachable through this tool.`,
      annotations: { readOnlyHint: !isMint, destructiveHint: false },
      inputSchema: {},
      outputSchema,
    },
    async (_input, extra) => {
      const start = Date.now();
      try {
        const sdk = await getSdk(extra.authInfo);
        let value: string;

        if (entry.mode === 'raw_field') {
          const item = await sdk.getItem(entry.item, { reveal: true });
          value = extractField(item, entry.field ?? 'password', name);
        } else {
          const handler = handlers[entry.mode];
          if (!handler) {
            throw new Error(
              `No mint handler registered for mode "${entry.mode}"`,
            );
          }
          value = await handler({ sdk, itemId: entry.item });
        }

        auditLog(name, 'success', Date.now() - start);
        const structuredContent = { value };
        return {
          structuredContent,
          content: [{ type: 'text' as const, text: value }],
        };
      } catch (error) {
        auditLog(name, 'failure', Date.now() - start);
        const message =
          error instanceof Error ? error.message : 'unknown error';
        return {
          structuredContent: { value: null },
          content: [
            { type: 'text' as const, text: `${name} failed: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
