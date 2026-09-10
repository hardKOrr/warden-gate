import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { BwSessionPool } from '../bw/bwPool.js';
import { KeychainSdk } from '../sdk/keychainSdk.js';
import { createKeychainApp } from '../transports/http.js';

// This suite covers the scoped-tool contract (tools.yaml -> exactly those MCP
// tool names, with the {value: string|null} output shape). It intentionally
// does not re-exercise the old generic vault-proxy surface (search/get-item/
// CRUD/orgs/attachments/Sends) — that surface no longer exists in this fork.
// The mint_* handler dispatch itself is unit-tested (with a mocked sdk) in
// registerScopedTools.test.ts; this file only covers raw_field end-to-end
// against a real Vaultwarden, since that's the path with real bw CLI/session
// behavior worth exercising live.

async function writeTempToolsConfig(entries: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'warden-gate-toolsconfig-'));
  const path = join(dir, 'tools.yaml');
  await writeFile(path, entries, 'utf8');
  return path;
}

async function ignoreCleanupError(operation: Promise<unknown>) {
  try {
    await operation;
  } catch {
    // best-effort cleanup only
  }
}

test('mcp e2e: registers exactly the configured scoped tools with the value output schema', async () => {
  const bwHomeRoot = await mkdtemp(join(tmpdir(), 'warden-gate-schema-'));
  const toolsConfigPath = await writeTempToolsConfig(
    'tools:\n  get_rundeck_credential:\n    item: rundeck-service-account\n    mode: raw_field\n    field: password\n',
  );
  const previousToolsConfigPath = process.env.TOOLS_CONFIG_PATH;
  process.env.TOOLS_CONFIG_PATH = toolsConfigPath;

  let app: ReturnType<typeof createKeychainApp>;
  try {
    app = createKeychainApp({ bwHomeRoot });
  } finally {
    if (previousToolsConfigPath === undefined) {
      delete process.env.TOOLS_CONFIG_PATH;
    } else {
      process.env.TOOLS_CONFIG_PATH = previousToolsConfigPath;
    }
  }

  const httpServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => httpServer.once('listening', resolve));

  const addr = httpServer.address();
  if (!addr || typeof addr === 'string') {
    await rm(bwHomeRoot, { recursive: true, force: true });
    httpServer.close();
    throw new Error('Unexpected server address');
  }

  const url = new URL(`http://127.0.0.1:${addr.port}/sse`);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client(
    { name: 'warden-gate-schema-test', version: '0.0.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const tools = await client.listTools();

    assert.equal(
      tools.tools.length,
      1,
      'only the tools declared in tools.yaml should be registered',
    );
    const tool = tools.tools.find((t) => t.name === 'get_rundeck_credential');
    assert.ok(tool, 'get_rundeck_credential should be registered');
    assert.ok(
      tool.outputSchema && typeof tool.outputSchema === 'object',
      'get_rundeck_credential should advertise an output schema',
    );
    assert.equal(tool.outputSchema.type, 'object');
    assert.ok(
      tool.outputSchema.properties &&
        typeof tool.outputSchema.properties === 'object' &&
        'value' in tool.outputSchema.properties,
      'output schema should expose a "value" property and nothing item-shaped',
    );
  } finally {
    await ignoreCleanupError(transport.terminateSession());
    await ignoreCleanupError(transport.close());
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await rm(bwHomeRoot, { recursive: true, force: true });
  }
});

test('mcp e2e: get_rundeck_credential returns the configured item field over /sse', {
  timeout: 180_000,
}, async (t) => {
  const bwHost = process.env.BW_HOST;
  const bwPassword = process.env.BW_PASSWORD;
  const bwUser = process.env.BW_USER ?? process.env.BW_USERNAME;
  const bwClientId = process.env.BW_CLIENTID;
  const bwClientSecret = process.env.BW_CLIENTSECRET;
  const hasUserPass = Boolean(bwUser);
  const hasApiKey = Boolean(bwClientId && bwClientSecret);
  if (!bwHost || !bwPassword || (!hasUserPass && !hasApiKey)) {
    t.skip(
      'Missing BW_HOST/BW_PASSWORD and either BW_USER/BW_USERNAME or BW_CLIENTID/BW_CLIENTSECRET',
    );
    return;
  }

  const bwHomeRoot = await mkdtemp(join(tmpdir(), 'warden-gate-e2e-'));
  const bwEnv = {
    host: bwHost,
    password: bwPassword,
    clientId: bwClientId,
    clientSecret: bwClientSecret,
    user: bwUser,
  };

  // Seed a real test item directly through the sdk, bypassing MCP — this
  // test's job is to prove the tool retrieves what's actually in the vault,
  // not to prove item creation (which the sdk's own unit tests cover).
  const seedPool = new BwSessionPool({ rootDir: bwHomeRoot });
  const seedBw = await seedPool.getOrCreate(bwEnv);
  const seedSdk = new KeychainSdk(seedBw);
  const testPassword = `warden-gate-e2e-${Date.now()}`;
  const created = (await seedSdk.createLogin({
    name: `warden-gate-e2e-${Date.now()}`,
    username: 'rundeck-automation',
    password: testPassword,
  })) as { id?: unknown };
  const itemId = typeof created.id === 'string' ? created.id : undefined;
  assert.ok(itemId, 'seed item should be created with an id');

  const toolsConfigPath = await writeTempToolsConfig(
    `tools:\n  get_rundeck_credential:\n    item: ${itemId}\n    mode: raw_field\n    field: password\n`,
  );
  const previousToolsConfigPath = process.env.TOOLS_CONFIG_PATH;
  process.env.TOOLS_CONFIG_PATH = toolsConfigPath;

  let app: ReturnType<typeof createKeychainApp>;
  try {
    app = createKeychainApp({ bwHomeRoot });
  } finally {
    if (previousToolsConfigPath === undefined) {
      delete process.env.TOOLS_CONFIG_PATH;
    } else {
      process.env.TOOLS_CONFIG_PATH = previousToolsConfigPath;
    }
  }

  const httpServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => httpServer.once('listening', resolve));
  const addr = httpServer.address();
  if (!addr || typeof addr === 'string') {
    await rm(bwHomeRoot, { recursive: true, force: true });
    httpServer.close();
    throw new Error('Unexpected server address');
  }

  const url = new URL(`http://127.0.0.1:${addr.port}/sse`);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        'X-BW-Host': bwHost,
        'X-BW-Password': bwPassword,
        ...(hasUserPass ? { 'X-BW-User': String(bwUser) } : {}),
        ...(hasApiKey
          ? {
              'X-BW-ClientId': String(bwClientId),
              'X-BW-ClientSecret': String(bwClientSecret),
            }
          : {}),
      },
    },
  });
  const client = new Client(
    { name: 'warden-gate-e2e', version: '0.0.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'get_rundeck_credential',
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    const structured = result.structuredContent as
      | { value?: unknown }
      | undefined;
    assert.equal(structured?.value, testPassword);
  } finally {
    await ignoreCleanupError(transport.terminateSession());
    await ignoreCleanupError(transport.close());
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await ignoreCleanupError(seedSdk.deleteItem({ id: itemId as string }));
    await rm(bwHomeRoot, { recursive: true, force: true });
  }
});
