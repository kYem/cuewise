import { describe, expect, it, vi } from 'vitest';
import { makeZip, text } from './__fixtures__/zip.fixtures';
import {
  demoFiles,
  downloadRelease,
  releaseAssetUrl,
  sha256Hex,
  shouldFetch,
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
  const url = releaseAssetUrl('1.28.1');
  const download = (fetcher: ReturnType<typeof vi.fn>) =>
    downloadRelease('1.28.1', { fetcher, retryDelayMs: 0 });

  it('downloads the release asset for the version, bounded by a timeout', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(text('zip bytes')));
    const bytes = await download(fetcher);
    expect(new TextDecoder().decode(bytes)).toBe('zip bytes');
    expect(fetcher).toHaveBeenCalledWith(url, { signal: expect.any(AbortSignal) });
  });

  it('retries a thrown fetch', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(new Response(text('zip bytes')));
    expect(new TextDecoder().decode(await download(fetcher))).toBe('zip bytes');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('retries a 5xx status', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValue(new Response(text('zip bytes')));
    expect(new TextDecoder().decode(await download(fetcher))).toBe('zip bytes');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails at once on a 404', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 404, statusText: 'Not Found' }));
    await expect(download(fetcher)).rejects.toThrow(/404 Not Found.*releases\/download/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('names the url and keeps the last thrown error as the cause after three attempts', async () => {
    const last = new TypeError('fetch failed');
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('first'))
      .mockRejectedValueOnce(new TypeError('second'))
      .mockRejectedValueOnce(last);
    await expect(download(fetcher)).rejects.toMatchObject({
      message: expect.stringContaining(url),
      cause: last,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('keeps the status of the last 5xx after three attempts', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () => new Response('busy', { status: 502, statusText: 'Bad Gateway' })
      );
    await expect(download(fetcher)).rejects.toThrow(/502 Bad Gateway/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe('shouldFetch', () => {
  it('fetches when the build is not pages-only', () => {
    expect(shouldFetch(false, {})).toBe(true);
  });

  it('fetches a pages-only build on Cloudflare Pages', () => {
    expect(shouldFetch(true, { CF_PAGES: '1' })).toBe(true);
  });

  it('skips a pages-only build anywhere else', () => {
    expect(shouldFetch(true, {})).toBe(false);
    expect(shouldFetch(true, { CF_PAGES: '0' })).toBe(false);
  });
});
