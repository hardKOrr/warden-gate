// src/transports/stdio.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BwSessionPool } from '../bw/bwPool.js';
import { readBwEnv } from '../bw/bwSession.js';
import { loadToolsConfig, resolveToolsConfigPath } from '../config/toolsConfig.js';
import { KeychainSdk } from '../sdk/keychainSdk.js';
import { registerScopedTools } from '../tools/registerScopedTools.js';
import { SERVER_VERSION } from '../version.js';

export async function runStdioTransport(): Promise<void> {
  const APP_NAME = process.env.MCP_APP_NAME ?? 'warden-gate-mcp';

  // Credentials must be present at startup for stdio mode.
  const bwEnv = readBwEnv();
  const config = loadToolsConfig(resolveToolsConfigPath());

  const pool = new BwSessionPool({
    rootDir:
      process.env.KEYCHAIN_BW_HOME_ROOT ??
      `${process.env.HOME ?? '/data'}/bw-profiles`,
  });

  const bw = await pool.getOrCreate(bwEnv);

  const server = new McpServer({ name: APP_NAME, version: SERVER_VERSION });

  registerScopedTools(server, {
    config,
    getSdk: async () => {
      return new KeychainSdk(bw);
    },
  });

  const transport = new StdioServerTransport();

  // Assign onclose BEFORE connect() to avoid a race where stdin is already
  // EOF when the process starts (connect() calls transport.start() internally).
  const closed = new Promise<void>((resolve) => {
    transport.onclose = resolve;
  });
  await server.connect(transport);

  await closed;
}
