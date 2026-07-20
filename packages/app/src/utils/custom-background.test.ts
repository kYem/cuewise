import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  imageFile,
  stubCanvas,
  stubCanvasWithoutContext,
  stubImage,
} from './__fixtures__/custom-background.fixtures';
import {
  BackgroundImageError,
  computeScaledDimensions,
  fileToBackgroundDataUrl,
} from './custom-background';

describe('computeScaledDimensions', () => {
  it('leaves an image already within the limit untouched', () => {
    expect(computeScaledDimensions(1280, 720, 1920)).toEqual({ width: 1280, height: 720 });
  });

  it('scales a too-wide image down to the limit', () => {
    expect(computeScaledDimensions(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
  });

  it('preserves the aspect ratio when scaling', () => {
    const { width, height } = computeScaledDimensions(3000, 1000, 1500);
    expect(width / height).toBeCloseTo(3, 5);
  });

  it('rounds to whole pixels, since canvas cannot draw fractions', () => {
    const { width, height } = computeScaledDimensions(1000, 333, 500);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it('scales a portrait image by its longest side', () => {
    expect(computeScaledDimensions(1000, 4000, 2000)).toEqual({ width: 500, height: 2000 });
  });

  it('never collapses a very wide, short image to zero height', () => {
    const { height } = computeScaledDimensions(10000, 5, 1920);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('never yields a zero dimension for an image reporting no intrinsic size', () => {
    // An SVG without width/height reports naturalWidth 0; a 0-wide canvas encodes to "data:,".
    expect(computeScaledDimensions(0, 0, 1920)).toEqual({ width: 1, height: 1 });
  });

  it('floors a sub-pixel dimension that is already inside the bound', () => {
    expect(computeScaledDimensions(0.4, 800, 1920)).toEqual({ width: 1, height: 800 });
  });
});

describe('fileToBackgroundDataUrl guards', () => {
  function file(type: string, size = 10): File {
    const f = new File(['x'], 'pic', { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  }

  it('rejects a file that is definitely not an image', async () => {
    await expect(fileToBackgroundDataUrl(file('application/pdf'))).rejects.toThrow(
      BackgroundImageError
    );
  });

  it('rejects a file too large to process before reading it into memory', async () => {
    await expect(fileToBackgroundDataUrl(file('image/jpeg', 40 * 1024 * 1024))).rejects.toThrow(
      /under 25 MB/
    );
  });
});

describe('fileToBackgroundDataUrl conversion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-encodes an oversized photo to a bounded JPEG', async () => {
    stubImage({ width: 4000, height: 3000 });
    const canvas = stubCanvas('data:image/jpeg;base64,small');

    await expect(fileToBackgroundDataUrl(imageFile())).resolves.toBe(
      'data:image/jpeg;base64,small'
    );
    // Proves the scaling maths is actually wired to the canvas, not just unit-tested beside it.
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1440);
    expect(canvas.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1920, 1440);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('refuses an image reporting no intrinsic size instead of saving a smear', async () => {
    stubImage({ width: 0, height: 0 });
    stubCanvas('data:image/jpeg;base64,small');

    await expect(fileToBackgroundDataUrl(imageFile())).rejects.toThrow(/no fixed size/);
  });

  it('fails loudly when the canvas has no 2D context, rather than storing the original', async () => {
    stubImage();
    stubCanvasWithoutContext();

    await expect(fileToBackgroundDataUrl(imageFile())).rejects.toThrow(BackgroundImageError);
  });

  it('rejects when the canvas encodes nothing', async () => {
    stubImage();
    // toDataURL yields "data:," rather than throwing when encoding fails.
    stubCanvas('data:,');

    await expect(fileToBackgroundDataUrl(imageFile())).rejects.toThrow(/could not be processed/);
  });

  it('explains an undecodable file rather than leaking a decoder error', async () => {
    stubImage(undefined, true);

    await expect(fileToBackgroundDataUrl(imageFile())).rejects.toThrow(/JPEG, PNG, or WebP/);
  });
});
