/**
 * DBLP API client
 * API docs: https://dblp.org/faq/How+to+use+the+dblp+search+API.html
 */

import axios from 'axios';
import { Paper, Author, ApiClient, DataSource } from '../types.js';

const BASE_URL = 'https://dblp.org/search/publ/api';

interface DBLPAuthor {
  '@pid'?: string;
  text: string;
}

interface DBLPHit {
  '@score': string;
  '@id': string;
  info: {
    authors?: {
      author: DBLPAuthor | DBLPAuthor[];
    };
    title: string;
    venue?: string;
    year?: string;
    type?: string;
    doi?: string;
    url?: string;
    pages?: string;
    volume?: string;
    number?: string;
    ee?: string | string[];
  };
}

interface DBLPResponse {
  result: {
    hits?: {
      '@total': string;
      '@computed': string;
      '@sent': string;
      hit?: DBLPHit | DBLPHit[];
    };
    status?: {
      '@code': string;
      text: string;
    };
  };
}

export class DBLPClient implements ApiClient {
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 200; // Be polite to DBLP

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  private convertHit(hit: DBLPHit): Paper {
    const info = hit.info;

    // Handle authors (can be single object or array)
    let authorList: DBLPAuthor[] = [];
    if (info.authors?.author) {
      authorList = Array.isArray(info.authors.author)
        ? info.authors.author
        : [info.authors.author];
    }

    const authors: Author[] = authorList.map(a => {
      const parts = a.text.split(/\s+/);
      return {
        name: a.text,
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts[parts.length - 1]
      };
    });

    // Determine venue type
    let venueType: Paper['venueType'] = 'other';
    if (info.type) {
      switch (info.type) {
        case 'Journal Articles':
          venueType = 'journal';
          break;
        case 'Conference and Workshop Papers':
          venueType = 'conference';
          break;
        case 'Books and Theses':
          venueType = 'book';
          break;
      }
    }

    // Extract URL (DBLP provides multiple electronic editions)
    let url = info.url;
    if (info.ee) {
      const eeList = Array.isArray(info.ee) ? info.ee : [info.ee];
      // Prefer DOI URL
      url = eeList.find(u => u.includes('doi.org')) || eeList[0] || url;
    }

    return {
      id: hit['@id'],
      title: info.title.replace(/\.$/, ''), // Remove trailing period
      authors,
      year: info.year ? parseInt(info.year, 10) : undefined,
      venue: info.venue,
      venueType,
      doi: info.doi,
      url,
      pages: info.pages,
      volume: info.volume,
      issue: info.number,
      source: 'dblp' as DataSource
    };
  }

  async searchByTitle(title: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await axios.get<DBLPResponse>(BASE_URL, {
        params: {
          q: title,
          format: 'json',
          h: Math.min(limit, 100)
        },
        timeout: 8000
      });

      const hits = response.data.result.hits?.hit;
      if (!hits) return [];

      const hitList = Array.isArray(hits) ? hits : [hits];
      return hitList.map(h => this.convertHit(h));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`DBLP API error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async searchByAuthor(author: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      // DBLP author search uses the same endpoint with author: prefix
      const response = await axios.get<DBLPResponse>(BASE_URL, {
        params: {
          q: `author:${author}`,
          format: 'json',
          h: Math.min(limit, 100)
        },
        timeout: 8000
      });

      const hits = response.data.result.hits?.hit;
      if (!hits) return [];

      const hitList = Array.isArray(hits) ? hits : [hits];
      return hitList.map(h => this.convertHit(h));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`DBLP author search error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async getByDoi(doi: string): Promise<Paper | null> {
    // DBLP doesn't have direct DOI lookup, search by DOI instead
    const results = await this.searchByTitle(`doi:${doi}`, 1);
    return results.length > 0 ? results[0] : null;
  }
}
