// Mints a Notion grant into the local `wrangler dev` D1, the way the extension will once the
// client lands. Needs `wrangler dev` running and DEV_FAKE_AUTH=1 in .dev.vars.
//
//   node scripts/notion-connect-dev.mjs catch        # recommended: claims itself, no 60s race
//
// `catch` needs the listener's URI allowed, so run the server as:
//   npx wrangler dev --var ALLOWED_RETURN_URIS:"cuewise://auth,http://localhost:8788/done"
//
// The two-step form is still there for when you cannot add that var:
//   node scripts/notion-connect-dev.mjs start        # prints the authorize URL
//   node scripts/notion-connect-dev.mjs claim <code> # the code off the interstitial's deep link
//
// It is fiddly on purpose: the interstitial fires `cuewise://auth?code=...`, which no browser can
// follow unless the macOS app is installed, so the code has to come out of the page source inside
// the code's 60s TTL. `catch` swaps that deep link for an http listener and removes the race.
//
// Both keep the session token and PKCE verifier in .wrangler/ (gitignored).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = join(API_ROOT, '.wrangler/notion-connect-state.json');
const BASE = process.env.API_URL ?? 'http://localhost:8787';
const RETURN_URI = 'cuewise://auth';
const CATCH_PORT = 8788;
const CATCH_URI = `http://localhost:${CATCH_PORT}/done`;
// One fixed account, so repeated runs replace one grant instead of piling up dev users.
const DEV_CREDENTIAL = 'notion-verify';
const DEVICE_NAME = 'verify-box';

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function post(path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function devSession() {
  const { status, body } = await post('/v1/auth/token', {
    provider: 'dev',
    credential: DEV_CREDENTIAL,
    deviceName: DEVICE_NAME,
  });
  if (status !== 200 || typeof body?.token !== 'string') {
    throw new Error(`dev sign-in answered ${status} ${JSON.stringify(body)} — is DEV_FAKE_AUTH=1?`);
  }
  return body.token;
}

async function authorizeUrl(returnUri) {
  const token = await devSession();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  );
  const query = new URLSearchParams({ return_uri: returnUri, code_challenge: challenge });
  const response = await fetch(`${BASE}/v1/integrations/notion/start?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (response.status !== 200 || typeof body?.authorizeUrl !== 'string') {
    throw new Error(`/start answered ${response.status} ${JSON.stringify(body)}`);
  }
  writeFileSync(STATE_FILE, JSON.stringify({ token, verifier }), 'utf8');
  return body.authorizeUrl;
}

async function start() {
  console.log('Open this, choose a workspace, click Allow:\n');
  console.log(await authorizeUrl(RETURN_URI));
  console.log('\nThen: node scripts/notion-connect-dev.mjs claim <code>');
}

// The one-time code dies in 60s, so nothing here waits on a human for long.
const CATCH_TIMEOUT_MS = 120_000;

/** Listens on CATCH_URI so the redirect itself delivers the code, inside its 60s life. */
async function catchCode() {
  const url = await authorizeUrl(CATCH_URI);
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const target = new URL(req.url, CATCH_URI);
      const relayed = target.searchParams.get('code');
      const error = target.searchParams.get('error');
      // Anything else is a favicon, a probe, or the interstitial's second hop: answering it must
      // neither end the flow nor echo its query back, which would be a reflected-XSS sink.
      if (target.pathname !== '/done' || (relayed === null && error === null)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(error === null ? 'Claimed. Back to the terminal.' : 'Failed. See the terminal.');
      server.close();
      if (error === null) {
        resolve(relayed);
      } else {
        reject(new Error(`the callback relayed an error instead of a code: ${error}`));
      }
    });
    server.on('error', reject);
    server.listen(CATCH_PORT, () => {
      console.log(`Listening on ${CATCH_URI}. Open this, choose a workspace, click Allow:\n`);
      console.log(`${url}\n`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error('nothing arrived on the listener; the code has expired by now'));
    }, CATCH_TIMEOUT_MS).unref();
  });
  await claim(code);
}

async function claim(code) {
  if (!existsSync(STATE_FILE)) {
    throw new Error('no saved flow; run `start` first');
  }
  const { token, verifier } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  const { status, body } = await post(
    '/v1/integrations/notion/claim',
    { code, codeVerifier: verifier },
    token
  );
  if (status !== 200) {
    throw new Error(`/claim answered ${status} ${JSON.stringify(body)}`);
  }
  console.log(`Connected: ${body?.workspace ?? '(no workspace name)'}`);
  console.log('The grant is sealed in the local D1, ready for the routes to use.');
}

const [command, argument] = process.argv.slice(2);
if (command === 'catch') {
  await catchCode();
} else if (command === 'start') {
  await start();
} else if (command === 'claim' && typeof argument === 'string') {
  await claim(argument);
} else {
  console.error('usage: notion-connect-dev.mjs catch | start | claim <code>');
  process.exit(1);
}
