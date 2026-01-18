/**
 * Custom error types for the Bibliography MCP server
 */

export class BibliographyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'BibliographyError';
  }
}

export class ValidationError extends BibliographyError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ApiError extends BibliographyError {
  constructor(
    message: string,
    public readonly source: string,
    public readonly statusCode?: number
  ) {
    super(message, 'API_ERROR');
    this.name = 'ApiError';
  }
}

export class NotFoundError extends BibliographyError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends BibliographyError {
  constructor(
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}
