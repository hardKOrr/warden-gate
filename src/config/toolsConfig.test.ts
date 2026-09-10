import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadToolsConfig } from './toolsConfig.js';

async function withTempConfig(
  contents: string,
  fn: (path: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'tools-config-'));
  const path = join(dir, 'tools.yaml');
  try {
    await writeFile(path, contents, 'utf8');
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('loadToolsConfig parses raw_field and mint entries', async () => {
  await withTempConfig(
    `# comment line
tools:
  get_rundeck_credential:
    item: rundeck-service-account
    mode: raw_field
    field: password

  get_proxmox_api_token:
    item: proxmox-automation-root
    mode: mint_proxmox_token
`,
    async (path) => {
      const config = loadToolsConfig(path);
      assert.deepEqual(config.tools.get_rundeck_credential, {
        item: 'rundeck-service-account',
        mode: 'raw_field',
        field: 'password',
      });
      assert.deepEqual(config.tools.get_proxmox_api_token, {
        item: 'proxmox-automation-root',
        mode: 'mint_proxmox_token',
      });
    },
  );
});

test('loadToolsConfig rejects a line with no colon', async () => {
  await withTempConfig(
    `tools:
  broken_tool
    item: x
`,
    async (path) => {
      assert.throws(() => loadToolsConfig(path), /Malformed tools\.yaml/);
    },
  );
});

test('loadToolsConfig rejects an entry missing required fields', async () => {
  await withTempConfig(
    `tools:
  incomplete_tool:
    item: only-an-item
`,
    async (path) => {
      assert.throws(() => loadToolsConfig(path));
    },
  );
});

test('loadToolsConfig strips quotes and inline comments', async () => {
  await withTempConfig(
    `tools:
  quoted_tool:
    item: "quoted-item-id" # trailing comment
    mode: 'raw_field'
    field: password
`,
    async (path) => {
      const config = loadToolsConfig(path);
      assert.deepEqual(config.tools.quoted_tool, {
        item: 'quoted-item-id',
        mode: 'raw_field',
        field: 'password',
      });
    },
  );
});
