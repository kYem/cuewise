#!/usr/bin/env -S node
/**
 * Chrome Web Store release status
 *
 * Reports the published vs. last-uploaded extension version and compares both to
 * the version in package.json, so you can tell whether the latest release is live
 * or still in review. Dependency-free (Node built-in TS type stripping), same
 * credentials as publish:chrome.
 *
 * Usage:
 *   pnpm release:status   (with the 4 CHROME_* env vars already set)
 *   node --env-file=.env.chrome scripts/release-status.mts
 *
 * Required environment variables:
 *   CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CWS_API_BASE = 'https://www.googleapis.com';

interface TokenResponse {
  access_token: string;
  error?: string;
  error_description?: string;
}

interface ItemResource {
  kind: string;
  id: string;
  uploadState?: string;
  crxVersion?: string;
  itemError?: Array<{ error_code: string; error_detail: string }>;
}

async function getAccessToken(): Promise<string> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CHROME_CLIENT_ID as string,
      client_secret: process.env.CHROME_CLIENT_SECRET as string,
      refresh_token: process.env.CHROME_REFRESH_TOKEN as string,
      grant_type: 'refresh_token',
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (data.error) {
    throw new Error(`Token error: ${data.error} - ${data.error_description}`);
  }
  return data.access_token;
}

async function getItem(
  accessToken: string,
  projection: 'DRAFT' | 'PUBLISHED'
): Promise<ItemResource | null> {
  const id = process.env.CHROME_EXTENSION_ID as string;
  const response = await fetch(
    `${CWS_API_BASE}/chromewebstore/v1.1/items/${id}?projection=${projection}`,
    { headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-api-version': '2' } }
  );

  const text = await response.text();
  if (!response.ok) {
    // The CWS API frequently rejects projection=PUBLISHED with "append ?projection=DRAFT"
    // (no separately-queryable published resource for this item). Treat it as
    // "not reported" rather than fatal — DRAFT carries the version + uploadState.
    if (projection === 'PUBLISHED' && text.includes('projection=DRAFT')) {
      return null;
    }
    throw new Error(
      `items.get (${projection}): ${response.status} ${response.statusText} - ${text}`
    );
  }
  return JSON.parse(text) as ItemResource;
}

function localVersion(): string {
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'apps',
    'browser-extension',
    'package.json'
  );
  return (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }).version;
}

async function main() {
  const requiredEnvVars = [
    'CHROME_EXTENSION_ID',
    'CHROME_CLIENT_ID',
    'CHROME_CLIENT_SECRET',
    'CHROME_REFRESH_TOKEN',
  ];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Error: Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const ours = localVersion();
  console.log(`Extension ID:                ${process.env.CHROME_EXTENSION_ID}`);
  console.log(`Local version (package.json): ${ours}`);
  console.log('');

  const accessToken = await getAccessToken();
  const draft = await getItem(accessToken, 'DRAFT');
  const published = await getItem(accessToken, 'PUBLISHED'); // null when the API won't report it

  const uploaded = draft?.crxVersion ?? '(not reported)';
  const live = published?.crxVersion ?? '(not exposed by the API)';
  console.log(
    `Last uploaded (draft):        ${uploaded}  [uploadState: ${draft?.uploadState ?? 'unknown'}]`
  );
  console.log(`Published (live to users):    ${live}`);
  for (const e of draft?.itemError ?? []) {
    console.log(`  itemError ${e.error_code}: ${e.error_detail}`);
  }
  console.log('');

  if (published?.crxVersion === ours) {
    console.log(`✅ v${ours} is the published version — the latest release is live.`);
  } else if (uploaded === ours) {
    console.log(
      `✅ v${ours} is uploaded${draft?.uploadState ? ` (uploadState: ${draft.uploadState})` : ''}. ` +
        'Live/review status is not exposed by the API — confirm on the Chrome Web Store dashboard.'
    );
  } else {
    console.log(`⏳ v${ours} is not the latest uploaded version (store shows ${uploaded}).`);
  }
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
