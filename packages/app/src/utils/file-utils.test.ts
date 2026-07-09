import { describe, expect, it } from 'vitest';
import { readFileAsText } from './file-utils';

describe('readFileAsText', () => {
  it('should read file content as text', async () => {
    const content = '{"test": true}';
    const file = new File([content], 'test.json', { type: 'application/json' });

    const result = await readFileAsText(file);

    expect(result).toBe(content);
  });

  it('should reject files larger than 10MB', async () => {
    // Create a file just over 10MB
    const largeContent = 'x'.repeat(10 * 1024 * 1024 + 1);
    const file = new File([largeContent], 'large.json', { type: 'application/json' });

    await expect(readFileAsText(file)).rejects.toThrow(/File too large/);
  });

  it('should accept files exactly at 10MB', async () => {
    // Create a file exactly at 10MB
    const content = 'x'.repeat(10 * 1024 * 1024);
    const file = new File([content], 'exact.json', { type: 'application/json' });

    const result = await readFileAsText(file);

    expect(result).toBe(content);
  });

  it('should include file size in error message', async () => {
    // Create a 15MB file
    const largeContent = 'x'.repeat(15 * 1024 * 1024);
    const file = new File([largeContent], 'large.json', { type: 'application/json' });

    await expect(readFileAsText(file)).rejects.toThrow('15MB');
  });

  it('should read empty files', async () => {
    const file = new File([''], 'empty.json', { type: 'application/json' });

    const result = await readFileAsText(file);

    expect(result).toBe('');
  });

  it('should read files with unicode content', async () => {
    const content = '{"message": "Hello 世界 🌍"}';
    const file = new File([content], 'unicode.json', { type: 'application/json' });

    const result = await readFileAsText(file);

    expect(result).toBe(content);
  });
});
