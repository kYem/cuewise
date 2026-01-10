import { ALL_QUOTE_CATEGORIES } from './constants';
import type { CSVParseError, CSVParseResult, CSVQuoteRow, QuoteCategory } from './types';

/**
 * Maximum allowed characters for each field
 */
const FIELD_LIMITS = {
  text: 500,
  author: 100,
  source: 200,
  notes: 300,
} as const;

/**
 * Parse a CSV line respecting quoted fields
 * Handles commas inside quoted strings
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted string
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Normalize header name to lowercase with no extra spaces
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/['"]/g, '');
}

/**
 * Validate and normalize category value
 */
function validateCategory(value: string | undefined): QuoteCategory | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const normalized = value.toLowerCase().trim();
  if (ALL_QUOTE_CATEGORIES.includes(normalized as QuoteCategory)) {
    return normalized as QuoteCategory;
  }

  return undefined;
}

/**
 * Parse CSV text into quote rows with validation
 *
 * Expected columns:
 * - text (required): The quote text
 * - author (required): Quote author
 * - category (optional): One of the valid QuoteCategory values
 * - source (optional): Book, URL, or reference
 * - notes (optional): Personal notes
 *
 * @param csvText - Raw CSV text content
 * @returns Parsed result with valid rows, errors, and warnings
 */
export function parseQuotesCSV(csvText: string): CSVParseResult {
  const result: CSVParseResult = {
    valid: [],
    errors: [],
    warnings: [],
  };

  // Split into lines and filter empty ones and comment lines
  const lines = csvText
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

  if (lines.length === 0) {
    result.errors.push({ row: 0, message: 'CSV file is empty' });
    return result;
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(normalizeHeader);

  // Find column indices
  const textIndex = headers.indexOf('text');
  const authorIndex = headers.indexOf('author');
  const categoryIndex = headers.indexOf('category');
  const sourceIndex = headers.indexOf('source');
  const notesIndex = headers.indexOf('notes');

  // Validate required columns
  if (textIndex === -1) {
    result.errors.push({ row: 1, message: "Missing required column: 'text'" });
  }
  if (authorIndex === -1) {
    result.errors.push({ row: 1, message: "Missing required column: 'author'" });
  }

  if (textIndex === -1 || authorIndex === -1) {
    return result;
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const rowNumber = i + 1; // 1-indexed for user display

    // Skip empty lines
    if (line.trim() === '') {
      continue;
    }

    const values = parseCSVLine(line);
    const rowErrors: string[] = [];

    // Extract values
    const text = values[textIndex]?.trim() || '';
    const author = values[authorIndex]?.trim() || '';
    const categoryRaw = categoryIndex !== -1 ? values[categoryIndex] : undefined;
    const source = sourceIndex !== -1 ? values[sourceIndex]?.trim() : undefined;
    const notes = notesIndex !== -1 ? values[notesIndex]?.trim() : undefined;

    // Validate required fields
    if (!text) {
      rowErrors.push('Missing quote text');
    } else if (text.length > FIELD_LIMITS.text) {
      rowErrors.push(`Quote text exceeds ${FIELD_LIMITS.text} characters`);
    }

    if (!author) {
      rowErrors.push('Missing author');
    } else if (author.length > FIELD_LIMITS.author) {
      rowErrors.push(`Author exceeds ${FIELD_LIMITS.author} characters`);
    }

    // Validate optional fields
    if (source && source.length > FIELD_LIMITS.source) {
      rowErrors.push(`Source exceeds ${FIELD_LIMITS.source} characters`);
    }

    if (notes && notes.length > FIELD_LIMITS.notes) {
      rowErrors.push(`Notes exceeds ${FIELD_LIMITS.notes} characters`);
    }

    // Validate category
    const category = validateCategory(categoryRaw);
    if (categoryRaw && categoryRaw.trim() !== '' && !category) {
      result.warnings.push(
        `Row ${rowNumber}: Invalid category '${categoryRaw}', defaulting to 'inspiration'`
      );
    }

    // If errors, record and skip
    if (rowErrors.length > 0) {
      result.errors.push({
        row: rowNumber,
        message: rowErrors.join('; '),
      });
      continue;
    }

    // Add valid row
    const quoteRow: CSVQuoteRow = {
      text,
      author,
      category: category || 'inspiration',
      source: source || undefined,
      notes: notes || undefined,
    };

    result.valid.push(quoteRow);
  }

  return result;
}

/**
 * Generate a sample CSV template for quote import
 */
export function generateQuoteCSVTemplate(): string {
  const categoriesComment = `# Valid categories: ${ALL_QUOTE_CATEGORIES.join(', ')}`;
  const header = 'text,author,category,source,notes';
  const example1 =
    '"The only way to do great work is to love what you do.",Steve Jobs,inspiration,Stanford Commencement 2005,';
  const example2 =
    '"Stay hungry, stay foolish.",Steve Jobs,growth,Stanford Commencement 2005,My favorite quote';

  return [categoriesComment, header, example1, example2].join('\n');
}

/**
 * Validate a file for CSV import
 */
export function validateCSVFile(file: File): CSVParseError | null {
  const MAX_FILE_SIZE = 1024 * 1024; // 1MB

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { row: 0, message: 'Please select a CSV file' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { row: 0, message: 'File exceeds 1MB limit' };
  }

  return null;
}
