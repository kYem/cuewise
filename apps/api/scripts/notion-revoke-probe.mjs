// Settles what revoking a Notion refresh token actually does, which the docs ("Revoke a token")
// do not say.
//
// DESTRUCTIVE — it revokes a real grant. Connect a throwaway Notion workspace first.
//
//   cd apps/api && node scripts/notion-revoke-probe.mjs --yes
//
// Reads NOTION_CLIENT_ID/NOTION_CLIENT_SECRET/PROVIDER_TOKEN_KEY from .dev.vars and the sealed
// grant from the local `wrangler dev` D1. Pass --access=<tok> --refresh=<tok> to skip both.
// Prints statuses and Notion's error codes only, never a token.
//
// ANSWERED 2026-09-25, on this integration: a refresh token is not a revoke target, and
// revocation is per grant. Re-run only to re-check Notion, not to learn it the first time.
//   step 2 → 200 for anything at all (garbage, a secret_-shaped fake, an empty string), so a 200
//            means "call accepted", never "token forgotten" (RFC 7009 §2.2); a non-2xx means our
//            credentials or an outage, never the token's type
//   step 3 → 200, and step 4 → 200: the refresh revoke did nothing to either token
// Revoking the ACCESS token is what works, and it takes the paired refresh token with it: measured
// separately on a fresh grant, access revoke → 200, access → 401, then a never-used refresh token
// → 400 invalid_grant. Test that order on a grant whose refresh token you have not spent, or
// rotation explains the invalid_grant for you.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTION_VERSION = '2026-03-11';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match !== null) {
      args[match[1]] = match[2] ?? true;
    }
  }
  return args;
}

function readDevVars() {
  const vars = {};
  for (const line of readFileSync(join(API_ROOT, '.dev.vars'), 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    vars[key] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
  return vars;
}

function base64UrlToBytes(value) {
  return new Uint8Array(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

async function openSecret({ ciphertext, iv }, rawKey) {
  const key = await crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(rawKey),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(ciphertext)
  );
  return new TextDecoder().decode(opened);
}

/** The sealed row `wrangler dev` wrote, read straight from miniflare's sqlite file. */
function readSealedGrant() {
  const require = createRequire(import.meta.url);
  let Database;
  try {
    ({ DatabaseSync: Database } = require('node:sqlite'));
  } catch {
    throw new Error('node:sqlite is unavailable; upgrade node, or pass --access= and --refresh=');
  }
  const stateDir = join(API_ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files = require('node:fs')
    .readdirSync(stateDir)
    .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
  for (const file of files) {
    const db = new Database(join(stateDir, file), { readOnly: true });
    try {
      const row = db
        .prepare(
          `SELECT ciphertext, iv, refresh_ciphertext, refresh_iv
             FROM provider_tokens WHERE provider = 'notion' LIMIT 1`
        )
        .get();
      if (row !== undefined) {
        return row;
      }
    } catch {
      // A database file without the table is one of the other bindings; try the next.
    } finally {
      db.close();
    }
  }
  throw new Error('no notion grant in the local D1; connect one through `wrangler dev` first');
}

function errorCodeOf(body) {
  if (body === null || typeof body !== 'object') {
    return 'unreadable body';
  }
  return body.error ?? body.code ?? 'no code';
}

async function call(label, path, { authorization, body }) {
  let response;
  try {
    response = await fetch(`https://api.notion.com/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: authorization,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    console.log(`${label}: request failed (${error.name})`);
    return null;
  }
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    // Left null: errorCodeOf reports it.
  }
  const code = response.ok && parsed !== null ? 'ok' : errorCodeOf(parsed);
  console.log(`${label}: ${response.status} ${code}`);
  return response.status;
}

const args = parseArgs(process.argv.slice(2));
if (args.yes !== true) {
  console.error(
    'This revokes a real Notion grant. Re-run with --yes once a throwaway is connected.'
  );
  process.exit(1);
}

const vars = readDevVars();
for (const name of ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET']) {
  if (!vars[name]) {
    console.error(`${name} is missing from .dev.vars`);
    process.exit(1);
  }
}

let accessToken = typeof args.access === 'string' ? args.access : null;
let refreshToken = typeof args.refresh === 'string' ? args.refresh : null;
if (accessToken === null || refreshToken === null) {
  if (!vars.PROVIDER_TOKEN_KEY) {
    console.error('PROVIDER_TOKEN_KEY is missing from .dev.vars');
    process.exit(1);
  }
  const row = readSealedGrant();
  if (row.refresh_ciphertext === null || row.refresh_iv === null) {
    console.error('the stored grant carries no refresh token, so there is nothing to probe');
    process.exit(1);
  }
  accessToken = await openSecret(
    { ciphertext: row.ciphertext, iv: row.iv },
    vars.PROVIDER_TOKEN_KEY
  );
  refreshToken = await openSecret(
    { ciphertext: row.refresh_ciphertext, iv: row.refresh_iv },
    vars.PROVIDER_TOKEN_KEY
  );
}

const basic = `Basic ${Buffer.from(`${vars.NOTION_CLIENT_ID}:${vars.NOTION_CLIENT_SECRET}`).toString('base64')}`;

await call('1 access token before        ', '/users/me', {
  authorization: `Bearer ${accessToken}`,
});
await call('2 revoke the refresh token   ', '/oauth/revoke', {
  authorization: basic,
  body: { token: refreshToken },
});
await call('3 access token after         ', '/users/me', {
  authorization: `Bearer ${accessToken}`,
});
await call('4 refresh with revoked token ', '/oauth/token', {
  authorization: basic,
  body: { grant_type: 'refresh_token', refresh_token: refreshToken },
});
