/**
 * Unit tests for validation utilities
 */

import {
  sanitizeString,
  validateStringLength,
  validateSearchPapers,
  validateSearchByAuthor,
  validateGetByDoi,
  validateGetByArxiv,
  validateVerifyCitation,
  validateGetBibTeX,
  validateGetBibTeXBatch,
} from '../validation.js';

describe('sanitizeString', () => {
  it('should remove angle brackets', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
  });

  it('should remove javascript: protocol', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  it('should remove event handlers', () => {
    expect(sanitizeString('text onclick=alert(1)')).toBe('text alert(1)');
  });

  it('should trim whitespace', () => {
    expect(sanitizeString('  hello world  ')).toBe('hello world');
  });

  it('should handle normal strings without modification', () => {
    expect(sanitizeString('This is a normal string')).toBe('This is a normal string');
  });
});

describe('validateStringLength', () => {
  it('should return null for valid length', () => {
    expect(validateStringLength('test', 'field', 1, 10)).toBeNull();
  });

  it('should return error for string too short', () => {
    const error = validateStringLength('', 'field', 1, 10);
    expect(error).not.toBeNull();
    expect(error?.field).toBe('field');
    expect(error?.message).toContain('at least 1');
  });

  it('should return error for string too long', () => {
    const error = validateStringLength('a'.repeat(501), 'field', 1, 500);
    expect(error).not.toBeNull();
    expect(error?.field).toBe('field');
    expect(error?.message).toContain('at most 500');
  });

  it('should use custom min and max lengths', () => {
    expect(validateStringLength('abc', 'field', 5, 10)).not.toBeNull();
    expect(validateStringLength('a'.repeat(15), 'field', 5, 10)).not.toBeNull();
    expect(validateStringLength('abcdef', 'field', 5, 10)).toBeNull();
  });
});

describe('validateSearchPapers', () => {
  it('should validate correct arguments', () => {
    const result = validateSearchPapers({
      query: 'machine learning',
      limit: 10,
      sources: ['semantic-scholar', 'crossref']
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing query', () => {
    const result = validateSearchPapers({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'query')).toBe(true);
  });

  it('should reject empty query', () => {
    const result = validateSearchPapers({ query: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'query')).toBe(true);
  });

  it('should reject query that is too long', () => {
    const result = validateSearchPapers({ query: 'a'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'query')).toBe(true);
  });

  it('should reject invalid limit', () => {
    const result = validateSearchPapers({ query: 'test', limit: 100 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'limit')).toBe(true);
  });

  it('should reject limit less than 1', () => {
    const result = validateSearchPapers({ query: 'test', limit: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'limit')).toBe(true);
  });

  it('should reject invalid sources', () => {
    const result = validateSearchPapers({
      query: 'test',
      sources: ['invalid-source']
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'sources')).toBe(true);
  });

  it('should reject non-array sources', () => {
    const result = validateSearchPapers({
      query: 'test',
      sources: 'not-an-array'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'sources')).toBe(true);
  });

  it('should accept optional limit and sources', () => {
    const result = validateSearchPapers({ query: 'test' });
    expect(result.valid).toBe(true);
  });
});

describe('validateSearchByAuthor', () => {
  it('should validate correct arguments', () => {
    const result = validateSearchByAuthor({
      author: 'John Doe',
      limit: 10
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing author', () => {
    const result = validateSearchByAuthor({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'author')).toBe(true);
  });

  it('should reject empty author', () => {
    const result = validateSearchByAuthor({ author: '   ' });
    expect(result.valid).toBe(false);
  });

  it('should accept optional limit', () => {
    const result = validateSearchByAuthor({ author: 'Jane Smith' });
    expect(result.valid).toBe(true);
  });
});

describe('validateGetByDoi', () => {
  it('should validate correct DOI', () => {
    const result = validateGetByDoi({ doi: '10.1145/1234567.1234568' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing DOI', () => {
    const result = validateGetByDoi({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'doi')).toBe(true);
  });

  it('should reject empty DOI', () => {
    const result = validateGetByDoi({ doi: '   ' });
    expect(result.valid).toBe(false);
  });

  it('should reject invalid DOI format', () => {
    const result = validateGetByDoi({ doi: 'not-a-valid-doi' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'doi')).toBe(true);
  });

  it('should accept DOI with URL prefix', () => {
    const result = validateGetByDoi({ doi: 'https://doi.org/10.1145/1234567' });
    expect(result.valid).toBe(true);
  });
});

describe('validateGetByArxiv', () => {
  it('should validate new format arXiv ID', () => {
    const result = validateGetByArxiv({ arxiv_id: '2301.01234' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate old format arXiv ID', () => {
    const result = validateGetByArxiv({ arxiv_id: 'cs/0012345' });
    expect(result.valid).toBe(true);
  });

  it('should validate arXiv ID with version', () => {
    const result = validateGetByArxiv({ arxiv_id: '2301.01234v2' });
    expect(result.valid).toBe(true);
  });

  it('should reject missing arXiv ID', () => {
    const result = validateGetByArxiv({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'arxiv_id')).toBe(true);
  });

  it('should reject invalid arXiv ID format', () => {
    const result = validateGetByArxiv({ arxiv_id: 'not-valid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'arxiv_id')).toBe(true);
  });
});

describe('validateVerifyCitation', () => {
  it('should validate complete citation', () => {
    const result = validateVerifyCitation({
      title: 'Test Paper',
      authors: ['John Doe', 'Jane Smith'],
      year: 2023,
      venue: 'Test Conference'
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing title', () => {
    const result = validateVerifyCitation({
      authors: ['John Doe']
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'title')).toBe(true);
  });

  it('should accept citation with only title', () => {
    const result = validateVerifyCitation({
      title: 'Test Paper'
    });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid year', () => {
    const result = validateVerifyCitation({
      title: 'Test Paper',
      year: 1500
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'year')).toBe(true);
  });

  it('should reject future year', () => {
    const result = validateVerifyCitation({
      title: 'Test Paper',
      year: 2100
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'year')).toBe(true);
  });
});

describe('validateGetBibTeX', () => {
  it('should validate DOI query', () => {
    const result = validateGetBibTeX({
      doi: '10.1145/1234567.1234568'
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate arXiv ID query', () => {
    const result = validateGetBibTeX({
      arxiv_id: '2301.01234'
    });
    expect(result.valid).toBe(true);
  });

  it('should validate title query', () => {
    const result = validateGetBibTeX({
      title: 'Test Paper'
    });
    expect(result.valid).toBe(true);
  });

  it('should reject query with no identifier', () => {
    const result = validateGetBibTeX({});
    expect(result.valid).toBe(false);
  });

  it('should accept custom_key', () => {
    const result = validateGetBibTeX({
      doi: '10.1145/1234567',
      custom_key: 'mycitation2023'
    });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid custom_key type', () => {
    const result = validateGetBibTeX({
      doi: '10.1145/1234567',
      custom_key: 123 // number instead of string
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'custom_key')).toBe(true);
  });
});

describe('validateGetBibTeXBatch', () => {
  it('should validate batch of queries', () => {
    const result = validateGetBibTeXBatch({
      queries: [
        { doi: '10.1145/1234567' },
        { arxiv_id: '2301.01234' },
        { title: 'Test Paper' }
      ]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing queries', () => {
    const result = validateGetBibTeXBatch({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'queries')).toBe(true);
  });

  it('should reject non-array queries', () => {
    const result = validateGetBibTeXBatch({
      queries: 'not-an-array'
    });
    expect(result.valid).toBe(false);
  });

  it('should reject empty queries array', () => {
    const result = validateGetBibTeXBatch({
      queries: []
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'queries')).toBe(true);
  });

  it('should reject too many queries', () => {
    const queries = Array(25).fill({ doi: '10.1145/1234567' });
    const result = validateGetBibTeXBatch({ queries });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'queries')).toBe(true);
  });

  it('should reject invalid query in batch', () => {
    const result = validateGetBibTeXBatch({
      queries: [
        { doi: '10.1145/1234567' },
        {} // Invalid - no identifier
      ]
    });
    expect(result.valid).toBe(false);
  });
});
