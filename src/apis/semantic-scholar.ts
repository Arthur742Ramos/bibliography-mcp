/**
 * Semantic Scholar API client
 * API docs: https://api.semanticscholar.org/api-docs/
 */

import axios, { AxiosInstance } from 'axios';
import { Paper, Author, ApiClient, DataSource } from '../types.js';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';
const SEARCH_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';
const API_TIMEOUT = 8000; // 8 second timeout for faster fail

// Fields to request from the API
const PAPER_FIELDS = [
  'paperId',
  'title',
  'abstract',
  'year',
  'venue',
  'publicationVenue',
  'authors',
  'externalIds',
  'url',
  'citationCount',
  'publicationDate'
].join(',');

interface S2Author {
  authorId: string;
  name: string;
}

interface S2ExternalIds {
  DOI?: string;
  ArXiv?: string;
  MAG?: string;
  CorpusId?: string;
  PubMed?: string;
}

interface S2PublicationVenue {
  id?: string;
  name?: string;
  type?: string;
  alternate_names?: string[];
  issn?: string;
  url?: string;
}

interface S2Paper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  venue?: string;
  publicationVenue?: S2PublicationVenue;
  authors: S2Author[];
  externalIds?: S2ExternalIds;
  url?: string;
  citationCount?: number;
  publicationDate?: string;
}

interface S2SearchResponse {
  total: number;
  offset: number;
  next?: number;
  data: S2Paper[];
}

interface S2CitationResponse {
  data: Array<{ citingPaper: S2Paper }>;
  next?: number;
}

interface S2ReferenceResponse {
  data: Array<{ citedPaper: S2Paper }>;
  next?: number;
}

export class SemanticScholarClient implements ApiClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // ms between requests

  constructor(apiKey?: string) {
    // Use provided API key or fall back to environment variable
    const effectiveApiKey = apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY;

    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (effectiveApiKey) {
      headers['x-api-key'] = effectiveApiKey;
      // With API key, we can make more requests
      this.minRequestInterval = 50;
    }

    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: API_TIMEOUT,
      headers
    });
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  private convertPaper(s2Paper: S2Paper): Paper {
    const authors: Author[] = s2Paper.authors.map(a => ({
      name: a.name,
      ...(this.parseAuthorName(a.name))
    }));

    let venueType: Paper['venueType'] = 'other';
    if (s2Paper.publicationVenue?.type) {
      const type = s2Paper.publicationVenue.type.toLowerCase();
      if (type.includes('journal')) venueType = 'journal';
      else if (type.includes('conference')) venueType = 'conference';
    } else if (s2Paper.externalIds?.ArXiv) {
      venueType = 'arxiv';
    }

    let month: number | undefined;
    if (s2Paper.publicationDate) {
      const match = s2Paper.publicationDate.match(/-(\d{2})-/);
      if (match) {
        month = parseInt(match[1], 10);
      }
    }

    return {
      id: s2Paper.paperId,
      title: s2Paper.title,
      authors,
      year: s2Paper.year,
      month,
      venue: s2Paper.publicationVenue?.name || s2Paper.venue,
      venueType,
      doi: s2Paper.externalIds?.DOI,
      arxivId: s2Paper.externalIds?.ArXiv,
      url: s2Paper.url,
      abstract: s2Paper.abstract,
      citations: s2Paper.citationCount,
      source: 'semantic-scholar' as DataSource
    };
  }

  private parseAuthorName(name: string): { firstName?: string; lastName?: string } {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return { lastName: parts[0] };
    }
    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1]
    };
  }

  async searchByTitle(title: string, limit: number = 10, yearRange?: { min?: number; max?: number }): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const params: Record<string, string | number> = {
        query: title,
        fields: PAPER_FIELDS,
        limit: Math.min(limit, 100)
      };

      // Add year filter if specified
      if (yearRange?.min || yearRange?.max) {
        const min = yearRange.min || 1900;
        const max = yearRange.max || new Date().getFullYear();
        params.year = `${min}-${max}`;
      }

      const response = await axios.get<S2SearchResponse>(SEARCH_URL, {
        params,
        timeout: API_TIMEOUT
      });

      return response.data.data.map(p => this.convertPaper(p));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Semantic Scholar API error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async searchByAuthor(author: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      // First try to find the author
      const authorResponse = await axios.get<{
        total: number;
        data: Array<{ authorId: string; name: string; paperCount: number }>;
      }>('https://api.semanticscholar.org/graph/v1/author/search', {
        params: {
          query: author,
          limit: 1
        },
        timeout: API_TIMEOUT
      });

      if (authorResponse.data.data.length > 0) {
        const authorId = authorResponse.data.data[0].authorId;

        // Get papers by this author
        await this.rateLimit();
        const papersResponse = await this.client.get<{ data: S2Paper[] }>(
          `/author/${authorId}/papers`,
          {
            params: {
              fields: PAPER_FIELDS,
              limit: Math.min(limit, 100)
            }
          }
        );

        return papersResponse.data.data.map(p => this.convertPaper(p));
      }

      // Fall back to title search with author name
      return this.searchByTitle(author, limit);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Semantic Scholar author search error: ${error.response?.status} - ${error.message}`);
      }
      // Fall back to title search
      return this.searchByTitle(author, limit);
    }
  }

  async getByDoi(doi: string): Promise<Paper | null> {
    await this.rateLimit();

    try {
      const response = await this.client.get<S2Paper>(`/paper/DOI:${encodeURIComponent(doi)}`, {
        params: { fields: PAPER_FIELDS }
      });

      return this.convertPaper(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`Semantic Scholar DOI lookup error: ${error}`);
      return null;
    }
  }

  async getById(paperId: string): Promise<Paper | null> {
    await this.rateLimit();

    try {
      const response = await this.client.get<S2Paper>(`/paper/${paperId}`, {
        params: { fields: PAPER_FIELDS }
      });

      return this.convertPaper(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`Semantic Scholar paper lookup error: ${error}`);
      return null;
    }
  }

  async getByArxivId(arxivId: string): Promise<Paper | null> {
    await this.rateLimit();

    // Normalize arXiv ID
    const normalized = arxivId.replace('arXiv:', '');

    try {
      const response = await this.client.get<S2Paper>(`/paper/ARXIV:${normalized}`, {
        params: { fields: PAPER_FIELDS }
      });

      return this.convertPaper(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`Semantic Scholar arXiv lookup error: ${error}`);
      return null;
    }
  }

  /**
   * Get papers that cite the given paper
   */
  async getCitations(paperId: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<S2CitationResponse>(`/paper/${paperId}/citations`, {
        params: {
          fields: PAPER_FIELDS,
          limit: Math.min(limit, 100)
        }
      });

      return response.data.data
        .filter(c => c.citingPaper && c.citingPaper.title)
        .map(c => this.convertPaper(c.citingPaper));
    } catch (error) {
      console.error(`Semantic Scholar citations error: ${error}`);
      return [];
    }
  }

  /**
   * Get papers referenced by the given paper
   */
  async getReferences(paperId: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<S2ReferenceResponse>(`/paper/${paperId}/references`, {
        params: {
          fields: PAPER_FIELDS,
          limit: Math.min(limit, 100)
        }
      });

      return response.data.data
        .filter(r => r.citedPaper && r.citedPaper.title)
        .map(r => this.convertPaper(r.citedPaper));
    } catch (error) {
      console.error(`Semantic Scholar references error: ${error}`);
      return [];
    }
  }
}
