import { describe, expect, it } from 'vitest';
import { ALL_FOCUS_IMAGE_CATEGORIES } from '../constants';
import { FOCUS_IMAGE_CATEGORY_IDS } from '../types';
import { dailyBackgroundSchema } from './entities';
import { settingsSchema } from './settings';

const categorySetting = settingsSchema.def.shape.focusModeImageCategory;

describe('background category', () => {
  it.each(FOCUS_IMAGE_CATEGORY_IDS)('keeps a stored %s setting', (category) => {
    expect(categorySetting.safeParse(category).success).toBe(true);
  });

  it('rejects an unknown theme', () => {
    expect(categorySetting.safeParse('ghibli').success).toBe(false);
  });

  it('parses a daily background from a new theme', () => {
    const daily = {
      url: 'https://images.unsplash.com/photo-1562932831-afcfe48b5786',
      category: 'classical',
      date: '2026-11-21',
    };
    expect(dailyBackgroundSchema.safeParse(daily).success).toBe(true);
  });

  it('lists every theme for the picker, in order', () => {
    expect(ALL_FOCUS_IMAGE_CATEGORIES).toEqual([...FOCUS_IMAGE_CATEGORY_IDS]);
  });
});
