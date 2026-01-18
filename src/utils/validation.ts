/**
 * Input validation utilities for MCP tool arguments
 */

import { DataSource } from '../types.js';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALID_SOURCES: DataSource[] = ['semantic-scholar', 'crossref', 'dblp', 'openalex', 'arxiv'];

// arXiv ID regex patterns
const ARXIV_ID_PATTERN = /^(\d{4}\.\d{4,5}(v\d+)?|[a-z-]+\/\d{7})$/i;

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  // Remove any potential XSS or injection patterns
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Validate that a string is reasonable length
 */
export function validateStringLength(value: string, field: string, minLength = 1, maxLength = 500): ValidationError | null {
  if (value.length < minLength) {
    return { field, message: `${field} must be at least ${minLength} characters` };
  }
  if (value.length > maxLength) {
    return { field, message: `${field} must be at most ${maxLength} characters` };
  }
  return null;
}

/**
 * Validate search_papers arguments
 */
export function validateSearchPapers(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  if (!args || typeof args.query !== 'string' || args.query.trim().length === 0) {
    errors.push({ field: 'query', message: 'Query is required and must be a non-empty string' });
  } else {
    const lengthError = validateStringLength(args.query, 'query', 1, 500);
    if (lengthError) {
      errors.push(lengthError);
    }
  }

  if (args?.limit !== undefined) {
    const limit = Number(args.limit);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      errors.push({ field: 'limit', message: 'Limit must be a number between 1 and 50' });
    }
  }

  if (args?.sources !== undefined) {
    if (!Array.isArray(args.sources)) {
      errors.push({ field: 'sources', message: 'Sources must be an array' });
    } else {
      const invalidSources = args.sources.filter(s => !VALID_SOURCES.includes(s as DataSource));
      if (invalidSources.length > 0) {
        errors.push({
          field: 'sources',
          message: `Invalid sources: ${invalidSources.join(', ')}. Valid sources are: ${VALID_SOURCES.join(', ')}`
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate search_by_author arguments
 */
export function validateSearchByAuthor(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  if (!args || typeof args.author !== 'string' || args.author.trim().length === 0) {
    errors.push({ field: 'author', message: 'Author is required and must be a non-empty string' });
  } else {
    const lengthError = validateStringLength(args.author, 'author', 1, 200);
    if (lengthError) {
      errors.push(lengthError);
    }
  }

  if (args?.limit !== undefined) {
    const limit = Number(args.limit);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      errors.push({ field: 'limit', message: 'Limit must be a number between 1 and 50' });
    }
  }

  if (args?.sources !== undefined) {
    if (!Array.isArray(args.sources)) {
      errors.push({ field: 'sources', message: 'Sources must be an array' });
    } else {
      const invalidSources = args.sources.filter(s => !VALID_SOURCES.includes(s as DataSource));
      if (invalidSources.length > 0) {
        errors.push({
          field: 'sources',
          message: `Invalid sources: ${invalidSources.join(', ')}. Valid sources are: ${VALID_SOURCES.join(', ')}`
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate get_paper_by_doi arguments
 */
export function validateGetByDoi(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  if (!args || typeof args.doi !== 'string' || args.doi.trim().length === 0) {
    errors.push({ field: 'doi', message: 'DOI is required and must be a non-empty string' });
  } else {
    // Basic DOI format validation (starts with 10.)
    const doi = args.doi as string;
    if (!doi.match(/^(https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,}/i)) {
      errors.push({ field: 'doi', message: 'Invalid DOI format. DOI should start with "10." (e.g., "10.1145/1234567.1234568")' });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate get_paper_by_arxiv arguments
 */
export function validateGetByArxiv(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  if (!args || typeof args.arxiv_id !== 'string' || args.arxiv_id.trim().length === 0) {
    errors.push({ field: 'arxiv_id', message: 'arXiv ID is required and must be a non-empty string' });
  } else {
    // Basic arXiv ID format validation using constant pattern
    const arxivId = (args.arxiv_id as string).replace(/^arXiv:/i, '');
    if (!ARXIV_ID_PATTERN.test(arxivId)) {
      errors.push({
        field: 'arxiv_id',
        message: 'Invalid arXiv ID format. Expected format: "2301.01234" or "cs/0701001"'
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate verify_citation arguments
 */
export function validateVerifyCitation(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  if (!args || typeof args.title !== 'string' || args.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required and must be a non-empty string' });
  } else {
    const lengthError = validateStringLength(args.title, 'title', 1, 500);
    if (lengthError) {
      errors.push(lengthError);
    }
  }

  if (args?.authors !== undefined) {
    if (!Array.isArray(args.authors)) {
      errors.push({ field: 'authors', message: 'Authors must be an array of strings' });
    } else if (args.authors.length > 50) {
      errors.push({ field: 'authors', message: 'Authors array cannot have more than 50 items' });
    }
  }

  if (args?.year !== undefined) {
    const year = Number(args.year);
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 1) {
      errors.push({ field: 'year', message: `Year must be a valid year between 1900 and ${new Date().getFullYear() + 1}` });
    }
  }

  if (args?.venue !== undefined && typeof args.venue === 'string') {
    const lengthError = validateStringLength(args.venue, 'venue', 1, 300);
    if (lengthError) {
      errors.push(lengthError);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate get_bibtex arguments
 */
export function validateGetBibTeX(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  const hasDoi = args?.doi && typeof args.doi === 'string' && args.doi.trim().length > 0;
  const hasArxiv = args?.arxiv_id && typeof args.arxiv_id === 'string' && args.arxiv_id.trim().length > 0;
  const hasTitle = args?.title && typeof args.title === 'string' && args.title.trim().length > 0;

  if (!hasDoi && !hasArxiv && !hasTitle) {
    errors.push({
      field: 'doi|arxiv_id|title',
      message: 'At least one of doi, arxiv_id, or title must be provided'
    });
  }

  if (args?.custom_key !== undefined && typeof args.custom_key !== 'string') {
    errors.push({ field: 'custom_key', message: 'custom_key must be a string' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate get_bibtex_batch arguments
 */
export function validateGetBibTeXBatch(args: Record<string, unknown> | undefined): ValidationResult {
  const errors: ValidationError[] = [];

  if (!args || !Array.isArray(args.queries)) {
    errors.push({ field: 'queries', message: 'queries is required and must be an array' });
    return { valid: false, errors };
  }

  if (args.queries.length === 0) {
    errors.push({ field: 'queries', message: 'queries array cannot be empty' });
  }

  if (args.queries.length > 20) {
    errors.push({ field: 'queries', message: 'queries array cannot have more than 20 items' });
  }

  // Validate each query
  for (let i = 0; i < args.queries.length; i++) {
    const query = args.queries[i] as Record<string, unknown>;
    const hasDoi = query?.doi && typeof query.doi === 'string' && query.doi.trim().length > 0;
    const hasArxiv = query?.arxiv_id && typeof query.arxiv_id === 'string' && query.arxiv_id.trim().length > 0;
    const hasTitle = query?.title && typeof query.title === 'string' && query.title.trim().length > 0;

    if (!hasDoi && !hasArxiv && !hasTitle) {
      errors.push({
        field: `queries[${i}]`,
        message: 'Each query must have at least one of doi, arxiv_id, or title'
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format validation errors for response
 */
export function formatValidationErrors(result: ValidationResult): string {
  return JSON.stringify({
    error: 'Validation failed',
    details: result.errors
  }, null, 2);
}
