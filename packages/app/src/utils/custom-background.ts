import { logger } from '@cuewise/shared';

/** Covers common displays without bloating the storage quota a data URL has to fit inside. */
export const MAX_BACKGROUND_WIDTH = 1920;

const JPEG_QUALITY = 0.85;

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
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longest;
  return {
    // A very lopsided image would otherwise round to zero and draw nothing.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not an image we can display'));
    img.src = dataUrl;
  });
}

/**
 * Turn a picked file into a downscaled JPEG data URL suitable for storage.
 * Re-encoding is the point: a modern phone photo is many megabytes, far past the
 * per-item storage quota, and nothing on screen needs that resolution.
 */
export async function fileToBackgroundDataUrl(
  file: File,
  maxDimension = MAX_BACKGROUND_WIDTH
): Promise<string> {
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
    logger.warn('Canvas unavailable; storing the image at its original size');
    return sourceDataUrl;
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
