import type {
  BulkImportResult,
  CSVQuoteRow,
  Quote,
  QuoteCategory,
  QuoteCollection,
} from '@cuewise/shared';

/** A write aimed at one entity: 'gone' is not a failure, and a retry cannot fix it. */
export type QuoteWriteOutcome = 'saved' | 'gone' | 'failed';

export interface QuoteStore {
  quotes: Quote[];
  currentQuote: Quote | null;
  isLoading: boolean;
  error: string | null;
  quoteHistory: string[]; // Array of quote IDs in viewing order
  historyIndex: number; // Current position in history (0 = most recent)
  enabledCategories: QuoteCategory[]; // Categories to show (persisted to settings)
  showCustomQuotes: boolean; // Show custom quotes in filter (persisted to settings)
  showFavoritesOnly: boolean; // Show only favorite quotes (persisted to settings)

  // Collections state
  collections: QuoteCollection[];
  activeCollectionIds: string[]; // Enabled collection filters (persisted to settings)

  // Actions
  initialize: () => Promise<void>;
  /** `userInitiated` warns when the card write is lost; unprompted ticks stay quiet. */
  refreshQuote: (options?: { userInitiated?: boolean }) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  toggleFavorite: (quoteId: string) => Promise<void>;
  hideQuote: (quoteId: string) => Promise<void>;
  unhideQuote: (quoteId: string) => Promise<void>;
  /** False when the write did not persist, so the form can keep what the user typed. */
  addCustomQuote: (
    text: string,
    author: string,
    category: QuoteCategory,
    source?: string,
    notes?: string
  ) => Promise<boolean>;
  /** 'gone' when a pull deleted it first, 'failed' when the write did not persist. */
  editQuote: (
    quoteId: string,
    updates: {
      text?: string;
      author?: string;
      category?: QuoteCategory;
      source?: string;
      notes?: string;
    }
  ) => Promise<QuoteWriteOutcome>;
  deleteQuote: (quoteId: string) => Promise<void>;
  incrementViewCount: (quoteId: string) => Promise<void>;
  setEnabledCategories: (categories: QuoteCategory[]) => Promise<void>;
  toggleCategory: (category: QuoteCategory) => Promise<void>;
  toggleCustomQuotes: () => Promise<void>;
  toggleFavoritesOnly: () => Promise<void>;

  // Bulk operations
  /** False when the write did not persist, so the caller can keep the user's selection. */
  bulkDelete: (quoteIds: string[]) => Promise<boolean>;
  bulkToggleFavorite: (quoteIds: string[], setFavorite: boolean) => Promise<boolean>;
  bulkToggleHidden: (quoteIds: string[], setHidden: boolean) => Promise<boolean>;

  // Restoration operations
  restoreMissingQuotes: () => Promise<{ restored: number }>;
  resetAllQuotes: () => Promise<void>;
  getMissingSeedQuoteCount: () => number;

  // Collection operations
  createCollection: (name: string, description?: string) => Promise<boolean>;
  /** 'gone' when a pull deleted it first — the store has already told the user, so do not retry. */
  updateCollection: (
    id: string,
    updates: Partial<Pick<QuoteCollection, 'name' | 'description'>>
  ) => Promise<QuoteWriteOutcome>;
  deleteCollection: (id: string) => Promise<boolean>;
  /** 'gone' when a pull deleted the quote first, 'failed' when the write did not persist. */
  addQuoteToCollection: (quoteId: string, collectionId: string) => Promise<QuoteWriteOutcome>;
  removeQuoteFromCollection: (quoteId: string, collectionId: string) => Promise<QuoteWriteOutcome>;
  addQuotesToCollection: (quoteIds: string[], collectionId: string) => Promise<boolean>;
  toggleCollection: (collectionId: string) => Promise<void>;
  setActiveCollectionIds: (collectionIds: string[]) => Promise<void>;
  getQuotesInCollection: (collectionId: string) => Quote[];

  // CSV Import
  bulkAddQuotes: (quoteRows: CSVQuoteRow[], collectionId?: string) => Promise<BulkImportResult>;
}
