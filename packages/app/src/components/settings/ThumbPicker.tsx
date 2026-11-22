import type { FocusImageCategory } from '@cuewise/shared';
import { ALL_FOCUS_IMAGE_CATEGORIES, FOCUS_IMAGE_CATEGORIES } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check } from 'lucide-react';
import type React from 'react';
import { hostedThumbUrl, isHostedCategory } from '../../utils/hosted-art';
import { unsplashImageUrl } from '../../utils/unsplash';

// Tiles are ~100×56 CSS px; 2× covers retina without downloading the 1920px wallpaper.
const THUMB_PARAMS = 'w=200&h=112&fit=crop&auto=format&q=60';

/** Unsplash photo id, or the slug for a hosted theme. */
function thumbUrl(category: FocusImageCategory, imageId: string): string {
  return isHostedCategory(category)
    ? hostedThumbUrl(category, imageId)
    : unsplashImageUrl(imageId, THUMB_PARAMS);
}

/** Representative thumbnail + gradient fallback per focus-mode background category. */
const CATEGORY_THUMBS: Record<FocusImageCategory, { imageId: string; fallback: string }> = {
  nature: {
    imageId: 'photo-1501854140801-50d01698950b',
    fallback: 'linear-gradient(135deg, #5a7d6b, #2c4a3e)',
  },
  forest: {
    imageId: 'photo-1761461922930-9afd5bf09593',
    fallback: 'linear-gradient(135deg, #3e5d43, #1d3322)',
  },
  ocean: {
    imageId: 'photo-1507525428034-b723cf961d3e',
    fallback: 'linear-gradient(135deg, #4a7d9d, #1d3d52)',
  },
  mountains: {
    imageId: 'photo-1464822759023-fed622ff2c3b',
    fallback: 'linear-gradient(135deg, #6b7a8e, #2e3a4a)',
  },
  minimal: {
    imageId: 'photo-1518972734183-c5b490a7c637',
    fallback: 'linear-gradient(135deg, #d8dbe2, #aab0bf)',
  },
  dark: {
    imageId: 'photo-1531366936337-7c912a4589a7',
    fallback: 'linear-gradient(135deg, #232636, #0b0d15)',
  },
  countryside: {
    imageId: 'photo-1686518110219-c51aa1a76a2a',
    fallback: 'linear-gradient(135deg, #8fb3d9, #5d8a4a)',
  },
  cars: {
    imageId: 'photo-1622319544231-ce84790b689a',
    fallback: 'linear-gradient(135deg, #c0703f, #2b2230)',
  },
  ai: {
    imageId: 'photo-1650943574955-ac02c65cfc71',
    fallback: 'linear-gradient(135deg, #1f6f78, #0d1b2a)',
  },
  classical: {
    imageId: 'photo-1758559616527-35f149122a12',
    fallback: 'linear-gradient(135deg, #c9b79c, #6b5d4a)',
  },
  anime: {
    imageId: 'rainy-blue-hour',
    fallback: 'linear-gradient(135deg, #3d5a99, #141a3a)',
  },
  japan: {
    imageId: 'photo-1493515322954-4fa727e97985',
    fallback: 'linear-gradient(135deg, #d9467a, #1b1035)',
  },
  space: {
    imageId: 'photo-1464802686167-b939a6910659',
    fallback: 'linear-gradient(135deg, #3b2a6b, #05060f)',
  },
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
      const background = `url("${thumbUrl(category, thumb.imageId)}") center/cover, ${thumb.fallback}`;
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
