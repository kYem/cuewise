import { logger } from '@cuewise/shared';
import { clearCustomBackground, getCustomBackground, setCustomBackground } from '@cuewise/storage';
import type React from 'react';
import { useEffect, useState } from 'react';
import { fileToBackgroundDataUrl } from '../../utils/custom-background';

interface CustomBackgroundPickerProps {
  /** Fires with the new data URL, or null when the image is removed. */
  onChange: (dataUrl: string | null) => void;
}

const TOO_LARGE =
  'That image is too large to save. Try a smaller one, or a screenshot rather than the original photo.';

export const CustomBackgroundPicker: React.FC<CustomBackgroundPickerProps> = ({ onChange }) => {
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomBackground().then((stored) => {
      if (!cancelled) {
        setCurrent(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input so re-picking the same file fires change again.
    event.target.value = '';
    if (file === undefined) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const dataUrl = await fileToBackgroundDataUrl(file);
      const result = await setCustomBackground(dataUrl);
      if (!result.success) {
        setError(TOO_LARGE);
        return;
      }
      setCurrent(dataUrl);
      onChange(dataUrl);
    } catch (err) {
      logger.error('Could not use the chosen background image', err);
      setError(err instanceof Error ? err.message : 'That image could not be used.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    await clearCustomBackground();
    setCurrent(null);
    setError(null);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-3">
        <label className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white cursor-pointer hover:bg-primary-700 transition-colors">
          {isSaving ? 'Saving…' : 'Choose image'}
          <input
            type="file"
            accept="image/*"
            aria-label="Choose image"
            className="sr-only"
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
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface transition-colors"
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
