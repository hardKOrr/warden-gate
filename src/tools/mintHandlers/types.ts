// src/tools/mintHandlers/types.ts

import type { KeychainSdk } from '../../sdk/keychainSdk.js';

export interface MintHandlerContext {
  /** Vault access, scoped to whatever the automation account can reach. */
  sdk: KeychainSdk;
  /** The Vaultwarden item id declared for this tool in tools.yaml. */
  itemId: string;
}

/**
 * Fetches a root credential from Vaultwarden internally and exchanges it for
 * a short-lived, scoped credential on the target system. The root credential
 * must never be part of the returned string.
 */
export type MintHandler = (ctx: MintHandlerContext) => Promise<string>;
