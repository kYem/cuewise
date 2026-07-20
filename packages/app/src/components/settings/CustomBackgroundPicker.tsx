import { logger, type StorageError } from '@cuewise/shared';
import type React from 'react';
import { useState } from 'react';
import { useBackgroundStore } from '../../stores/background-store';
import { BackgroundImageError, fileToBackgroundDataUrl } from '../../utils/custom-background';

const TOO_LARGE =
  'That image is too large to save. Try a smaller one, or a screenshot rather than the original photo.';
const SAVE_FAILED = 'Your image could not be saved. Reload the page and try again.';
const REMOVE_FAILED =
  'Your image could not be removed and is still saved on this device. Reload the page and try again.';

function isQuota(error: StorageError): boolean {
  return error.type === 'quota_exceeded' || error.type === 'per_item_quota_exceeded';
}

export const CustomBackgroundPicker: React.FC = () => {
  const current = useBackgroundStore((s) => s.customBackground);
  const saveCustomBackground = useBackgroundStore((s) => s.saveCustomBackground);
  const removeCustomBackground = useBackgroundStore((s) => s.removeCustomBackground);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input so re-picking the same file fires change again.
    event.target.value = '';
    if (file === undefined) {
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      const dataUrl = await fileToBackgroundDataUrl(file);
      const result = await saveCustomBackground(dataUrl);
      if (!result.success) {
        logger.error('Could not store the custom background', {
          error: result.error,
          fileSize: file.size,
          fileType: file.type,
          dataUrlLength: dataUrl.length,
        });
        setError(isQuota(result.error) ? TOO_LARGE : SAVE_FAILED);
      }
    } catch (err) {
      logger.error('Could not use the chosen background image', err);
      // Only our own errors carry text written for users; anything else is a bug.
      setError(err instanceof BackgroundImageError ? err.message : SAVE_FAILED);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setIsBusy(true);
    const result = await removeCustomBackground();
    if (!result.success) {
      logger.error('Could not remove the custom background', { error: result.error });
      setError(REMOVE_FAILED);
    }
    setIsBusy(false);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-3">
        <label
          className={`px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white transition-colors ${
            isBusy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-primary-700'
          }`}
        >
          {isBusy ? 'Saving…' : 'Choose image'}
          <input
            type="file"
            accept="image/*"
            aria-label="Choose image"
            className="sr-only"
            disabled={isBusy}
            onChange={handleFile}
          />
        </label>
        {current !== null && (
          <>
            <img
              src={current}
              alt="Your background"
              className="w-16 h-10 object-cover rounded border border-border"
            />
            <button
              type="button"
              onClick={handleRemove}
              disabled={isBusy}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Remove
            </button>
          </>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
};
