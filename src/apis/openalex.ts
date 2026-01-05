/**
 * OpenAlex API client
 * API docs: https://docs.openalex.org/
 */

import axios, { AxiosInstance } from 'axios';
import { Paper, Author, ApiClient, DataSource } from '../types.js';

const BASE_URL = 'https://api.openalex.org';

interface OpenAlexAuthor {
  author: {
    id: string;
    display_name: string;
    orcid?: string;
  };
  author_position: string;
  institutions?: {
    display_name: string;
  }[];
  raw_affiliation_strings?: string[];
}

interface OpenAlexLocation {
  source?: {
    id: string;
    display_name: string;
    type?: string;
    issn?: string[];
  };
  pdf_url?: string;
  landing_page_url?: string;
}

interface OpenAlexWork {
  id: string;
  doi?: string;
  title: string;
  display_name: string;
  publication_year?: number;
  publication_date?: string;
  type?: string;
  authorships?: OpenAlexAuthor[];
  primary_location?: OpenAlexLocation;
  locations?: OpenAlexLocation[];
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
  abstract_inverted_index?: Record<string, number[]>;
  cited_by_count?: number;
  open_access?: {
    is_oa: boolean;
    oa_url?: string;
  };
}

interface OpenAlexResponse {
  meta: {
    count: number;
    page: number;
    per_page: number;
  };
  results: OpenAlexWork[];
}

export class OpenAlexClient implements ApiClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100;

  constructor(email?: string) {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `BibliographyMCP/1.0 (mailto:${email || 'anonymous@example.com'})`
      },
      params: email ? { mailto: email } : {}
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

  private reconstructAbstract(invertedIndex: Record<string, number[]>): string {
    // OpenAlex stores abstracts as inverted index for efficiency
    const words: [string, number][] = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        words.push([word, pos]);
      }
    }
    words.sort((a, b) => a[1] - b[1]);
    return words.map(([word]) => word).join(' ');
  }

  private convertWork(work: OpenAlexWork): Paper {
    const authors: Author[] = (work.authorships || []).map(a => {
      const parts = a.author.display_name.split(/\s+/);
      return {
        name: a.author.display_name,
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts[parts.length - 1],
        orcid: a.author.orcid,
        affiliations: a.institutions?.map(i => i.display_name) || a.raw_affiliation_strings
      };
    });

    // Determine venue type
    let venueType: Paper['venueType'] = 'other';
    const sourceType = work.primary_location?.source?.type;
    if (sourceType) {
      switch (sourceType) {
        case 'journal':
          venueType = 'journal';
          break;
        case 'conference':
          venueType = 'conference';
          break;
        case 'repository':
          venueType = 'arxiv';
          break;
        case 'book':
        case 'book-series':
          venueType = 'book';
          break;
      }
    }

    // Extract month from publication date
    let month: number | undefined;
    if (work.publication_date) {
      const match = work.publication_date.match(/-(\d{2})-/);
      if (match) {
        month = parseInt(match[1], 10);
      }
    }

    // Get DOI without URL prefix
    let doi = work.doi;
    if (doi) {
      doi = doi.replace('https://doi.org/', '');
    }

    // Build pages string
    let pages: string | undefined;
    if (work.biblio?.first_page) {
      pages = work.biblio.first_page;
      if (work.biblio.last_page && work.biblio.last_page !== work.biblio.first_page) {
        pages += `-${work.biblio.last_page}`;
      }
    }

    // Get URL
    const url = work.open_access?.oa_url ||
      work.primary_location?.pdf_url ||
      work.primary_location?.landing_page_url;

    // Reconstruct abstract if available
    let abstract: string | undefined;
    if (work.abstract_inverted_index) {
      abstract = this.reconstructAbstract(work.abstract_inverted_index);
    }

    return {
      id: work.id,
      title: work.title || work.display_name,
      authors,
      year: work.publication_year,
      month,
      venue: work.primary_location?.source?.display_name,
      venueType,
      doi,
      url,
      volume: work.biblio?.volume,
      issue: work.biblio?.issue,
      pages,
      abstract,
      citations: work.cited_by_count,
      source: 'openalex' as DataSource
    };
  }

  async searchByTitle(title: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<OpenAlexResponse>('/works', {
        params: {
          search: title,
          per_page: Math.min(limit, 100)
        }
      });

      return response.data.results.map(w => this.convertWork(w));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`OpenAlex API error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async searchByAuthor(author: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await this.client.get<OpenAlexResponse>('/works', {
        params: {
          'filter': `author.search:${author}`,
          per_page: Math.min(limit, 100)
        }
      });

      return response.data.results.map(w => this.convertWork(w));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`OpenAlex author search error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async getByDoi(doi: string): Promise<Paper | null> {
    await this.rateLimit();

    // Normalize DOI
    const normalizedDoi = doi.replace(/^https?:\/\/doi\.org\//i, '');

    try {
      const response = await this.client.get<OpenAlexWork>(`/works/https://doi.org/${normalizedDoi}`);
      return this.convertWork(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`OpenAlex DOI lookup error: ${error}`);
      return null;
    }
  }

  async getById(openAlexId: string): Promise<Paper | null> {
    await this.rateLimit();

    try {
      const response = await this.client.get<OpenAlexWork>(`/works/${openAlexId}`);
      return this.convertWork(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`OpenAlex ID lookup error: ${error}`);
      return null;
    }
  }
}
