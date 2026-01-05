/**
 * Core types for the Bibliography MCP server
 */

export interface Author {
  name: string;
  firstName?: string;
  lastName?: string;
  orcid?: string;
  affiliations?: string[];
}

export interface Paper {
  id?: string;
  title: string;
  authors: Author[];
  year?: number;
  month?: number;
  venue?: string;
  venueType?: 'journal' | 'conference' | 'workshop' | 'arxiv' | 'book' | 'thesis' | 'other';
  doi?: string;
  arxivId?: string;
  url?: string;
  abstract?: string;
  pages?: string;
  volume?: string;
  issue?: string;
  publisher?: string;
  keywords?: string[];
  citations?: number;
  source: DataSource;
}

export type DataSource = 'semantic-scholar' | 'crossref' | 'dblp' | 'openalex' | 'arxiv';

export interface SearchResult {
  papers: Paper[];
  totalResults?: number;
  source: DataSource;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number; // 0-1 scale
  matchedPaper?: Paper;
  corrections: {
    title?: { original: string; suggested: string };
    authors?: { original: string[]; suggested: string[] };
    year?: { original: number; suggested: number };
    venue?: { original: string; suggested: string };
    doi?: { original: string; suggested: string };
  };
  sources: DataSource[];
  warnings: string[];
}

export interface BibTeXEntry {
  entryType: 'article' | 'inproceedings' | 'book' | 'phdthesis' | 'mastersthesis' | 'misc' | 'techreport';
  citationKey: string;
  fields: Record<string, string>;
  raw: string;
}

export interface CacheEntry {
  key: string;
  data: string; // JSON stringified
  source: DataSource;
  createdAt: number;
  expiresAt: number;
}

export interface ApiClientConfig {
  baseUrl: string;
  userAgent?: string;
  rateLimitPerMinute?: number;
  timeout?: number;
}

export interface ApiClient {
  searchByTitle(title: string, limit?: number): Promise<Paper[]>;
  searchByAuthor(author: string, limit?: number): Promise<Paper[]>;
  getByDoi?(doi: string): Promise<Paper | null>;
  getById?(id: string): Promise<Paper | null>;
}
