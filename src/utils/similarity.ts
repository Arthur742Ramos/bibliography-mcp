/**
 * Utilities for comparing and matching paper metadata
 */

import { Author, Paper } from '../types.js';
import { normalizeTitle, normalizeAuthorName, normalizeVenue } from './normalize.js';

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
export function stringSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();

  if (aNorm === bNorm) return 1;
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  const distance = levenshteinDistance(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);

  return 1 - (distance / maxLen);
}

/**
 * Calculate title similarity with normalization
 */
export function titleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // Check for exact match after normalization
  if (norm1 === norm2) return 1;

  // Calculate string similarity
  const similarity = stringSimilarity(norm1, norm2);

  // Boost score if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return Math.max(similarity, 0.85);
  }

  return similarity;
}

/**
 * Calculate author list similarity
 */
export function authorsSimilarity(authors1: Author[], authors2: Author[]): number {
  if (authors1.length === 0 || authors2.length === 0) return 0;

  const names1 = authors1.map(a => normalizeAuthorName(a.name).toLowerCase());
  const names2 = authors2.map(a => normalizeAuthorName(a.name).toLowerCase());

  // Count matching authors
  let matches = 0;
  for (const name1 of names1) {
    for (const name2 of names2) {
      // Check for exact match or high similarity
      if (name1 === name2 || stringSimilarity(name1, name2) > 0.85) {
        matches++;
        break;
      }
      // Also check last name only match
      const lastName1 = name1.split(' ').pop() || '';
      const lastName2 = name2.split(' ').pop() || '';
      if (lastName1 === lastName2 && lastName1.length > 2) {
        matches += 0.7; // Partial credit for last name match
        break;
      }
    }
  }

  // Calculate Jaccard-like similarity
  const maxAuthors = Math.max(authors1.length, authors2.length);
  return matches / maxAuthors;
}

/**
 * Calculate venue similarity
 */
export function venueSimilarity(venue1: string, venue2: string): number {
  const norm1 = normalizeVenue(venue1);
  const norm2 = normalizeVenue(venue2);

  if (norm1 === norm2) return 1;

  // Check if one is an abbreviation of the other
  const words1 = norm1.split(/\s+/);
  const words2 = norm2.split(/\s+/);

  // Check for acronym match
  const acronym1 = words1.map(w => w[0]).join('');
  const acronym2 = words2.map(w => w[0]).join('');
  if (acronym1 === norm2 || acronym2 === norm1) return 0.9;

  return stringSimilarity(norm1, norm2);
}

/**
 * Calculate overall paper similarity
 */
export function paperSimilarity(paper1: Paper, paper2: Paper): number {
  const weights = {
    title: 0.5,
    authors: 0.25,
    year: 0.1,
    venue: 0.1,
    doi: 0.05
  };

  let score = 0;
  let totalWeight = 0;

  // Title similarity (always available)
  score += weights.title * titleSimilarity(paper1.title, paper2.title);
  totalWeight += weights.title;

  // Author similarity
  if (paper1.authors.length > 0 && paper2.authors.length > 0) {
    score += weights.authors * authorsSimilarity(paper1.authors, paper2.authors);
    totalWeight += weights.authors;
  }

  // Year match
  if (paper1.year && paper2.year) {
    const yearScore = paper1.year === paper2.year ? 1 : (Math.abs(paper1.year - paper2.year) <= 1 ? 0.5 : 0);
    score += weights.year * yearScore;
    totalWeight += weights.year;
  }

  // Venue similarity
  if (paper1.venue && paper2.venue) {
    score += weights.venue * venueSimilarity(paper1.venue, paper2.venue);
    totalWeight += weights.venue;
  }

  // DOI match (exact)
  if (paper1.doi && paper2.doi) {
    const doiMatch = paper1.doi.toLowerCase() === paper2.doi.toLowerCase() ? 1 : 0;
    score += weights.doi * doiMatch;
    totalWeight += weights.doi;
  }

  return totalWeight > 0 ? score / totalWeight : 0;
}

/**
 * Find best matching paper from a list
 */
export function findBestMatch(
  target: Partial<Paper>,
  candidates: Paper[],
  minSimilarity: number = 0.7
): { paper: Paper; similarity: number } | null {
  if (candidates.length === 0) return null;

  const targetPaper: Paper = {
    title: target.title || '',
    authors: target.authors || [],
    year: target.year,
    venue: target.venue,
    doi: target.doi,
    source: 'crossref' // placeholder
  };

  let bestMatch: Paper | null = null;
  let bestSimilarity = 0;

  for (const candidate of candidates) {
    const similarity = paperSimilarity(targetPaper, candidate);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestSimilarity >= minSimilarity) {
    return { paper: bestMatch, similarity: bestSimilarity };
  }

  return null;
}
