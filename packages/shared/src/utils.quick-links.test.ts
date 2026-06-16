import { describe, expect, it } from 'vitest';
import type { QuickLink } from './types';
import { deriveQuickLinkTitle, normalizeQuickLinkUrl, quickLinkMonogram } from './utils';

describe('Quick Link Utilities', () => {
  describe('normalizeQuickLinkUrl', () => {
    it('prepends https:// when no protocol is given', () => {
      expect(normalizeQuickLinkUrl('example.com')).toBe('https://example.com/');
    });

    it('keeps an existing http/https protocol', () => {
      expect(normalizeQuickLinkUrl('http://foo.org')).toBe('http://foo.org/');
      expect(normalizeQuickLinkUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('trims surrounding whitespace', () => {
      expect(normalizeQuickLinkUrl('  github.com/kYem  ')).toBe('https://github.com/kYem');
    });

    it('returns null for empty input', () => {
      expect(normalizeQuickLinkUrl('')).toBe(null);
      expect(normalizeQuickLinkUrl('   ')).toBe(null);
    });

    it('rejects non-http(s) protocols', () => {
      expect(normalizeQuickLinkUrl('ftp://example.com')).toBe(null);
      expect(normalizeQuickLinkUrl('javascript:alert(1)')).toBe(null);
    });

    it('rejects hosts without a dot', () => {
      expect(normalizeQuickLinkUrl('localhost')).toBe(null);
      expect(normalizeQuickLinkUrl('not a url')).toBe(null);
    });
  });

  describe('deriveQuickLinkTitle', () => {
    it('returns the hostname without a leading www.', () => {
      expect(deriveQuickLinkTitle('https://www.github.com/kYem')).toBe('github.com');
      expect(deriveQuickLinkTitle('https://example.org/')).toBe('example.org');
    });
  });

  describe('quickLinkMonogram', () => {
    const buildLink = (overrides: Partial<QuickLink>): QuickLink => ({
      id: '1',
      title: 'GitHub',
      url: 'https://github.com',
      ...overrides,
    });

    it('uses the first letter of the title, uppercased', () => {
      expect(quickLinkMonogram(buildLink({ title: 'GitHub' }))).toBe('G');
    });

    it('falls back to the hostname when the title is blank', () => {
      expect(
        quickLinkMonogram(buildLink({ title: '   ', url: 'https://news.ycombinator.com' }))
      ).toBe('N');
    });
  });
});
