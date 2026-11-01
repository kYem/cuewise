import type { Quote, QuoteCategory } from './types';

/**
 * Get a random item from an array
 */
export function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Filter out hidden and get a random quote from a list
 * Excludes the current quote if provided to prevent consecutive duplicates
 * Optionally filters by enabled categories, custom quotes, favorites, and collections
 *
 * Filter logic uses OR - quote passes if it matches ANY enabled filter:
 * - Matches an enabled category, OR
 * - Is a custom quote (if showCustom enabled), OR
 * - Is a favorite (if showFavorites enabled), OR
 * - Is in an enabled collection (if collections are active)
 */
export function getRandomQuote(
  quotes: Quote[],
  currentQuoteId?: string,
  enabledCategories?: QuoteCategory[],
  showCustom = true,
  showFavorites = false,
  collectionIds?: string[]
): Quote | null {
  let visibleQuotes = quotes.filter((q) => !q.isHidden);

  // Check if any filters are enabled
  const hasCollectionFilter = collectionIds && collectionIds.length > 0;
  const hasCategoryFilter = enabledCategories !== undefined && enabledCategories.length > 0;
  const hasNoFiltersEnabled =
    !hasCategoryFilter && !showCustom && !showFavorites && !hasCollectionFilter;

  // If no filters are enabled at all, return null
  if (enabledCategories !== undefined && hasNoFiltersEnabled) {
    return null;
  }

  // Apply OR filter - quote passes if it matches ANY enabled criteria
  if (enabledCategories !== undefined || hasCollectionFilter) {
    visibleQuotes = visibleQuotes.filter((q) => {
      // Quote is in an enabled collection
      if (hasCollectionFilter && q.collectionIds?.some((id) => collectionIds.includes(id))) {
        return true;
      }
      // Favorite quotes pass if showFavorites is enabled
      if (q.isFavorite && showFavorites) {
        return true;
      }
      // Custom quotes pass if showCustom is enabled
      if (q.isCustom && showCustom) {
        return true;
      }
      // Non-custom quotes pass if their category is enabled
      if (!q.isCustom && enabledCategories && enabledCategories.includes(q.category)) {
        return true;
      }
      return false;
    });
  } else if (!showCustom && !showFavorites) {
    // If no filters active but showCustom and showFavorites are false, exclude custom quotes
    visibleQuotes = visibleQuotes.filter((q) => !q.isCustom);
  } else if (!showCustom) {
    // Exclude custom quotes but keep favorites if enabled
    visibleQuotes = visibleQuotes.filter((q) => !q.isCustom || (q.isFavorite && showFavorites));
  }

  if (visibleQuotes.length === 0) {
    return null;
  }

  // If only one visible quote, return it (no choice)
  if (visibleQuotes.length === 1) {
    return visibleQuotes[0];
  }

  // If current quote ID provided, exclude it from selection
  if (currentQuoteId) {
    const otherQuotes = visibleQuotes.filter((q) => q.id !== currentQuoteId);
    if (otherQuotes.length > 0) {
      return getRandomItem(otherQuotes);
    }
  }

  return getRandomItem(visibleQuotes);
}
