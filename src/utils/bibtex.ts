/**
 * BibTeX generation utilities
 */

import { Paper, Author, BibTeXEntry } from '../types.js';
import { generateCitationKey } from './normalize.js';

/**
 * Escape special LaTeX characters in a string
 */
function escapeLatex(str: string): string {
  // Handle backslash first to avoid double escaping
  let result = str.replace(/\\/g, '\\textbackslash{}');
  
  const replacements: Record<string, string> = {
    '&': '\\&',
    '%': '\\%',
    '$': '\\$',
    '#': '\\#',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}'
  };

  for (const [char, replacement] of Object.entries(replacements)) {
    result = result.split(char).join(replacement);
  }

  return result;
}

/**
 * Sanitize BibTeX field value to prevent injection
 */
function sanitizeBibTeXField(value: string): string {
  // Remove any potential command injection patterns
  return value
    .replace(/\\input{/gi, '') // Block \input
    .replace(/\\include{/gi, '') // Block \include
    .replace(/\\def/gi, '') // Block \def
    .replace(/\\let/gi, '') // Block \let
    .trim();
}

/**
 * Format author name for BibTeX (Lastname, Firstname)
 */
function formatBibTeXAuthor(author: Author): string {
  if (author.lastName && author.firstName) {
    return `${author.lastName}, ${author.firstName}`;
  }

  // Try to parse from full name
  const parts = author.name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }

  const lastName = parts.pop()!;
  const firstName = parts.join(' ');
  return `${lastName}, ${firstName}`;
}

/**
 * Format author list for BibTeX
 */
function formatBibTeXAuthors(authors: Author[]): string {
  return authors.map(formatBibTeXAuthor).join(' and ');
}

/**
 * Determine BibTeX entry type based on paper metadata
 */
function determineBibTeXType(paper: Paper): BibTeXEntry['entryType'] {
  if (paper.venueType) {
    switch (paper.venueType) {
      case 'journal':
        return 'article';
      case 'conference':
      case 'workshop':
        return 'inproceedings';
      case 'book':
        return 'book';
      case 'thesis':
        return 'phdthesis';
      case 'arxiv':
        return 'misc';
      default:
        return 'misc';
    }
  }

  // Heuristics based on venue name
  const venue = (paper.venue || '').toLowerCase();

  if (venue.includes('journal') || venue.includes('transaction') || venue.includes('magazine')) {
    return 'article';
  }

  if (venue.includes('conference') || venue.includes('symposium') || venue.includes('workshop') ||
      venue.includes('proceedings') || venue.includes('proc.')) {
    return 'inproceedings';
  }

  if (paper.arxivId) {
    return 'misc';
  }

  // Default to misc for unknown
  return 'misc';
}

/**
 * Generate BibTeX entry from paper metadata
 */
export function generateBibTeX(paper: Paper, customKey?: string): BibTeXEntry {
  const entryType = determineBibTeXType(paper);
  const citationKey = customKey || generateCitationKey(paper.authors, paper.year, paper.title);

  const fields: Record<string, string> = {};

  // Required fields - sanitize and escape
  fields.title = `{${sanitizeBibTeXField(escapeLatex(paper.title))}}`;
  fields.author = sanitizeBibTeXField(formatBibTeXAuthors(paper.authors));

  if (paper.year) {
    fields.year = paper.year.toString();
  }

  // Optional fields based on entry type
  if (entryType === 'article') {
    if (paper.venue) {
      fields.journal = sanitizeBibTeXField(paper.venue);
    }
    if (paper.volume) {
      fields.volume = sanitizeBibTeXField(paper.volume);
    }
    if (paper.issue) {
      fields.number = sanitizeBibTeXField(paper.issue);
    }
    if (paper.pages) {
      fields.pages = sanitizeBibTeXField(paper.pages);
    }
  } else if (entryType === 'inproceedings') {
    if (paper.venue) {
      fields.booktitle = sanitizeBibTeXField(paper.venue);
    }
    if (paper.pages) {
      fields.pages = sanitizeBibTeXField(paper.pages);
    }
    if (paper.publisher) {
      fields.publisher = sanitizeBibTeXField(paper.publisher);
    }
  } else if (entryType === 'misc' && paper.arxivId) {
    fields.eprint = sanitizeBibTeXField(paper.arxivId);
    fields.archiveprefix = 'arXiv';
    if (paper.url) {
      fields.url = sanitizeBibTeXField(paper.url);
    }
  }

  // Common optional fields
  if (paper.doi) {
    fields.doi = sanitizeBibTeXField(paper.doi);
  }

  if (paper.url && !fields.url) {
    fields.url = sanitizeBibTeXField(paper.url);
  }

  if (paper.abstract) {
    fields.abstract = `{${sanitizeBibTeXField(escapeLatex(paper.abstract))}}`;
  }

  if (paper.month) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    if (paper.month >= 1 && paper.month <= 12) {
      fields.month = months[paper.month - 1];
    }
  }

  // Generate raw BibTeX string
  const raw = formatBibTeXEntry(entryType, citationKey, fields);

  return {
    entryType,
    citationKey,
    fields,
    raw
  };
}

/**
 * Format fields into BibTeX entry string
 */
function formatBibTeXEntry(
  entryType: string,
  citationKey: string,
  fields: Record<string, string>
): string {
  const lines: string[] = [`@${entryType}{${citationKey},`];

  const fieldOrder = [
    'author', 'title', 'journal', 'booktitle', 'year', 'month',
    'volume', 'number', 'pages', 'publisher', 'doi', 'url',
    'eprint', 'archiveprefix', 'abstract'
  ];

  // Sort fields by preferred order
  const sortedFields = Object.entries(fields).sort(([a], [b]) => {
    const indexA = fieldOrder.indexOf(a);
    const indexB = fieldOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  for (let i = 0; i < sortedFields.length; i++) {
    const [key, value] = sortedFields[i];
    const isLast = i === sortedFields.length - 1;
    // Wrap value in braces if not already wrapped and not a month
    const formattedValue = key === 'month' || value.startsWith('{') ? value : `{${value}}`;
    lines.push(`  ${key} = ${formattedValue}${isLast ? '' : ','}`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Parse a BibTeX entry string (basic parser)
 */
export function parseBibTeX(bibtex: string): Partial<Paper> | null {
  try {
    // Extract entry type and key
    const headerMatch = bibtex.match(/@(\w+)\s*{\s*([^,]+)\s*,/);
    if (!headerMatch) return null;

    const [, entryType, _citationKey] = headerMatch;

    // Extract fields
    const fieldRegex = /(\w+)\s*=\s*(?:{([^{}]*(?:{[^{}]*}[^{}]*)*)})|\s*"([^"]*)"|\s*(\d+)/g;
    const fields: Record<string, string> = {};

    // More robust field extraction
    const content = bibtex.slice(bibtex.indexOf(',') + 1);
    const fieldMatches = content.matchAll(/(\w+)\s*=\s*[{"]((?:[^{}"]|{[^{}]*})*)[}"]/g);

    for (const match of fieldMatches) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }

    // Build paper object
    const paper: Partial<Paper> = {
      title: fields.title,
      source: 'crossref' // placeholder
    };

    // Parse authors
    if (fields.author) {
      const authorStrings = fields.author.split(/\s+and\s+/);
      paper.authors = authorStrings.map(name => {
        const parts = name.split(',').map(s => s.trim());
        if (parts.length === 2) {
          return { name: `${parts[1]} ${parts[0]}`, firstName: parts[1], lastName: parts[0] };
        }
        return { name: name.trim() };
      });
    }

    if (fields.year) {
      paper.year = parseInt(fields.year, 10);
    }

    if (fields.journal) {
      paper.venue = fields.journal;
      paper.venueType = 'journal';
    } else if (fields.booktitle) {
      paper.venue = fields.booktitle;
      paper.venueType = 'conference';
    }

    if (fields.doi) {
      paper.doi = fields.doi;
    }

    if (fields.volume) {
      paper.volume = fields.volume;
    }

    if (fields.number) {
      paper.issue = fields.number;
    }

    if (fields.pages) {
      paper.pages = fields.pages;
    }

    if (fields.url) {
      paper.url = fields.url;
    }

    if (fields.abstract) {
      paper.abstract = fields.abstract;
    }

    if (fields.eprint) {
      paper.arxivId = fields.eprint;
    }

    return paper;
  } catch {
    return null;
  }
}
