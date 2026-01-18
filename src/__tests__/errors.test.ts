/**
 * Unit tests for custom error types
 */

import {
  BibliographyError,
  ValidationError,
  ApiError,
  NotFoundError,
  RateLimitError,
} from '../errors.js';

describe('BibliographyError', () => {
  it('should create error with message and code', () => {
    const error = new BibliographyError('Test error', 'TEST_CODE');
    
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('BibliographyError');
  });

  it('should be instance of Error', () => {
    const error = new BibliographyError('Test error', 'TEST_CODE');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BibliographyError);
  });

  it('should have stack trace', () => {
    const error = new BibliographyError('Test error', 'TEST_CODE');
    
    expect(error.stack).toBeDefined();
  });
});

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError('Invalid input');
    
    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
  });

  it('should be instance of BibliographyError', () => {
    const error = new ValidationError('Invalid input');
    
    expect(error).toBeInstanceOf(BibliographyError);
    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe('ApiError', () => {
  it('should create API error with source', () => {
    const error = new ApiError('API failed', 'semantic-scholar');
    
    expect(error.message).toBe('API failed');
    expect(error.source).toBe('semantic-scholar');
    expect(error.code).toBe('API_ERROR');
    expect(error.name).toBe('ApiError');
  });

  it('should include status code when provided', () => {
    const error = new ApiError('Not found', 'crossref', 404);
    
    expect(error.statusCode).toBe(404);
    expect(error.source).toBe('crossref');
  });

  it('should work without status code', () => {
    const error = new ApiError('Generic error', 'dblp');
    
    expect(error.statusCode).toBeUndefined();
    expect(error.source).toBe('dblp');
  });

  it('should be instance of BibliographyError', () => {
    const error = new ApiError('API failed', 'test-source');
    
    expect(error).toBeInstanceOf(BibliographyError);
    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('NotFoundError', () => {
  it('should create not found error', () => {
    const error = new NotFoundError('Paper not found');
    
    expect(error.message).toBe('Paper not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.name).toBe('NotFoundError');
  });

  it('should be instance of BibliographyError', () => {
    const error = new NotFoundError('Resource not found');
    
    expect(error).toBeInstanceOf(BibliographyError);
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe('RateLimitError', () => {
  it('should create rate limit error', () => {
    const error = new RateLimitError('Too many requests');
    
    expect(error.message).toBe('Too many requests');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.name).toBe('RateLimitError');
  });

  it('should include retry after when provided', () => {
    const error = new RateLimitError('Rate limited', 60);
    
    expect(error.retryAfter).toBe(60);
  });

  it('should work without retry after', () => {
    const error = new RateLimitError('Rate limited');
    
    expect(error.retryAfter).toBeUndefined();
  });

  it('should be instance of BibliographyError', () => {
    const error = new RateLimitError('Too many requests');
    
    expect(error).toBeInstanceOf(BibliographyError);
    expect(error).toBeInstanceOf(RateLimitError);
  });
});

describe('Error hierarchy', () => {
  it('should maintain proper inheritance chain', () => {
    const errors = [
      new ValidationError('test'),
      new ApiError('test', 'source'),
      new NotFoundError('test'),
      new RateLimitError('test')
    ];

    errors.forEach(error => {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BibliographyError);
    });
  });

  it('should distinguish between error types', () => {
    const validation = new ValidationError('test');
    const api = new ApiError('test', 'source');
    const notFound = new NotFoundError('test');
    const rateLimit = new RateLimitError('test');

    expect(validation).not.toBeInstanceOf(ApiError);
    expect(api).not.toBeInstanceOf(ValidationError);
    expect(notFound).not.toBeInstanceOf(RateLimitError);
    expect(rateLimit).not.toBeInstanceOf(NotFoundError);
  });
});
