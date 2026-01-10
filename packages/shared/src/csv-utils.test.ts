import { describe, expect, it } from 'vitest';
import { generateQuoteCSVTemplate, parseQuotesCSV, validateCSVFile } from './csv-utils';

describe('CSV Utilities', () => {
  describe('parseQuotesCSV', () => {
    describe('empty and invalid input', () => {
      it('should return error for empty CSV', () => {
        const result = parseQuotesCSV('');

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe('CSV file is empty');
      });

      it('should return error for whitespace-only CSV', () => {
        const result = parseQuotesCSV('   \n\n   ');

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe('CSV file is empty');
      });

      it('should return error when text column is missing', () => {
        const csv = 'author,category\nJohn Doe,inspiration';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toContainEqual({
          row: 1,
          message: "Missing required column: 'text'",
        });
      });

      it('should return error when author column is missing', () => {
        const csv = 'text,category\nHello world,inspiration';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toContainEqual({
          row: 1,
          message: "Missing required column: 'author'",
        });
      });

      it('should return both errors when text and author columns are missing', () => {
        const csv = 'category,source\ninspiration,Book';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContainEqual({
          row: 1,
          message: "Missing required column: 'text'",
        });
        expect(result.errors).toContainEqual({
          row: 1,
          message: "Missing required column: 'author'",
        });
      });
    });

    describe('valid CSV parsing', () => {
      it('should parse CSV with required columns only', () => {
        const csv = 'text,author\n"Be the change.",Gandhi';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
        expect(result.valid[0]).toEqual({
          text: 'Be the change.',
          author: 'Gandhi',
          category: 'inspiration',
          source: undefined,
          notes: undefined,
        });
      });

      it('should parse CSV with all columns', () => {
        const csv =
          'text,author,category,source,notes\n"Stay hungry.",Steve Jobs,growth,Stanford 2005,Great speech';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0]).toEqual({
          text: 'Stay hungry.',
          author: 'Steve Jobs',
          category: 'growth',
          source: 'Stanford 2005',
          notes: 'Great speech',
        });
      });

      it('should parse multiple rows', () => {
        const csv = `text,author
"Quote one",Author One
"Quote two",Author Two
"Quote three",Author Three`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(3);
        expect(result.valid[0].text).toBe('Quote one');
        expect(result.valid[1].text).toBe('Quote two');
        expect(result.valid[2].text).toBe('Quote three');
      });

      it('should handle columns in different order', () => {
        const csv = 'author,notes,text,category\nGandhi,My note,"Be the change.",mindfulness';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('Be the change.');
        expect(result.valid[0].author).toBe('Gandhi');
        expect(result.valid[0].category).toBe('mindfulness');
        expect(result.valid[0].notes).toBe('My note');
      });

      it('should handle case-insensitive headers', () => {
        const csv = 'TEXT,AUTHOR,Category\n"Hello",World,success';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('Hello');
        expect(result.valid[0].category).toBe('success');
      });

      it('should trim whitespace from values', () => {
        const csv = 'text,author\n  "  Trimmed quote  "  ,  Author Name  ';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('Trimmed quote');
        expect(result.valid[0].author).toBe('Author Name');
      });

      it('should skip empty rows', () => {
        const csv = `text,author
"Quote one",Author One

"Quote two",Author Two

`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(2);
      });

      it('should skip comment lines starting with #', () => {
        const csv = `# This is a comment
text,author
# Another comment
"Quote one",Author One
# Comment between rows
"Quote two",Author Two`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
        expect(result.valid[0].text).toBe('Quote one');
        expect(result.valid[1].text).toBe('Quote two');
      });
    });

    describe('quoted fields and special characters', () => {
      it('should handle commas inside quoted fields', () => {
        const csv = 'text,author\n"Hello, world!",John Doe';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('Hello, world!');
      });

      it('should handle escaped quotes inside fields', () => {
        const csv = 'text,author\n"He said ""Hello""",John Doe';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('He said "Hello"');
      });

      it('should handle multiple escaped quotes', () => {
        const csv = 'text,author\n"""Quoted"" text ""here""",Author';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('"Quoted" text "here"');
      });

      it('should handle Windows line endings (CRLF)', () => {
        const csv = 'text,author\r\n"Quote one",Author One\r\n"Quote two",Author Two';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(2);
        expect(result.valid[0].text).toBe('Quote one');
        expect(result.valid[1].text).toBe('Quote two');
      });

      it('should handle unquoted fields', () => {
        const csv = 'text,author\nSimple quote without quotes,Simple Author';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe('Simple quote without quotes');
      });
    });

    describe('category validation', () => {
      it('should accept all valid categories', () => {
        const categories = [
          'inspiration',
          'learning',
          'productivity',
          'mindfulness',
          'success',
          'creativity',
          'resilience',
          'leadership',
          'health',
          'growth',
        ];

        for (const category of categories) {
          const csv = `text,author,category\n"Quote",Author,${category}`;
          const result = parseQuotesCSV(csv);

          expect(result.valid).toHaveLength(1);
          expect(result.valid[0].category).toBe(category);
          expect(result.warnings).toHaveLength(0);
        }
      });

      it('should default to inspiration when category is empty', () => {
        const csv = 'text,author,category\n"Quote",Author,';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].category).toBe('inspiration');
        expect(result.warnings).toHaveLength(0);
      });

      it('should default to inspiration when category column is missing', () => {
        const csv = 'text,author\n"Quote",Author';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].category).toBe('inspiration');
      });

      it('should warn about invalid category and default to inspiration', () => {
        const csv = 'text,author,category\n"Quote",Author,invalid-category';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].category).toBe('inspiration');
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("Invalid category 'invalid-category'");
        expect(result.warnings[0]).toContain('Row 2');
      });

      it('should handle case-insensitive category matching', () => {
        const csv = 'text,author,category\n"Quote",Author,SUCCESS';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].category).toBe('success');
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('field validation', () => {
      it('should error when text is empty', () => {
        const csv = 'text,author\n,Author Name';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(2);
        expect(result.errors[0].message).toContain('Missing quote text');
      });

      it('should error when author is empty', () => {
        const csv = 'text,author\n"Valid quote",';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(2);
        expect(result.errors[0].message).toContain('Missing author');
      });

      it('should error when text exceeds 500 characters', () => {
        const longText = 'a'.repeat(501);
        const csv = `text,author\n"${longText}",Author`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Quote text exceeds 500 characters');
      });

      it('should accept text at exactly 500 characters', () => {
        const exactText = 'a'.repeat(500);
        const csv = `text,author\n"${exactText}",Author`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].text).toBe(exactText);
      });

      it('should error when author exceeds 100 characters', () => {
        const longAuthor = 'a'.repeat(101);
        const csv = `text,author\n"Quote",${longAuthor}`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Author exceeds 100 characters');
      });

      it('should error when source exceeds 200 characters', () => {
        const longSource = 'a'.repeat(201);
        const csv = `text,author,source\n"Quote",Author,${longSource}`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Source exceeds 200 characters');
      });

      it('should error when notes exceeds 300 characters', () => {
        const longNotes = 'a'.repeat(301);
        const csv = `text,author,notes\n"Quote",Author,${longNotes}`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Notes exceeds 300 characters');
      });

      it('should combine multiple errors for same row', () => {
        const csv = 'text,author\n,';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Missing quote text');
        expect(result.errors[0].message).toContain('Missing author');
      });
    });

    describe('mixed valid and invalid rows', () => {
      it('should parse valid rows and report errors for invalid ones', () => {
        const csv = `text,author
"Valid quote",Valid Author
,Missing Author Row
"Another valid",Another Author`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(3);
        expect(result.valid[0].text).toBe('Valid quote');
        expect(result.valid[1].text).toBe('Another valid');
      });

      it('should track correct row numbers after filtering empty lines', () => {
        // Empty lines are filtered before processing, so row numbers
        // are based on the filtered line count, not original positions
        const csv = `text,author

"Quote one",Author One

,Missing Text

"Quote two",Author Two`;
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        // Row 3 because: header=1, "Quote one"=2, ",Missing Text"=3
        expect(result.errors[0].row).toBe(3);
      });
    });

    describe('optional fields handling', () => {
      it('should set undefined for empty optional fields', () => {
        const csv = 'text,author,source,notes\n"Quote",Author,,';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].source).toBeUndefined();
        expect(result.valid[0].notes).toBeUndefined();
      });

      it('should preserve optional field values when provided', () => {
        const csv = 'text,author,source,notes\n"Quote",Author,Book Title,My thoughts';
        const result = parseQuotesCSV(csv);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].source).toBe('Book Title');
        expect(result.valid[0].notes).toBe('My thoughts');
      });
    });
  });

  describe('generateQuoteCSVTemplate', () => {
    it('should include comment with valid categories', () => {
      const template = generateQuoteCSVTemplate();
      const lines = template.split('\n');

      expect(lines[0]).toMatch(/^# Valid categories:/);
      expect(lines[0]).toContain('inspiration');
      expect(lines[0]).toContain('learning');
      expect(lines[0]).toContain('productivity');
      expect(lines[0]).toContain('mindfulness');
      expect(lines[0]).toContain('success');
      expect(lines[0]).toContain('creativity');
      expect(lines[0]).toContain('resilience');
      expect(lines[0]).toContain('leadership');
      expect(lines[0]).toContain('health');
      expect(lines[0]).toContain('growth');
    });

    it('should generate valid CSV with header row', () => {
      const template = generateQuoteCSVTemplate();
      const lines = template.split('\n');

      expect(lines[1]).toBe('text,author,category,source,notes');
    });

    it('should include example rows', () => {
      const template = generateQuoteCSVTemplate();
      const lines = template.split('\n');

      expect(lines).toHaveLength(4);
      expect(lines[2]).toContain('Steve Jobs');
      expect(lines[3]).toContain('Steve Jobs');
    });

    it('should be parseable by parseQuotesCSV', () => {
      const template = generateQuoteCSVTemplate();
      const result = parseQuotesCSV(template);

      expect(result.valid).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.valid[0].author).toBe('Steve Jobs');
      expect(result.valid[1].author).toBe('Steve Jobs');
    });
  });

  describe('validateCSVFile', () => {
    it('should return null for valid CSV file', () => {
      const file = new File(['content'], 'quotes.csv', { type: 'text/csv' });
      const result = validateCSVFile(file);

      expect(result).toBeNull();
    });

    it('should return error for non-CSV file', () => {
      const file = new File(['content'], 'quotes.txt', { type: 'text/plain' });
      const result = validateCSVFile(file);

      expect(result).not.toBeNull();
      expect(result?.message).toBe('Please select a CSV file');
    });

    it('should return error for JSON file', () => {
      const file = new File(['{}'], 'data.json', { type: 'application/json' });
      const result = validateCSVFile(file);

      expect(result).not.toBeNull();
      expect(result?.message).toBe('Please select a CSV file');
    });

    it('should accept uppercase .CSV extension', () => {
      const file = new File(['content'], 'QUOTES.CSV', { type: 'text/csv' });
      const result = validateCSVFile(file);

      expect(result).toBeNull();
    });

    it('should return error for file exceeding 1MB', () => {
      const largeContent = 'a'.repeat(1024 * 1024 + 1);
      const file = new File([largeContent], 'large.csv', { type: 'text/csv' });
      const result = validateCSVFile(file);

      expect(result).not.toBeNull();
      expect(result?.message).toBe('File exceeds 1MB limit');
    });

    it('should accept file at exactly 1MB', () => {
      const exactContent = 'a'.repeat(1024 * 1024);
      const file = new File([exactContent], 'exact.csv', { type: 'text/csv' });
      const result = validateCSVFile(file);

      expect(result).toBeNull();
    });
  });
});
