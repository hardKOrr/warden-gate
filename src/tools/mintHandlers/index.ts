// src/tools/mintHandlers/index.ts
//
// Adding a new mint_<something> mode: write one file exporting a
// MintHandler, then register it here under the mode name used in
// tools.yaml.

import { mintProxmoxToken } from './proxmoxToken.js';
import type { MintHandler } from './types.js';

export const mintHandlers: Record<string, MintHandler> = {
  mint_proxmox_token: mintProxmoxToken,
};

export type { MintHandler, MintHandlerContext } from './types.js';
