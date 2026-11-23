import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeZip, text } from './__fixtures__/zip.fixtures';
import {
  demoFiles,
  downloadRelease,
  releaseAssetUrl,
  sha256Hex,
  verifySha256,
} from './demo-artifact.mts';

describe('releaseAssetUrl', () => {
  it('builds the release asset url', () => {
    expect(releaseAssetUrl('1.28.1')).toBe(
      'https://github.com/kYem/cuewise/releases/download/v1.28.1/cuewise-extension-1.28.1.zip'
    );
  });

  it('refuses a version that is not three numbers', () => {
    expect(() => releaseAssetUrl('1.28.1/../x')).toThrow(/version/i);
  });
});

describe('verifySha256', () => {
  it('accepts a matching hash and refuses a different one', () => {
    const bytes = text('demo');
    expect(() => verifySha256(bytes, sha256Hex(bytes))).not.toThrow();
    expect(() => verifySha256(bytes, '00'.repeat(32))).toThrow(/hash mismatch/i);
  });
});

describe('demoFiles', () => {
  it('keeps index.html as demo/index.html and assets as they are, and drops the rest', () => {
    const zip = makeZip([
      { name: 'index.html', data: text('<html></html>'), method: 8 },
      { name: 'assets/', data: new Uint8Array(), method: 0 },
      { name: 'assets/a.js', data: text('a'), method: 8 },
      { name: 'manifest.json', data: text('{}'), method: 8 },
      { name: 'icons/i.png', data: text('png'), method: 0 },
      { name: 'popup.html', data: text('<html></html>'), method: 8 },
    ]);
    expect([...demoFiles(zip).keys()].sort()).toEqual(['assets/a.js', 'demo/index.html']);
  });

  it('refuses a zip with no index.html', () => {
    expect(() => demoFiles(makeZip([{ name: 'assets/a.js', data: text('a'), method: 8 }]))).toThrow(
      /index\.html/
    );
  });
});

describe('downloadRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads the release asset for the version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(text('zip bytes')));
    vi.stubGlobal('fetch', fetchMock);
    const bytes = await downloadRelease('1.28.1');
    expect(new TextDecoder().decode(bytes)).toBe('zip bytes');
    expect(fetchMock).toHaveBeenCalledWith(releaseAssetUrl('1.28.1'));
  });

  it('refuses a failed download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 404, statusText: 'Not Found' }))
    );
    await expect(downloadRelease('1.28.1')).rejects.toThrow(/404/);
  });
});
