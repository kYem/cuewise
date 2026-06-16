import type { FocusImageCategory } from '@cuewise/shared';
import { ALL_FOCUS_IMAGE_CATEGORIES, FOCUS_IMAGE_CATEGORIES } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check } from 'lucide-react';
import type React from 'react';

/** Representative thumbnail + gradient fallback per focus-mode background category. */
const CATEGORY_THUMBS: Record<FocusImageCategory, { img?: string; fallback: string }> = {
  nature: {
    img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=60',
    fallback: 'linear-gradient(135deg, #5a7d6b, #2c4a3e)',
  },
  forest: {
    img: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=60',
    fallback: 'linear-gradient(135deg, #3e5d43, #1d3322)',
  },
  ocean: {
    img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=60',
    fallback: 'linear-gradient(135deg, #4a7d9d, #1d3d52)',
  },
  mountains: {
    img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=60',
    fallback: 'linear-gradient(135deg, #6b7a8e, #2e3a4a)',
  },
  minimal: { fallback: 'linear-gradient(135deg, #d8dbe2, #aab0bf)' },
  dark: { fallback: 'linear-gradient(135deg, #232636, #0b0d15)' },
};

interface ThumbPickerProps {
  value: FocusImageCategory;
  onChange: (value: FocusImageCategory) => void;
}

/** Visual grid for picking a focus-mode background category. */
export const ThumbPicker: React.FC<ThumbPickerProps> = ({ value, onChange }) => (
  <div className="grid grid-cols-6 gap-1.5">
    {ALL_FOCUS_IMAGE_CATEGORIES.map((category) => {
      const thumb = CATEGORY_THUMBS[category];
      const active = value === category;
      const background = thumb.img
        ? `url("${thumb.img}") center/cover, ${thumb.fallback}`
        : thumb.fallback;
      return (
        <button
          key={category}
          type="button"
          aria-pressed={active}
          aria-label={FOCUS_IMAGE_CATEGORIES[category]}
          onClick={() => onChange(category)}
          style={{ background }}
          className={cn(
            'relative h-14 overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.02]',
            active && 'border-transparent ring-2 ring-primary-600'
          )}
        >
          <span className="absolute bottom-1 left-0 right-0 text-center rounded-full bg-black/45 mx-1 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm truncate px-1">
            {FOCUS_IMAGE_CATEGORIES[category]}
          </span>
          {active && (
            <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-600">
              <Check className="h-2 w-2 text-white" />
            </span>
          )}
        </button>
      );
    })}
  </div>
);
