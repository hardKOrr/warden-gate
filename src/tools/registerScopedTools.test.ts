import assert from 'node:assert/strict';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolsConfig } from '../config/toolsConfig.js';
import type { KeychainSdk } from '../sdk/keychainSdk.js';
import type { MintHandler } from './mintHandlers/types.js';
import { registerScopedTools } from './registerScopedTools.js';

function fakeSdk(item: unknown): KeychainSdk {
  return {
    getItem: async () => item,
  } as unknown as KeychainSdk;
}

async function withConnectedServer(
  configure: (server: McpServer) => void,
  fn: (client: Client) => Promise<void>,
): Promise<void> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = new McpServer({
    name: 'registerScopedTools-test',
    version: '0.0.0',
  });
  configure(server);
  const client = new Client(
    { name: 'registerScopedTools-test-client', version: '0.0.0' },
    { capabilities: {} },
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('registers exactly the tool names declared in config, nothing else', async () => {
  const config: ToolsConfig = {
    tools: {
      get_rundeck_credential: {
        item: 'rundeck-service-account',
        mode: 'raw_field',
        field: 'password',
      },
    },
  };

  await withConnectedServer(
    (server) => {
      registerScopedTools(server, {
        config,
        getSdk: async () =>
          fakeSdk({ login: { password: 'super-secret-value' } }),
      });
    },
    async (client) => {
      const tools = await client.listTools();
      assert.deepEqual(
        tools.tools.map((t) => t.name),
        ['get_rundeck_credential'],
      );

      const res = await client.callTool({
        name: 'get_rundeck_credential',
        arguments: {},
      });
      assert.equal(res.isError, undefined);
      assert.equal(
        (res.structuredContent as { value: string }).value,
        'super-secret-value',
      );
    },
  );
});

test('raw_field tool errors clearly when the declared field is absent', async () => {
  const config: ToolsConfig = {
    tools: {
      get_rundeck_credential: {
        item: 'rundeck-service-account',
        mode: 'raw_field',
        field: 'password',
      },
    },
  };

  await withConnectedServer(
    (server) => {
      registerScopedTools(server, {
        config,
        getSdk: async () => fakeSdk({ login: {} }),
      });
    },
    async (client) => {
      const res = await client.callTool({
        name: 'get_rundeck_credential',
        arguments: {},
      });
      assert.equal(res.isError, true);
    },
  );
});

test('mint_* tool calls the registered handler and never sees the handler bypassed', async () => {
  const config: ToolsConfig = {
    tools: {
      get_example_token: {
        item: 'example-root-credential',
        mode: 'mint_example',
      },
    },
  };
  let receivedItemId: string | undefined;
  const stubHandler: MintHandler = async ({ itemId }) => {
    receivedItemId = itemId;
    return 'minted-short-lived-token';
  };

  await withConnectedServer(
    (server) => {
      registerScopedTools(server, {
        config,
        getSdk: async () => fakeSdk({}),
        mintHandlers: { mint_example: stubHandler },
      });
    },
    async (client) => {
      const res = await client.callTool({
        name: 'get_example_token',
        arguments: {},
      });
      assert.equal(res.isError, undefined);
      assert.equal(
        (res.structuredContent as { value: string }).value,
        'minted-short-lived-token',
      );
      assert.equal(receivedItemId, 'example-root-credential');
    },
  );
});

test('unknown mint mode fails instead of silently falling back to raw_field', async () => {
  const config: ToolsConfig = {
    tools: {
      get_unregistered: {
        item: 'some-item',
        mode: 'mint_not_registered',
      },
    },
  };

  await withConnectedServer(
    (server) => {
      registerScopedTools(server, {
        config,
        getSdk: async () => fakeSdk({}),
        mintHandlers: {},
      });
    },
    async (client) => {
      const res = await client.callTool({
        name: 'get_unregistered',
        arguments: {},
      });
      assert.equal(res.isError, true);
    },
  );
});
