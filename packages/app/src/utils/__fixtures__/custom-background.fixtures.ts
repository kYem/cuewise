import { vi } from 'vitest';

/** Stands in for the browser's Image: jsdom never decodes, so tests drive onload/onerror. */
export class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = '';

  static nextSize: { width: number; height: number } = { width: 3000, height: 2000 };
  static shouldFail = false;

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      if (FakeImage.shouldFail) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = FakeImage.nextSize.width;
      this.naturalHeight = FakeImage.nextSize.height;
      this.onload?.();
    });
  }

  get src(): string {
    return this._src;
  }
}

export function stubImage(size = { width: 3000, height: 2000 }, shouldFail = false): void {
  FakeImage.nextSize = size;
  FakeImage.shouldFail = shouldFail;
  vi.stubGlobal('Image', FakeImage);
}

/** A canvas whose 2D context is available, encoding to the given data URL. */
export function stubCanvas(dataUrl: string): void {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') {
      return Object.create(HTMLElement.prototype);
    }
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toDataURL: () => dataUrl,
    } as unknown as HTMLCanvasElement;
  });
}

/** A canvas with no 2D context — what a GPU crash or fingerprint blocker produces. */
export function stubCanvasWithoutContext(): void {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') {
      return Object.create(HTMLElement.prototype);
    }
    return { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
  });
}

export function imageFile(): File {
  return new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
}
