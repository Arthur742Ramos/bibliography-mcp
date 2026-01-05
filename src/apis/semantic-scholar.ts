/**
 * Semantic Scholar API client
 * API docs: https://api.semanticscholar.org/api-docs/
 */

import axios, { AxiosInstance } from 'axios';
import { Paper, Author, ApiClient, DataSource } from '../types.js';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';
const SEARCH_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';

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

export class SemanticScholarClient implements ApiClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // ms between requests

  constructor(apiKey?: string) {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
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

  async searchByTitle(title: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await axios.get<S2SearchResponse>(SEARCH_URL, {
        params: {
          query: title,
          fields: PAPER_FIELDS,
          limit: Math.min(limit, 100)
        },
        timeout: 30000
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
    // Semantic Scholar doesn't have a direct author search for papers
    // We search with the author name as part of the query
    return this.searchByTitle(author, limit);
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
}
