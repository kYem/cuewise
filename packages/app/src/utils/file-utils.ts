/** Maximum file size for import (10MB) */
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Read a file as text using the browser FileReader API.
 * This function is browser-specific and should not be used in platform-agnostic code.
 *
 * @param file - The File object to read
 * @returns Promise resolving to the file contents as a string
 * @throws Error if file exceeds 10MB, reading is aborted, or cannot be read
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      reject(
        new Error(
          `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 10MB.`
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => {
      const errorName = reader.error?.name || 'FileReadError';
      const errorMessage = reader.error?.message || 'Unknown error';
      reject(new Error(`Failed to read file: ${errorName} - ${errorMessage}`));
    };
    reader.onabort = () => {
      reject(new Error('File reading was aborted'));
    };
    reader.readAsText(file);
  });
}
