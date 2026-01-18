/**
 * Utilities for normalizing paper metadata
 */

import { Author, Paper } from '../types.js';

/**
 * Venue type priority for merging papers from multiple sources
 * Higher values indicate higher priority
 */
export const VENUE_TYPE_PRIORITY: Record<string, number> = {
  'journal': 7,
  'conference': 6,
  'workshop': 5,
  'book': 4,
  'thesis': 3,
  'arxiv': 2,
  'other': 1
};

/**
 * Get venue type priority for a paper
 */
export function getVenueTypePriority(venueType?: Paper['venueType']): number {
  return VENUE_TYPE_PRIORITY[venueType || 'other'] || 0;
}

/**
 * Normalize author name to "Firstname Lastname" format
 */
export function normalizeAuthorName(name: string): string {
  // Remove extra whitespace
  name = name.trim().replace(/\s+/g, ' ');

  // Handle "Lastname, Firstname" format
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    if (first && last) {
      return `${first} ${last}`;
    }
  }

  return name;
}

/**
 * Parse author name into components
 */
export function parseAuthorName(name: string): Author {
  const normalized = normalizeAuthorName(name);
  const parts = normalized.split(' ');

  if (parts.length === 1) {
    return { name: normalized, lastName: parts[0] };
  }

  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  return {
    name: normalized,
    firstName,
    lastName
  };
}

/**
 * Normalize title for comparison
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Normalize venue name
 */
export function normalizeVenue(venue: string): string {
  // Common abbreviation expansions
  const expansions: Record<string, string> = {
    'proc.': 'proceedings',
    'conf.': 'conference',
    'int.': 'international',
    'symp.': 'symposium',
    'trans.': 'transactions',
    'j.': 'journal',
    'acm': 'ACM',
    'ieee': 'IEEE',
    'aaai': 'AAAI',
    'icml': 'ICML',
    'neurips': 'NeurIPS',
    'nips': 'NeurIPS',
    'cvpr': 'CVPR',
    'iccv': 'ICCV',
    'eccv': 'ECCV',
    'acl': 'ACL',
    'emnlp': 'EMNLP',
    'naacl': 'NAACL',
    'sigchi': 'SIGCHI',
    'chi': 'CHI',
    'uist': 'UIST',
    'siggraph': 'SIGGRAPH',
    'isca': 'ISCA',
    'asplos': 'ASPLOS',
    'osdi': 'OSDI',
    'sosp': 'SOSP',
    'pldi': 'PLDI',
    'popl': 'POPL',
    'icse': 'ICSE',
    'fse': 'FSE',
    'www': 'WWW',
    'kdd': 'KDD',
    'iclr': 'ICLR'
  };

  let normalized = venue.toLowerCase();

  // Apply expansions
  for (const [abbr, full] of Object.entries(expansions)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    normalized = normalized.replace(regex, full.toLowerCase());
  }

  return normalized.trim();
}

/**
 * Clean DOI - ensure consistent format
 */
export function normalizeDoi(doi: string): string {
  // Remove URL prefix if present
  doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  doi = doi.replace(/^doi:/i, '');
  return doi.trim().toLowerCase();
}

/**
 * Extract year from various date formats
 */
export function extractYear(dateString: string): number | undefined {
  // Try to find a 4-digit year
  const match = dateString.match(/\b(19|20)\d{2}\b/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return undefined;
}

/**
 * Generate a citation key from paper metadata
 */
export function generateCitationKey(
  authors: Author[],
  year?: number,
  title?: string
): string {
  let key = '';

  // First author's last name
  if (authors.length > 0) {
    const firstAuthor = authors[0];
    const lastName = firstAuthor.lastName || firstAuthor.name.split(' ').pop() || 'unknown';
    key += lastName.toLowerCase().replace(/[^a-z]/g, '');
  } else {
    key += 'unknown';
  }

  // Year
  if (year) {
    key += year.toString();
  }

  // First significant word from title
  if (title) {
    const stopWords = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from']);
    const words = title.toLowerCase().split(/\s+/);
    const significantWord = words.find(w => !stopWords.has(w) && w.length > 2);
    if (significantWord) {
      key += significantWord.replace(/[^a-z]/g, '');
    }
  }

  return key;
}
