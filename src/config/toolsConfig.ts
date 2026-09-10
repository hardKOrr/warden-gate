// src/config/toolsConfig.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const toolEntrySchema = z.object({
  item: z.string().min(1),
  mode: z.string().min(1),
  field: z.string().min(1).optional(),
});

const toolsConfigSchema = z.object({
  tools: z.record(z.string(), toolEntrySchema),
});

export type ToolConfigEntry = z.infer<typeof toolEntrySchema>;
export type ToolsConfig = z.infer<typeof toolsConfigSchema>;

/**
 * Minimal YAML-subset parser for tools.yaml: 2-space-indented nested string
 * maps only. No lists, anchors, block scalars, or flow collections — only
 * `key:` (opens a nested map) and `key: value` (plain or quoted scalar,
 * trailing ` #comment` stripped). This is deliberately small rather than
 * pulling in a YAML dependency for one flat config shape; replace with a real
 * YAML library if tools.yaml ever needs more than this.
 */
function parseFlatYaml(text: string): unknown {
  const root: Record<string, unknown> = {};
  const stack: { indent: number; node: Record<string, unknown> }[] = [
    { indent: -1, node: root },
  ];

  const lines = text.split('\n');
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber].replace(/\r$/, '');
    const trimmedLine = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const sepIndex = trimmedLine.indexOf(':');
    if (sepIndex === -1) {
      throw new Error(
        `Malformed tools.yaml at line ${lineNumber + 1}: expected "key:" or "key: value", got: ${line}`,
      );
    }

    const key = trimmedLine.slice(0, sepIndex).trim();
    let rawValue = trimmedLine.slice(sepIndex + 1).trim();
    const commentIndex = rawValue.indexOf(' #');
    if (commentIndex !== -1) rawValue = rawValue.slice(0, commentIndex).trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].node;

    if (rawValue === '') {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = stripQuotes(rawValue);
    }
  }

  return root;
}

function stripQuotes(value: string): string {
  const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
  if ((isDoubleQuoted || isSingleQuoted) && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadToolsConfig(path: string): ToolsConfig {
  const text = readFileSync(path, 'utf8');
  const parsed = parseFlatYaml(text);
  return toolsConfigSchema.parse(parsed);
}

/**
 * Default tools.yaml location: repo root (process.cwd() when the server is
 * started normally), overridable with TOOLS_CONFIG_PATH for deployments that
 * keep the config elsewhere (e.g. the agent-contract-managed checkout path).
 */
export function resolveToolsConfigPath(): string {
  const override = process.env.TOOLS_CONFIG_PATH;
  if (override && override.trim() !== '') return override;
  return join(process.cwd(), 'tools.yaml');
}
