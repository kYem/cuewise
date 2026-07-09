import {
  type ImportOptions,
  type ImportResult,
  type ImportValidation,
  logger,
} from '@cuewise/shared';
import { AlertCircle, AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';

interface ImportControlsProps {
  importValidation: ImportValidation | null;
  isImporting: boolean;
  onValidateFile: (file: File) => Promise<ImportValidation>;
  onExecuteImport: (options: ImportOptions) => Promise<ImportResult>;
  onClearValidation: () => void;
}

export const ImportControls: React.FC<ImportControlsProps> = ({
  importValidation,
  isImporting,
  onValidateFile,
  onExecuteImport,
  onClearValidation,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<ImportOptions>({
    importGoals: true,
    importQuotes: true,
    importPomodoroSessions: true,
    skipDuplicates: true,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file !== undefined) {
      try {
        // Store handles expected errors internally and sets validation state
        await onValidateFile(file);
      } catch (error) {
        // Unexpected errors that weren't caught by the store
        logger.error('Unexpected error during file validation', error);
      }
    }
  };

  const handleImport = async () => {
    try {
      const result = await onExecuteImport(options);
      // Only reset file input on successful import
      if (result.success === true && fileInputRef.current !== null) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      // Unexpected errors that weren't caught by the store
      logger.error('Unexpected error during import execution', error);
    }
  };

  const handleClear = () => {
    onClearValidation();
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  };

  const data = importValidation?.data;
  const hasData =
    data && (data.goals.length > 0 || data.quotes.length > 0 || data.pomodoroSessions.length > 0);

  return (
    <div className="bg-surface rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5 text-primary-600" />
        Import Data
      </h2>

      {/* File Selection */}
      <div className="mb-6">
        <label
          htmlFor="import-file"
          className="flex items-center gap-3 p-4 border-2 border-dashed border-border rounded-lg hover:border-primary-400 hover:bg-primary-600/10 transition-all cursor-pointer"
        >
          <FileUp className="w-6 h-6 text-primary-600" />
          <div className="flex-1">
            <div className="font-semibold text-primary">
              {importValidation ? 'Select a different file' : 'Select JSON file to import'}
            </div>
            <div className="text-xs text-secondary">Import from a previous Cuewise export</div>
          </div>
          <input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="sr-only"
          />
        </label>
      </div>

      {/* Validation Results */}
      {importValidation && (
        <div className="space-y-4">
          {/* Status Banner */}
          {importValidation.isValid ? (
            <div className="flex items-center gap-3 p-4 bg-green-600/10 border border-green-600/30 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <div className="font-semibold text-green-700 dark:text-green-400">
                  File validated successfully
                </div>
                {data && (
                  <div className="text-xs text-green-600 dark:text-green-500">
                    Version {data.version} (format v{data.formatVersion}) - Exported{' '}
                    {new Date(data.exportDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 bg-red-600/10 border border-red-600/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-700 dark:text-red-400">
                  Validation failed
                </div>
                <ul className="text-xs text-red-600 dark:text-red-500 mt-1 space-y-1">
                  {importValidation.errors.map((error, i) => (
                    <li key={`${error.field}-${i}`}>
                      {error.field}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Warnings */}
          {importValidation.warnings.length > 0 && (
            <div className="flex items-start gap-3 p-4 bg-yellow-600/10 border border-yellow-600/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-yellow-700 dark:text-yellow-400">Warnings</div>
                <ul className="text-xs text-yellow-600 dark:text-yellow-500 mt-1 space-y-1">
                  {importValidation.warnings.map((warning, i) => (
                    <li key={`warning-${i}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Data Preview */}
          {hasData && (
            <div className="p-4 bg-surface-variant rounded-lg">
              <div className="font-semibold text-primary mb-3">Data to import:</div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary-600">{data.goals.length}</div>
                  <div className="text-xs text-secondary">Goals</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary-600">{data.quotes.length}</div>
                  <div className="text-xs text-secondary">Quotes</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary-600">
                    {data.pomodoroSessions.length}
                  </div>
                  <div className="text-xs text-secondary">Sessions</div>
                </div>
              </div>
            </div>
          )}

          {/* Import Options */}
          {importValidation.isValid && hasData && (
            <div className="p-4 border border-border rounded-lg">
              <div className="font-semibold text-primary mb-3">Import options:</div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.importGoals}
                    onChange={(e) => setOptions({ ...options, importGoals: e.target.checked })}
                    disabled={data.goals.length === 0}
                    className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <span
                    className={`text-sm ${data.goals.length === 0 ? 'text-tertiary' : 'text-primary'}`}
                  >
                    Import goals ({data.goals.length})
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.importQuotes}
                    onChange={(e) => setOptions({ ...options, importQuotes: e.target.checked })}
                    disabled={data.quotes.length === 0}
                    className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <span
                    className={`text-sm ${data.quotes.length === 0 ? 'text-tertiary' : 'text-primary'}`}
                  >
                    Import custom quotes ({data.quotes.length})
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.importPomodoroSessions}
                    onChange={(e) =>
                      setOptions({ ...options, importPomodoroSessions: e.target.checked })
                    }
                    disabled={data.pomodoroSessions.length === 0}
                    className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <span
                    className={`text-sm ${data.pomodoroSessions.length === 0 ? 'text-tertiary' : 'text-primary'}`}
                  >
                    Import pomodoro sessions ({data.pomodoroSessions.length})
                  </span>
                </label>
                <div className="border-t border-divider pt-3 mt-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.skipDuplicates}
                      onChange={(e) => setOptions({ ...options, skipDuplicates: e.target.checked })}
                      className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-primary">Skip duplicates (recommended)</span>
                  </label>
                  <p className="text-xs text-secondary mt-1 ml-7">
                    Skip items with IDs that already exist in your data
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 py-3 px-4 border-2 border-border text-secondary font-medium rounded-lg hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
            {importValidation.isValid && hasData && (
              <button
                type="button"
                onClick={handleImport}
                disabled={
                  isImporting ||
                  (!options.importGoals && !options.importQuotes && !options.importPomodoroSessions)
                }
                className="flex-1 py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {isImporting ? 'Importing...' : 'Import Selected'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="mt-4 p-3 bg-primary-600/10 border border-border rounded-lg">
        <p className="text-xs text-primary">
          <span className="font-semibold">Tip:</span> Import data from previous exports to restore
          your goals, custom quotes, and pomodoro history when moving to a new device.
        </p>
      </div>
    </div>
  );
};
