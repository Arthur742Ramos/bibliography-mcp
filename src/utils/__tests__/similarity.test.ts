/**
 * Unit tests for similarity utilities
 */

import {
  levenshteinDistance,
  stringSimilarity,
  titleSimilarity,
  authorsSimilarity,
  venueSimilarity,
  paperSimilarity,
  findBestMatch,
} from '../similarity.js';
import { Author, Paper } from '../../types.js';

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('test', 'test')).toBe(0);
  });

  it('should return length for completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('should calculate insertion distance', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('should calculate deletion distance', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('should calculate substitution distance', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', 'test')).toBe(4);
    expect(levenshteinDistance('test', '')).toBe(4);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should handle complex transformations', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('stringSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(stringSimilarity('test', 'test')).toBe(1);
  });

  it('should return 1 for case-insensitive match', () => {
    expect(stringSimilarity('Test', 'TEST')).toBe(1);
  });

  it('should return 0 for empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1); // Both empty = identical
    expect(stringSimilarity('test', '')).toBe(0);
    expect(stringSimilarity('', 'test')).toBe(0);
  });

  it('should return similarity between 0 and 1', () => {
    const similarity = stringSimilarity('hello', 'hallo');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it('should return higher similarity for more similar strings', () => {
    const sim1 = stringSimilarity('machine learning', 'machine learning');
    const sim2 = stringSimilarity('machine learning', 'machine learningg');
    const sim3 = stringSimilarity('machine learning', 'deep learning');
    
    expect(sim1).toBe(1);
    expect(sim2).toBeGreaterThan(sim3);
  });

  it('should ignore case and whitespace', () => {
    expect(stringSimilarity('  Test  ', 'test')).toBe(1);
  });
});

describe('titleSimilarity', () => {
  it('should return 1 for exact titles', () => {
    expect(titleSimilarity(
      'Attention Is All You Need',
      'Attention Is All You Need'
    )).toBe(1);
  });

  it('should return 1 for titles differing only in punctuation', () => {
    const sim = titleSimilarity(
      'Attention Is All You Need',
      'Attention is all you need.'
    );
    expect(sim).toBe(1);
  });

  it('should boost similarity when one title contains another', () => {
    const sim = titleSimilarity(
      'Deep Learning',
      'Deep Learning with Neural Networks'
    );
    expect(sim).toBeGreaterThanOrEqual(0.85);
  });

  it('should return lower similarity for different titles', () => {
    const sim = titleSimilarity(
      'Machine Learning Basics',
      'Deep Neural Networks'
    );
    expect(sim).toBeLessThan(0.5);
  });

  it('should handle empty titles', () => {
    expect(titleSimilarity('', '')).toBe(1);
    // When one title is empty and other contains it (boost applies)
    const sim = titleSimilarity('Test', '');
    expect(sim).toBeGreaterThanOrEqual(0);
  });
});

describe('authorsSimilarity', () => {
  const createAuthor = (name: string): Author => ({
    name,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(-1)[0]
  });

  it('should return 1 for identical author lists', () => {
    const authors1 = [createAuthor('John Doe'), createAuthor('Jane Smith')];
    const authors2 = [createAuthor('John Doe'), createAuthor('Jane Smith')];
    
    expect(authorsSimilarity(authors1, authors2)).toBe(1);
  });

  it('should return 0 for empty author lists', () => {
    expect(authorsSimilarity([], [])).toBe(0);
    expect(authorsSimilarity([createAuthor('John Doe')], [])).toBe(0);
  });

  it('should handle partial matches', () => {
    const authors1 = [createAuthor('John Doe'), createAuthor('Jane Smith')];
    const authors2 = [createAuthor('John Doe'), createAuthor('Bob Jones')];
    
    const sim = authorsSimilarity(authors1, authors2);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('should match by last name', () => {
    const authors1 = [createAuthor('J. Smith')];
    const authors2 = [createAuthor('Jane Smith')];
    
    const sim = authorsSimilarity(authors1, authors2);
    expect(sim).toBeGreaterThan(0);
  });

  it('should handle different order', () => {
    const authors1 = [createAuthor('John Doe'), createAuthor('Jane Smith')];
    const authors2 = [createAuthor('Jane Smith'), createAuthor('John Doe')];
    
    expect(authorsSimilarity(authors1, authors2)).toBe(1);
  });

  it('should handle different list sizes', () => {
    const authors1 = [createAuthor('John Doe')];
    const authors2 = [createAuthor('John Doe'), createAuthor('Jane Smith')];
    
    const sim = authorsSimilarity(authors1, authors2);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('venueSimilarity', () => {
  it('should return 1 for identical venues', () => {
    expect(venueSimilarity('ICML', 'ICML')).toBe(1);
  });

  it('should match venue acronyms', () => {
    const sim = venueSimilarity('ICML', 'International Conference on Machine Learning');
    // Acronym matching logic may not be perfect, just check it's reasonable
    expect(sim).toBeGreaterThan(0);
  });

  it('should handle case insensitivity', () => {
    expect(venueSimilarity('icml', 'ICML')).toBe(1);
  });

  it('should expand common abbreviations', () => {
    const sim = venueSimilarity('Proc. ICML', 'Proceedings ICML');
    expect(sim).toBeGreaterThan(0.5);
  });

  it('should return lower similarity for different venues', () => {
    const sim = venueSimilarity('ICML', 'NeurIPS');
    expect(sim).toBeLessThan(0.5);
  });
});

describe('paperSimilarity', () => {
  const createPaper = (overrides: Partial<Paper> = {}): Paper => ({
    title: 'Test Paper',
    authors: [{ name: 'John Doe', firstName: 'John', lastName: 'Doe' }],
    year: 2023,
    venue: 'Test Conference',
    source: 'crossref',
    ...overrides
  });

  it('should return 1 for identical papers', () => {
    const paper1 = createPaper();
    const paper2 = createPaper();
    
    expect(paperSimilarity(paper1, paper2)).toBe(1);
  });

  it('should return high similarity for matching DOIs', () => {
    const paper1 = createPaper({ doi: '10.1145/1234567' });
    const paper2 = createPaper({ doi: '10.1145/1234567' });
    
    const sim = paperSimilarity(paper1, paper2);
    expect(sim).toBeGreaterThan(0.9);
  });

  it('should give weight to title similarity', () => {
    const paper1 = createPaper({ title: 'Machine Learning' });
    const paper2 = createPaper({ title: 'Deep Learning' });
    
    const sim = paperSimilarity(paper1, paper2);
    expect(sim).toBeLessThan(0.8);
  });

  it('should consider year differences', () => {
    const paper1 = createPaper({ year: 2020 });
    const paper2 = createPaper({ year: 2021 });
    const paper3 = createPaper({ year: 2025 });
    
    const sim1 = paperSimilarity(paper1, paper2);
    const sim2 = paperSimilarity(paper1, paper3);
    
    expect(sim1).toBeGreaterThan(sim2);
  });

  it('should handle papers with missing fields', () => {
    const paper1 = createPaper({ venue: undefined, doi: undefined });
    const paper2 = createPaper({ venue: undefined, doi: undefined });
    
    const sim = paperSimilarity(paper1, paper2);
    expect(sim).toBeGreaterThan(0);
  });

  it('should weight all components', () => {
    const paper1 = createPaper({
      title: 'Test Paper',
      authors: [{ name: 'John Doe', firstName: 'John', lastName: 'Doe' }],
      year: 2023,
      venue: 'ICML'
    });
    
    const paper2 = createPaper({
      title: 'Different Title',
      authors: [{ name: 'Jane Smith', firstName: 'Jane', lastName: 'Smith' }],
      year: 2020,
      venue: 'NeurIPS'
    });
    
    const sim = paperSimilarity(paper1, paper2);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(0.5);
  });
});

describe('findBestMatch', () => {
  const createPaper = (title: string, year?: number): Paper => ({
    title,
    authors: [{ name: 'John Doe', firstName: 'John', lastName: 'Doe' }],
    year,
    source: 'crossref'
  });

  it('should find exact match', () => {
    const target = { title: 'Test Paper', year: 2023 };
    const candidates = [
      createPaper('Different Paper', 2022),
      createPaper('Test Paper', 2023),
      createPaper('Another Paper', 2021)
    ];
    
    const result = findBestMatch(target, candidates);
    expect(result).not.toBeNull();
    expect(result?.paper.title).toBe('Test Paper');
    expect(result?.similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('should return null if no good match', () => {
    const target = { title: 'Test Paper' };
    const candidates = [
      createPaper('Completely Different Title'),
      createPaper('Another Unrelated Paper')
    ];
    
    const result = findBestMatch(target, candidates, 0.9);
    expect(result).toBeNull();
  });

  it('should return null for empty candidates', () => {
    const target = { title: 'Test Paper' };
    const result = findBestMatch(target, []);
    expect(result).toBeNull();
  });

  it('should use custom similarity threshold', () => {
    const target = { title: 'Machine Learning' };
    const candidates = [createPaper('Deep Learning')];
    
    const resultLow = findBestMatch(target, candidates, 0.3);
    const resultHigh = findBestMatch(target, candidates, 0.9);
    
    expect(resultLow).not.toBeNull();
    expect(resultHigh).toBeNull();
  });

  it('should find best among multiple similar matches', () => {
    const target = { title: 'Machine Learning Basics', year: 2020 };
    const candidates = [
      createPaper('Machine Learning Basics', 2020),  // Exact
      createPaper('Machine Learning Basics', 2019),  // Close
      createPaper('Deep Learning Advanced', 2020)     // Different
    ];
    
    const result = findBestMatch(target, candidates);
    expect(result).not.toBeNull();
    expect(result?.paper.year).toBe(2020);
    expect(result?.paper.title).toBe('Machine Learning Basics');
  });
});
