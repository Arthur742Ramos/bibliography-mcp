/**
 * arXiv API client
 * API docs: https://info.arxiv.org/help/api/basics.html
 */

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Paper, Author, ApiClient, DataSource } from '../types.js';

const BASE_URL = 'https://export.arxiv.org/api/query';

interface ArxivAuthor {
  name: string;
  'arxiv:affiliation'?: string | string[];
}

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  author: ArxivAuthor | ArxivAuthor[];
  'arxiv:doi'?: string;
  'arxiv:journal_ref'?: string;
  'arxiv:primary_category'?: {
    '@_term': string;
  };
  category?: { '@_term': string } | { '@_term': string }[];
  link?: { '@_href': string; '@_type'?: string; '@_title'?: string } | { '@_href': string; '@_type'?: string; '@_title'?: string }[];
}

interface ArxivResponse {
  feed: {
    entry?: ArxivEntry | ArxivEntry[];
    'opensearch:totalResults': string;
    'opensearch:startIndex': string;
    'opensearch:itemsPerPage': string;
  };
}

export class ArxivClient implements ApiClient {
  private parser: XMLParser;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 3000; // arXiv requires 3 second delay

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
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

  private extractArxivId(url: string): string {
    // Extract ID from URLs like http://arxiv.org/abs/2301.01234v1
    const match = url.match(/arxiv\.org\/abs\/([^\s?]+)/);
    if (match) {
      return match[1].replace(/v\d+$/, ''); // Remove version
    }
    return url;
  }

  private convertEntry(entry: ArxivEntry): Paper {
    // Handle single or multiple authors
    const authorList = Array.isArray(entry.author) ? entry.author : [entry.author];
    const authors: Author[] = authorList.map(a => {
      const parts = a.name.trim().split(/\s+/);
      const affiliations = a['arxiv:affiliation']
        ? (Array.isArray(a['arxiv:affiliation']) ? a['arxiv:affiliation'] : [a['arxiv:affiliation']])
        : undefined;
      return {
        name: a.name,
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts[parts.length - 1],
        affiliations
      };
    });

    // Extract arXiv ID from the entry ID URL
    const arxivId = this.extractArxivId(entry.id);

    // Parse publication date
    const pubDate = new Date(entry.published);
    const year = pubDate.getFullYear();
    const month = pubDate.getMonth() + 1;

    // Get PDF URL
    let url: string | undefined;
    if (entry.link) {
      const links = Array.isArray(entry.link) ? entry.link : [entry.link];
      const pdfLink = links.find(l => l['@_title'] === 'pdf');
      url = pdfLink?.['@_href'] || links[0]?.['@_href'];
    }

    // Clean up title (remove newlines and extra spaces)
    const title = entry.title.replace(/\s+/g, ' ').trim();

    // Clean up abstract
    const abstract = entry.summary.replace(/\s+/g, ' ').trim();

    return {
      id: arxivId,
      title,
      authors,
      year,
      month,
      venue: 'arXiv',
      venueType: 'arxiv',
      doi: entry['arxiv:doi'],
      arxivId,
      url,
      abstract,
      source: 'arxiv' as DataSource
    };
  }

  async searchByTitle(title: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await axios.get(BASE_URL, {
        params: {
          search_query: `ti:"${title}"`,
          start: 0,
          max_results: Math.min(limit, 100),
          sortBy: 'relevance',
          sortOrder: 'descending'
        },
        timeout: 8000
      });

      const parsed = this.parser.parse(response.data) as ArxivResponse;
      const entries = parsed.feed.entry;

      if (!entries) return [];

      const entryList = Array.isArray(entries) ? entries : [entries];
      return entryList.map(e => this.convertEntry(e));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`arXiv API error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async searchByAuthor(author: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await axios.get(BASE_URL, {
        params: {
          search_query: `au:"${author}"`,
          start: 0,
          max_results: Math.min(limit, 100),
          sortBy: 'submittedDate',
          sortOrder: 'descending'
        },
        timeout: 8000
      });

      const parsed = this.parser.parse(response.data) as ArxivResponse;
      const entries = parsed.feed.entry;

      if (!entries) return [];

      const entryList = Array.isArray(entries) ? entries : [entries];
      return entryList.map(e => this.convertEntry(e));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`arXiv author search error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }

  async getById(arxivId: string): Promise<Paper | null> {
    await this.rateLimit();

    // Normalize arXiv ID
    const normalized = arxivId
      .replace('arXiv:', '')
      .replace(/v\d+$/, ''); // Remove version

    try {
      const response = await axios.get(BASE_URL, {
        params: {
          id_list: normalized,
          max_results: 1
        },
        timeout: 8000
      });

      const parsed = this.parser.parse(response.data) as ArxivResponse;
      const entries = parsed.feed.entry;

      if (!entries) return null;

      const entryList = Array.isArray(entries) ? entries : [entries];
      return entryList.length > 0 ? this.convertEntry(entryList[0]) : null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`arXiv ID lookup error: ${error.response?.status} - ${error.message}`);
      }
      return null;
    }
  }

  // Alias for API client interface
  async getByDoi(_doi: string): Promise<Paper | null> {
    // arXiv doesn't support direct DOI lookup
    // Would need to search by DOI
    return null;
  }

  async searchAll(query: string, limit: number = 10): Promise<Paper[]> {
    await this.rateLimit();

    try {
      const response = await axios.get(BASE_URL, {
        params: {
          search_query: `all:${query}`,
          start: 0,
          max_results: Math.min(limit, 100),
          sortBy: 'relevance',
          sortOrder: 'descending'
        },
        timeout: 8000
      });

      const parsed = this.parser.parse(response.data) as ArxivResponse;
      const entries = parsed.feed.entry;

      if (!entries) return [];

      const entryList = Array.isArray(entries) ? entries : [entries];
      return entryList.map(e => this.convertEntry(e));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`arXiv search error: ${error.response?.status} - ${error.message}`);
      }
      return [];
    }
  }
}
