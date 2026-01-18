/**
 * Unit tests for BibTeX utilities
 */

import { generateBibTeX } from '../bibtex.js';
import { Paper, Author } from '../../types.js';

describe('generateBibTeX', () => {
  const createAuthor = (name: string, firstName?: string, lastName?: string): Author => ({
    name,
    firstName,
    lastName
  });

  const createPaper = (overrides: Partial<Paper> = {}): Paper => ({
    title: 'Test Paper Title',
    authors: [createAuthor('John Doe', 'John', 'Doe')],
    year: 2023,
    venue: 'Test Conference',
    source: 'crossref',
    ...overrides
  });

  it('should generate basic BibTeX entry', () => {
    const paper = createPaper();
    const entry = generateBibTeX(paper);
    
    expect(entry.entryType).toBeDefined();
    expect(entry.citationKey).toBeDefined();
    expect(entry.fields.title).toContain('Test Paper Title');
    expect(entry.fields.author).toContain('Doe');
    expect(entry.fields.year).toBe('2023');
  });

  it('should use custom citation key', () => {
    const paper = createPaper();
    const entry = generateBibTeX(paper, 'mycustom2023');
    
    expect(entry.citationKey).toBe('mycustom2023');
  });

  it('should generate article type for journal venues', () => {
    const paper = createPaper({ 
      venue: 'Nature Machine Intelligence',
      venueType: 'journal'
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.entryType).toBe('article');
    expect(entry.fields.journal).toBeDefined();
  });

  it('should generate inproceedings type for conference venues', () => {
    const paper = createPaper({ 
      venue: 'International Conference on Machine Learning',
      venueType: 'conference'
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.entryType).toBe('inproceedings');
    expect(entry.fields.booktitle).toBeDefined();
  });

  it('should generate misc type for arXiv papers', () => {
    const paper = createPaper({ 
      arxivId: '2301.01234',
      venueType: 'arxiv'
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.entryType).toBe('misc');
  });

  it('should include DOI when available', () => {
    const paper = createPaper({ doi: '10.1145/1234567' });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.doi).toBe('10.1145/1234567');
  });

  it('should include URL when available', () => {
    const paper = createPaper({ url: 'https://example.com/paper' });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.url).toBe('https://example.com/paper');
  });

  it('should format multiple authors correctly', () => {
    const paper = createPaper({
      authors: [
        createAuthor('John Doe', 'John', 'Doe'),
        createAuthor('Jane Smith', 'Jane', 'Smith'),
        createAuthor('Bob Jones', 'Bob', 'Jones')
      ]
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.author).toContain('Doe');
    expect(entry.fields.author).toContain('Smith');
    expect(entry.fields.author).toContain('Jones');
    expect(entry.fields.author).toContain(' and ');
  });

  it('should escape LaTeX special characters in title', () => {
    const paper = createPaper({ 
      title: 'Test & Special $ Characters # in % Title' 
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.title).toContain('\\&');
    expect(entry.fields.title).toContain('\\$');
    expect(entry.fields.title).toContain('\\#');
    expect(entry.fields.title).toContain('\\%');
  });

  it('should sanitize BibTeX injection patterns', () => {
    const paper = createPaper({ 
      title: 'Test \\input{malicious} Title'
    });
    const entry = generateBibTeX(paper);
    
    // \\input{ should be removed by sanitization
    expect(entry.fields.title).not.toContain('\\input{');
  });

  it('should include arXiv ID when available', () => {
    const paper = createPaper({ 
      arxivId: '2301.01234',
      venueType: 'arxiv' // This makes it a 'misc' type
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.eprint).toBe('2301.01234');
    expect(entry.fields.archiveprefix).toBe('arXiv');
  });

  it('should include volume and issue for articles', () => {
    const paper = createPaper({
      venueType: 'journal',
      volume: '42',
      issue: '3',
      pages: '123-145'
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.volume).toBe('42');
    expect(entry.fields.number).toBe('3');
    expect(entry.fields.pages).toBe('123-145');
  });

  it('should handle papers without year', () => {
    const paper = createPaper({ year: undefined });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.year).toBeUndefined();
  });

  it('should handle papers with single name authors', () => {
    const paper = createPaper({
      authors: [createAuthor('Prince')]
    });
    const entry = generateBibTeX(paper);
    
    expect(entry.fields.author).toBe('Prince');
  });
});

describe('formatBibTeXEntry', () => {
  const createAuthor = (name: string, firstName?: string, lastName?: string): Author => ({
    name,
    firstName,
    lastName
  });

  it('should format complete BibTeX entry', () => {
    const paper: Paper = {
      title: 'Test Paper',
      authors: [createAuthor('John Doe', 'John', 'Doe')],
      year: 2023,
      venue: 'ICML',
      source: 'crossref'
    };
    
    const entry = generateBibTeX(paper);
    const formatted = entry.raw;
    
    expect(formatted).toContain('@');
    expect(formatted).toContain('{');
    expect(formatted).toContain('}');
    expect(formatted).toContain('title');
    expect(formatted).toContain('author');
    expect(formatted).toContain('year');
  });

  it('should include entry type and key', () => {
    const paper: Paper = {
      title: 'Test Paper',
      authors: [createAuthor('John Doe', 'John', 'Doe')],
      year: 2023,
      source: 'crossref'
    };
    
    const entry = generateBibTeX(paper, 'testkey2023');
    const formatted = entry.raw;
    
    expect(formatted).toMatch(/@\w+{testkey2023/);
  });

  it('should properly indent fields', () => {
    const paper: Paper = {
      title: 'Test Paper',
      authors: [createAuthor('John Doe', 'John', 'Doe')],
      year: 2023,
      source: 'crossref'
    };
    
    const entry = generateBibTeX(paper);
    const formatted = entry.raw;
    const lines = formatted.split('\n');
    
    // Most lines should be indented (except first and last)
    const indentedLines = lines.filter((line: string) => line.startsWith('  '));
    expect(indentedLines.length).toBeGreaterThan(0);
  });

  it('should handle entries with many fields', () => {
    const paper: Paper = {
      title: 'Test Paper',
      authors: [createAuthor('John Doe', 'John', 'Doe')],
      year: 2023,
      venue: 'ICML',
      doi: '10.1145/1234567',
      url: 'https://example.com',
      arxivId: '2301.01234',
      source: 'crossref'
    };
    
    const entry = generateBibTeX(paper);
    const formatted = entry.raw;
    
    expect(formatted).toContain('doi');
    expect(formatted).toContain('url');
    expect(formatted).toContain('eprint');
  });

  it('should properly close BibTeX entry', () => {
    const paper: Paper = {
      title: 'Test Paper',
      authors: [createAuthor('John Doe', 'John', 'Doe')],
      year: 2023,
      source: 'crossref'
    };
    
    const entry = generateBibTeX(paper);
    const formatted = entry.raw;
    
    expect(formatted.trim()).toMatch(/}$/);
  });

  it('should format minimal entry correctly', () => {
    const paper: Paper = {
      title: 'Title Only',
      authors: [createAuthor('Anonymous')],
      source: 'crossref'
    };
    
    const entry = generateBibTeX(paper);
    const formatted = entry.raw;
    
    expect(formatted).toContain('title');
    expect(formatted).toContain('author');
    // Should still be valid BibTeX format
    expect(formatted).toMatch(/@\w+{/);
    expect(formatted.trim()).toMatch(/}$/);
  });
});
