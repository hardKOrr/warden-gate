// src/tools/mintHandlers/proxmoxToken.ts

import { request } from 'node:https';
import type { MintHandler } from './types.js';

interface ProxmoxTicketResponse {
  data?: { ticket?: string };
}

/**
 * Mints a short-lived Proxmox VE API ticket (Proxmox documents these as
 * valid for roughly 2 hours) from the root credential stored in Vaultwarden,
 * so the caller only ever receives the ticket, never the underlying
 * username/password.
 *
 * Assumptions about the vault item at `itemId` (adjust if your Proxmox
 * automation item is shaped differently):
 * - `login.username` / `login.password` are the Proxmox API user, e.g.
 *   "automation@pve".
 * - The item's first login URI is the Proxmox host, e.g.
 *   "https://pve.example.lan:8006".
 *
 * Talks to Proxmox's own `POST {host}/api2/json/access/ticket` endpoint
 * (form-encoded username+password, JSON response with `data.ticket` and
 * `data.CSRFPreventionToken`). Only `data.ticket` is returned here — good
 * enough for read-mostly API calls; a caller that also needs to mutate state
 * through the Proxmox API would need the CSRF token too, which this handler
 * deliberately does not expose since this tool's contract is "one string
 * back."
 *
 * Set PROXMOX_TLS_INSECURE=true to skip TLS verification for a self-signed
 * homelab certificate; defaults to verifying.
 */
export const mintProxmoxToken: MintHandler = async ({ sdk, itemId }) => {
  const item = (await sdk.getItem(itemId, { reveal: true })) as Record<
    string,
    unknown
  >;
  const login =
    item.login && typeof item.login === 'object'
      ? (item.login as Record<string, unknown>)
      : undefined;
  const username =
    typeof login?.username === 'string' ? login.username : undefined;
  const password =
    typeof login?.password === 'string' ? login.password : undefined;
  const uris = Array.isArray(login?.uris) ? login.uris : [];
  const firstUri =
    uris[0] && typeof uris[0] === 'object'
      ? (uris[0] as Record<string, unknown>)
      : undefined;
  const host = typeof firstUri?.uri === 'string' ? firstUri.uri : undefined;

  if (!username || !password || !host) {
    throw new Error(
      'mint_proxmox_token requires login.username, login.password, and a login URI (the Proxmox host) on the vault item',
    );
  }

  const url = new URL('/api2/json/access/ticket', host);
  const body = new URLSearchParams({ username, password }).toString();
  const insecure =
    (process.env.PROXMOX_TLS_INSECURE ?? 'false').toLowerCase() === 'true';

  const responseText = await new Promise<string>((resolve, reject) => {
    const req = request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 8006,
        path: url.pathname,
        rejectUnauthorized: !insecure,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(Buffer.concat(chunks).toString('utf8'));
          } else {
            reject(
              new Error(
                `Proxmox ticket request failed: HTTP ${res.statusCode}`,
              ),
            );
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const parsed = JSON.parse(responseText) as ProxmoxTicketResponse;
  const ticket = parsed.data?.ticket;
  if (!ticket) {
    throw new Error('Proxmox ticket response missing data.ticket');
  }
  return ticket;
};
