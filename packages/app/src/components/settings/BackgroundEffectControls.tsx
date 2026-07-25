import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { RotateCcw } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import {
  selectBackgroundBlur,
  selectBackgroundDim,
  useSettingsStore,
} from '../../stores/settings-store';
import { MAX_BACKGROUND_BLUR_PX, MAX_BACKGROUND_DIM } from '../../utils/background-filter';

const SLIDER_CLASS =
  'w-full h-2 bg-surface-variant rounded-full appearance-none cursor-pointer accent-accent';

interface EffectSliderProps {
  label: string;
  ariaLabel: string;
  max: number;
  value: number;
  displayValue: string;
  onPreview: (value: number) => void;
  onCommit: () => void;
}

function EffectSlider({
  label,
  ariaLabel,
  max,
  value,
  displayValue,
  onPreview,
  onCommit,
}: EffectSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-secondary">
        <span>{label}</span>
        <span>{displayValue}</span>
      </div>
      <input
        type="range"
        min="0"
        max={max}
        value={value}
        aria-label={ariaLabel}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onPreview(Number(e.target.value));
        }}
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        className={SLIDER_CLASS}
      />
    </div>
  );
}

/**
 * Dim/blur sliders for the background image. Dragging previews in memory only;
 * the value persists on gesture end (pointer/key release, blur), keeping storage
 * writes and cloud-sync pushes rare.
 */
export function BackgroundEffectControls() {
  const dim = useSettingsStore(selectBackgroundDim);
  const blur = useSettingsStore(selectBackgroundBlur);
  const settings = useSettingsStore((s) => s.settings);
  const previewSettings = useSettingsStore((s) => s.previewSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const clearPreview = useSettingsStore((s) => s.clearPreview);

  // A preview that never commits (Escape mid-drag unmounts the settings tree) must
  // not outlive the sliders — it would keep overriding the background unpersisted.
  useEffect(() => {
    return () => {
      clearPreview();
    };
  }, [clearPreview]);

  const isDefault =
    dim === DEFAULT_SETTINGS.backgroundDim && blur === DEFAULT_SETTINGS.backgroundBlur;

  const commit = () => {
    if (dim === settings.backgroundDim && blur === settings.backgroundBlur) {
      // Nothing to persist, but a round-trip drag may have left an overlay behind.
      clearPreview();
      return;
    }
    void updateSettings({ backgroundDim: dim, backgroundBlur: blur });
  };

  const reset = () => {
    void updateSettings({
      backgroundDim: DEFAULT_SETTINGS.backgroundDim,
      backgroundBlur: DEFAULT_SETTINGS.backgroundBlur,
    });
  };

  return (
    <div className="space-y-3">
      <EffectSlider
        label="Dim"
        ariaLabel="Dim background"
        max={MAX_BACKGROUND_DIM}
        value={dim}
        displayValue={`${dim}%`}
        onPreview={(value) => previewSettings({ backgroundDim: value })}
        onCommit={commit}
      />
      <EffectSlider
        label="Blur"
        ariaLabel="Blur background"
        max={MAX_BACKGROUND_BLUR_PX}
        value={blur}
        displayValue={`${blur}px`}
        onPreview={(value) => previewSettings({ backgroundBlur: value })}
        onCommit={commit}
      />
      {!isDefault && (
        <button
          type="button"
          aria-label="Reset background effects"
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      )}
    </div>
  );
}
