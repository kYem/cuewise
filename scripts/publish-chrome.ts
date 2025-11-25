#!/usr/bin/env npx tsx
/**
 * Chrome Web Store Publishing Script
 *
 * Usage:
 *   pnpm publish:chrome <zip-file-path>                              - Upload and publish
 *   pnpm publish:chrome --dry-run                                    - Test credentials only
 *   pnpm tsx --env-file .env.chrome scripts/publish-chrome.ts --dry-run  - With env file
 *
 * Required environment variables:
 *   CHROME_EXTENSION_ID    - Extension ID from Chrome Web Store
 *   CHROME_CLIENT_ID       - Google Cloud OAuth Client ID
 *   CHROME_CLIENT_SECRET   - Google Cloud OAuth Client Secret
 *   CHROME_REFRESH_TOKEN   - OAuth refresh token
 */

import fs from 'node:fs';
import path from 'node:path';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CWS_API_BASE = 'https://www.googleapis.com';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface UploadResponse {
  kind: string;
  id: string;
  uploadState: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS';
  itemError?: Array<{ error_code: string; error_detail: string }>;
}

interface PublishResponse {
  kind: string;
  status: string[];
  statusDetail?: string[];
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.CHROME_CLIENT_ID as string;
  const clientSecret = process.env.CHROME_CLIENT_SECRET as string;
  const refreshToken = process.env.CHROME_REFRESH_TOKEN as string;

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = (await response.json()) as TokenResponse;

  if (data.error) {
    throw new Error(`Token error: ${data.error} - ${data.error_description}`);
  }

  return data.access_token;
}

async function uploadExtension(zipPath: string, accessToken: string): Promise<void> {
  const extensionId = process.env.CHROME_EXTENSION_ID as string;
  const zipBuffer = fs.readFileSync(zipPath);

  console.log(
    `Uploading ${path.basename(zipPath)} (${(zipBuffer.length / 1024).toFixed(1)} KB)...`
  );

  const response = await fetch(`${CWS_API_BASE}/upload/chromewebstore/v1.1/items/${extensionId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
    },
    body: zipBuffer,
  });

  const data = (await response.json()) as UploadResponse;

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  if (data.uploadState !== 'SUCCESS') {
    const errors = data.itemError?.map((e) => `${e.error_code}: ${e.error_detail}`).join(', ');
    throw new Error(`Upload failed: ${data.uploadState} - ${errors || 'Unknown error'}`);
  }

  console.log('Upload successful!');
}

async function publishExtension(accessToken: string): Promise<void> {
  const extensionId = process.env.CHROME_EXTENSION_ID as string;

  console.log('Publishing extension...');

  const response = await fetch(`${CWS_API_BASE}/chromewebstore/v1.1/items/${extensionId}/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
      'Content-Length': '0',
    },
  });

  const data = (await response.json()) as PublishResponse;

  if (!response.ok) {
    throw new Error(`Publish failed: ${response.status} ${response.statusText}`);
  }

  const status = data.status[0];
  if (status !== 'OK' && status !== 'PENDING_REVIEW') {
    const details = data.statusDetail?.join(', ') || 'Unknown error';
    throw new Error(`Publish failed: ${status} - ${details}`);
  }

  console.log(`Publish status: ${status}`);
  console.log('Successfully submitted to Chrome Web Store!');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const zipPath = args.find((arg) => !arg.startsWith('--'));

  if (!dryRun && !zipPath) {
    console.error('Usage:');
    console.error('  pnpm publish:chrome <zip-file-path>   - Upload and publish');
    console.error('  pnpm publish:chrome --dry-run         - Test credentials only');
    console.error('');
    console.error('With env file:');
    console.error('  pnpm tsx --env-file .env.chrome scripts/publish-chrome.ts --dry-run');
    process.exit(1);
  }

  if (zipPath && !fs.existsSync(zipPath)) {
    console.error(`Error: File not found: ${zipPath}`);
    process.exit(1);
  }

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

  try {
    console.log('Extension ID:', process.env.CHROME_EXTENSION_ID);
    console.log('Client ID:', process.env.CHROME_CLIENT_ID);
    console.log('');
    console.log('Getting access token...');
    const accessToken = await getAccessToken();
    console.log('Access token obtained successfully!');

    if (dryRun) {
      console.log('\n[DRY RUN] Credentials are valid. No upload or publish performed.');
      return;
    }

    await uploadExtension(zipPath as string, accessToken);
    await publishExtension(accessToken);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
