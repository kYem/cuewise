#!/usr/bin/env -S node
/**
 * Chrome Web Store API refresh token generator
 *
 * Runs a local loopback OAuth flow on a FIXED port, so you register the redirect
 * URI on the OAuth client once and reuse it forever — no random-port
 * "redirect_uri_mismatch" (which is why `chrome-webstore-upload-keys` fails on a
 * Web-application client). Dependency-free (Node built-in TS type stripping).
 *
 * One-time setup (Web app OAuth clients only; Desktop clients accept loopback
 * automatically): Google Cloud Console → APIs & Services → Credentials → your
 * OAuth client → Authorized redirect URIs → add:
 *
 *   http://127.0.0.1:50700
 *
 * Usage:
 *   node scripts/chrome-oauth-token.mts          # reads .env.chrome, prints token
 *   node scripts/chrome-oauth-token.mts --set    # also sets the GH env secret
 *   PORT=9000 node scripts/chrome-oauth-token.mts # use a different fixed port
 *
 * Reads CHROME_CLIENT_ID and CHROME_CLIENT_SECRET from .env.chrome (repo root)
 * or the environment. `--set` pipes the token into
 * `gh secret set CHROME_REFRESH_TOKEN --env chrome-web-store`.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Auto-load .env.chrome from the repo root; fall back to the ambient environment.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(repoRoot, '.env.chrome'));
} catch {
  // No .env.chrome — rely on whatever CHROME_* vars are already exported.
}

const HOST = process.env.OAUTH_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 50700);
const REDIRECT_URI = `http://${HOST}:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface TokenResponse {
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

function buildAuthUrl(clientId: string): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  // prompt=consent forces a fresh refresh_token even if this app was authorized before.
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  return url.toString();
}

function openInBrowser(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(opener, [url], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

function waitForCode(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`OAuth error: ${error}. You can close this tab.`);
        server.close();
        reject(new Error(error));
        return;
      }
      if (!code) {
        res.writeHead(204); // ignore favicon and other stray requests
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Got it — close this tab and return to the terminal.</h2>');
      server.close();
      resolve(code);
    });
    server.on('error', reject);
    server.listen(PORT, HOST, () => {
      console.log(`Listening on ${REDIRECT_URI} — approve in the browser:\n`);
      console.log(authUrl);
      console.log('');
      openInBrowser(authUrl);
    });
  });
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  return (await response.json()) as TokenResponse;
}

function setGithubSecret(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const gh = spawn('gh', ['secret', 'set', 'CHROME_REFRESH_TOKEN', '--env', 'chrome-web-store'], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    gh.on('error', reject);
    gh.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`gh exited with code ${code}`));
      }
    });
    gh.stdin.end(token);
  });
}

async function main() {
  const clientId = process.env.CHROME_CLIENT_ID;
  const clientSecret = process.env.CHROME_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Error: Missing CHROME_CLIENT_ID or CHROME_CLIENT_SECRET (.env.chrome or env).');
    process.exit(1);
  }

  console.log(`Redirect URI (register this on the OAuth client once): ${REDIRECT_URI}\n`);

  const code = await waitForCode(buildAuthUrl(clientId));
  console.log('Exchanging authorization code for tokens...');
  const data = await exchangeCode(code, clientId, clientSecret);

  if (data.error) {
    throw new Error(`Token error: ${data.error} - ${data.error_description}`);
  }
  if (!data.refresh_token) {
    throw new Error(`No refresh_token in the response: ${JSON.stringify(data)}`);
  }

  if (process.argv.includes('--set')) {
    // Never print the token here — pipe it straight into the GH secret.
    console.log(
      '\nRefresh token obtained — setting CHROME_REFRESH_TOKEN (chrome-web-store env)...'
    );
    await setGithubSecret(data.refresh_token);
    console.log('Done.');
  } else {
    console.log('\nRefresh token:\n');
    console.log(data.refresh_token);
    console.log('\nSet it with:');
    console.log(
      '  gh secret set CHROME_REFRESH_TOKEN --env chrome-web-store --body "<token-above>"'
    );
    console.log('  (or re-run with --set to do it automatically)');
  }
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
