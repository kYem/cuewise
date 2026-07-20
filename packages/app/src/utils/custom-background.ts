import { logger } from '@cuewise/shared';

/** Bounds the longest side, so a portrait photo is capped by height, not width. */
export const MAX_BACKGROUND_DIMENSION = 1920;

/** Refuse before reading: base64 inflates ~33%, and decoding a huge file can hang the tab. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const JPEG_QUALITY = 0.85;

/** Carries a message written for users; anything else is a bug and must not reach the UI. */
export class BackgroundImageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackgroundImageError';
  }
}

export interface ScaledDimensions {
  width: number;
  height: number;
}

/**
 * Fit an image inside a square bound, longest side first, preserving aspect ratio.
 * Images already inside the bound are left alone — upscaling only wastes bytes.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxDimension: number
): ScaledDimensions {
  // Floor before branching: a 0-dimension source (an SVG with no intrinsic size) would
  // otherwise pass straight through and produce an empty canvas.
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const longest = Math.max(safeWidth, safeHeight);
  if (longest <= maxDimension) {
    return { width: safeWidth, height: safeHeight };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new BackgroundImageError('That file could not be read as an image.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new BackgroundImageError('Could not read the image file.'));
    // Fires instead of onerror when the file goes away mid-read (unplugged drive, cloud
    // placeholder that never hydrates); without it the promise never settles.
    reader.onabort = () =>
      reject(new BackgroundImageError('Reading the image was interrupted. Please try again.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new BackgroundImageError("Cuewise can't read this format. Try a JPEG, PNG, or WebP."));
    img.src = dataUrl;
  });
}

/**
 * Turn a picked file into a downscaled JPEG data URL suitable for storage.
 * Re-encoding is the point: a modern phone photo is many megabytes, far past the
 * per-item storage quota, and nothing on screen needs that resolution.
 * Throws BackgroundImageError rather than ever returning an un-downscaled image.
 */
export async function fileToBackgroundDataUrl(
  file: File,
  maxDimension = MAX_BACKGROUND_DIMENSION
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new BackgroundImageError('That file is not an image.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new BackgroundImageError('That image is too big to process. Try one under 25 MB.');
  }

  const sourceDataUrl = await readAsDataUrl(file);
  const img = await loadImage(sourceDataUrl);
  const { width, height } = computeScaledDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxDimension
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    // Returning the original would store the multi-megabyte payload this function exists
    // to avoid, then fail the quota check and blame the user's file.
    logger.error('Canvas 2D context unavailable; cannot downscale background image', {
      width,
      height,
      fileSize: file.size,
      fileType: file.type,
    });
    throw new BackgroundImageError(
      'Your browser could not process this image right now. Reload the page and try again.'
    );
  }
  ctx.drawImage(img, 0, 0, width, height);

  const encoded = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  // toDataURL yields "data:," instead of throwing when encoding fails.
  if (!encoded.startsWith('data:image/')) {
    logger.error('Canvas produced no image data for the background', { width, height });
    throw new BackgroundImageError('That image could not be processed. Try a different one.');
  }
  return encoded;
}
