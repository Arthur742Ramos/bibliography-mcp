/**
 * CrossRef API client
 * API docs: https://api.crossref.org/swagger-ui/index.html
 */

import axios, { AxiosInstance } from 'axios';
import { Paper, Author, ApiClient, DataSource } from '../types.js';

const BASE_URL = 'https://api.crossref.org';

interface CrossRefAuthor {
  given?: string;
  family?: string;
  name?: string;
  ORCID?: string;
  affiliation?: { name: string }[];
}

interface CrossRefWork {
  DOI: string;
  title?: string[];
  author?: CrossRefAuthor[];
  published?: {
    'date-parts'?: number[][];
  };
  'published-print'?: {
    'date-parts'?: number[][];
  };
  'published-online'?: {
    'date-parts'?: number[][];
  };
  'container-title'?: string[];
  type?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  URL?: string;
  abstract?: string;
  'is-referenced-by-count'?: number;
}

interface CrossRefResponse {
  status: string;
  'message-type': string;
  message: {
    items?: CrossRefWork[];
    'total-results'?: number;
  } & CrossRefWork;
}

export class CrossRefClient implements ApiClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 50; // CrossRef is fairly generous

  constructor(email?: string) {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': `BibliographyMCP/1.0 (${email || 'anonymous'}; mailto:${email || 'anonymous@example.com'})`
    };

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

  private convertWork(work: CrossRefWork): Paper {
    const authors: Author[] = (work.author || []).map(a => {
      const name = a.name || [a.given, a.family].filter(Boolean).join(' ');
      return {
        name,
        firstName: a.given,
        lastName: a.family,
        orcid: a.ORCID,
        affiliations: a.affiliation?.map(aff => aff.name)
      };
    });

    // Get publication date
    const dateSource = work.published || work['published-print'] || work['published-online'];
    const dateParts = dateSource?.['date-parts']?.[0] || [];
    const year = dateParts[0];
    const month = dateParts[1];

    // Determine venue type from CrossRef type
    let venueType: Paper['venueType'] = 'other';
    if (work.type) {
      switch (work.type) {
        case 'journal-article':
          venueType = 'journal';
          break;
        case 'proceedings-article':
        case 'paper-conference':
          venueType = 'conference';
          break;
        case 'book':
        case 'book-chapter':
          venueType = 'book';
          break;
        case 'dissertation':
          venueType = 'thesis';
          break;
      }
    }

    return {
      title: work.title?.[0] || '',
      authors,
      year,
      month,
      venue: work['container-title']?.[0],
      venueType,
      doi: work.DOI,
      url: work.URL,
      volume: work.volume,
      issue: work.issue,
      pages: work.page,
      publisher: work.publisher,
      abstract: work.abstract,
      citations: work['is-referenced-by-count'],
      source: 'crossref' as DataSource
    };
  }

  async searchByTitle(title: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<CrossRefResponse>('/works', {
        params: {
          query: title,
          rows: Math.min(limit, 100),
          select: 'DOI,title,author,published,published-print,published-online,container-title,type,volume,issue,page,publisher,URL,abstract,is-referenced-by-count'
        }
      });

      const items = response.data.message.items || [];
      return items.map(w => this.convertWork(w));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`CrossRef API error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async searchByAuthor(author: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<CrossRefResponse>('/works', {
        params: {
          'query.author': author,
          rows: Math.min(limit, 100),
          select: 'DOI,title,author,published,published-print,published-online,container-title,type,volume,issue,page,publisher,URL,abstract,is-referenced-by-count'
        }
      });

      const items = response.data.message.items || [];
      return items.map(w => this.convertWork(w));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`CrossRef author search error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async getByDoi(doi: string): Promise<Paper | null> {
    await this.rateLimit();

    try {
      const response = await this.client.get<CrossRefResponse>(`/works/${encodeURIComponent(doi)}`);
      return this.convertWork(response.data.message as CrossRefWork);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`CrossRef DOI lookup error: ${error}`);
      return null;
    }
  }
}
