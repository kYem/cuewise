import {
  type CSVParseResult,
  type CSVQuoteRow,
  parseQuotesCSV,
  validateCSVFile,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FolderPlus,
  Upload,
  X,
} from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';

interface CSVImportModalProps {
  onClose: () => void;
}

type CollectionMode = 'none' | 'new' | 'existing';

export const CSVImportModal: React.FC<CSVImportModalProps> = ({ onClose }) => {
  const { collections, createCollection, bulkAddQuotes } = useQuoteStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Collection state
  const [collectionMode, setCollectionMode] = useState<CollectionMode>('none');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    setFileError(null);
    setParseResult(null);
    setImportComplete(false);

    // Validate file
    const validationError = validateCSVFile(file);
    if (validationError) {
      setFileError(validationError.message);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Read and parse file
    try {
      const text = await file.text();
      const result = parseQuotesCSV(text);
      setParseResult(result);

      // If a source is common among quotes, suggest it as collection name
      if (result.valid.length > 0) {
        const sources = result.valid
          .map((q) => q.source)
          .filter((s): s is string => !!s && s.trim() !== '');
        if (sources.length > 0) {
          // Find most common source
          const sourceCounts = sources.reduce(
            (acc, s) => {
              acc[s] = (acc[s] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );
          const mostCommon = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
          if (mostCommon && mostCommon[1] >= result.valid.length / 2) {
            setNewCollectionName(mostCommon[0]);
          }
        }
      }
    } catch {
      setFileError('Failed to read file');
    }
  };

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Clear file selection
  const handleClearFile = () => {
    setSelectedFile(null);
    setParseResult(null);
    setFileError(null);
    setImportComplete(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle import
  const handleImport = async () => {
    if (!parseResult || parseResult.valid.length === 0) {
      return;
    }

    setIsImporting(true);

    try {
      let collectionId: string | undefined;

      // Create new collection if needed
      if (collectionMode === 'new' && newCollectionName.trim()) {
        const success = await createCollection(newCollectionName.trim());
        if (success) {
          // Get the newly created collection ID
          const newCollection = useQuoteStore
            .getState()
            .collections.find((c) => c.name === newCollectionName.trim());
          collectionId = newCollection?.id;
        }
      } else if (collectionMode === 'existing' && selectedCollectionId) {
        collectionId = selectedCollectionId;
      }

      // Import quotes
      const result = await bulkAddQuotes(parseResult.valid, collectionId);

      if (result.success) {
        setImportedCount(result.imported);
        setImportComplete(true);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Render quote preview
  const renderQuotePreview = (quotes: CSVQuoteRow[]) => {
    const previewQuotes = quotes.slice(0, 5);
    const hasMore = quotes.length > 5;

    return (
      <div className="space-y-2">
        {previewQuotes.map((quote, index) => (
          <div key={index} className="p-3 bg-surface-variant rounded-lg border border-border">
            <p className="text-sm text-primary line-clamp-2">"{quote.text}"</p>
            <p className="text-xs text-secondary mt-1">
              — {quote.author}
              {quote.category && quote.category !== 'inspiration' && (
                <span className="ml-2 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded text-xs">
                  {quote.category}
                </span>
              )}
            </p>
          </div>
        ))}
        {hasMore && (
          <p className="text-xs text-secondary text-center py-2">
            + {quotes.length - 5} more quotes
          </p>
        )}
      </div>
    );
  };

  // Success state
  if (importComplete) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-xl font-semibold text-primary mb-2">Import Complete!</h3>
          <p className="text-secondary mb-6">
            Successfully imported {importedCount} quotes
            {collectionMode !== 'none' && ' to your collection'}.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-primary-600" />
            <div>
              <h3 className="text-lg font-semibold text-primary">Import Quotes from CSV</h3>
              <p className="text-sm text-secondary">
                Bulk import quotes from books, articles, or other sources
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-secondary hover:text-primary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* File Upload Area */}
          {!selectedFile ? (
            <button
              type="button"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                'hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/10',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                fileError ? 'border-red-400 bg-red-50/50' : 'border-border bg-transparent'
              )}
            >
              <Upload className="w-12 h-12 mx-auto text-tertiary mb-4" />
              <p className="text-primary font-medium mb-1">Drop your CSV file here</p>
              <p className="text-sm text-secondary">or click to browse</p>
              <p className="text-xs text-tertiary mt-3">
                Required columns: text, author. Optional: category, source, notes
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleInputChange}
                className="hidden"
              />
            </button>
          ) : (
            <div className="flex items-center justify-between p-3 bg-surface-variant rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-primary-600" />
                <span className="text-primary font-medium">{selectedFile.name}</span>
              </div>
              <button
                type="button"
                onClick={handleClearFile}
                className="p-1 text-secondary hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* File Error */}
          {fileError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{fileError}</span>
            </div>
          )}

          {/* Parse Results */}
          {parseResult && (
            <>
              {/* Summary */}
              <div className="flex items-center gap-4">
                {parseResult.valid.length > 0 && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">{parseResult.valid.length} valid quotes</span>
                  </div>
                )}
                {parseResult.errors.length > 0 && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">{parseResult.errors.length} errors</span>
                  </div>
                )}
              </div>

              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">Errors:</p>
                  <ul className="space-y-1">
                    {parseResult.errors.slice(0, 5).map((error, i) => (
                      <li key={i} className="text-sm text-red-600 dark:text-red-400">
                        Row {error.row}: {error.message}
                      </li>
                    ))}
                    {parseResult.errors.length > 5 && (
                      <li className="text-sm text-red-600 dark:text-red-400">
                        + {parseResult.errors.length - 5} more errors
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                    Warnings:
                  </p>
                  <ul className="space-y-1">
                    {parseResult.warnings.map((warning, i) => (
                      <li key={i} className="text-sm text-yellow-600 dark:text-yellow-400">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview */}
              {parseResult.valid.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-primary mb-2">Preview:</p>
                  {renderQuotePreview(parseResult.valid)}
                </div>
              )}

              {/* Collection Assignment */}
              {parseResult.valid.length > 0 && (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FolderPlus className="w-5 h-5 text-primary-600" />
                    <span className="font-medium text-primary">Add to Collection (Optional)</span>
                  </div>

                  <div className="space-y-3">
                    {/* No collection */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="collectionMode"
                        checked={collectionMode === 'none'}
                        onChange={() => setCollectionMode('none')}
                        className="text-primary-600"
                      />
                      <span className="text-sm text-primary">Don't add to collection</span>
                    </label>

                    {/* New collection */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="collectionMode"
                        checked={collectionMode === 'new'}
                        onChange={() => setCollectionMode('new')}
                        className="text-primary-600"
                      />
                      <span className="text-sm text-primary">Create new collection</span>
                    </label>
                    {collectionMode === 'new' && (
                      <input
                        type="text"
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        placeholder="Collection name (e.g., Stoic Wisdom)"
                        className="w-full ml-6 px-3 py-2 rounded-lg border border-border bg-surface text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none"
                      />
                    )}

                    {/* Existing collection */}
                    {collections.length > 0 && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="collectionMode"
                            checked={collectionMode === 'existing'}
                            onChange={() => setCollectionMode('existing')}
                            className="text-primary-600"
                          />
                          <span className="text-sm text-primary">Add to existing collection</span>
                        </label>
                        {collectionMode === 'existing' && (
                          <select
                            value={selectedCollectionId}
                            onChange={(e) => setSelectedCollectionId(e.target.value)}
                            className="w-full ml-6 px-3 py-2 rounded-lg border border-border bg-surface text-primary focus:border-primary-500 focus:outline-none"
                          >
                            <option value="">Select a collection...</option>
                            {collections.map((collection) => (
                              <option key={collection.id} value={collection.id}>
                                {collection.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-surface-variant/50">
          <span className="text-sm text-secondary">
            {parseResult?.valid.length
              ? `${parseResult.valid.length} quotes ready to import`
              : 'Select a CSV file to continue'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-secondary hover:text-primary transition-colors"
              disabled={isImporting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                !parseResult ||
                parseResult.valid.length === 0 ||
                isImporting ||
                (collectionMode === 'new' && !newCollectionName.trim()) ||
                (collectionMode === 'existing' && !selectedCollectionId)
              }
              className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? 'Importing...' : `Import ${parseResult?.valid.length ?? 0} Quotes`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
