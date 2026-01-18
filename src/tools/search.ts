/**
 * Search tools for finding papers
 */

import { Paper, DataSource } from '../types.js';
import { SemanticScholarClient } from '../apis/semantic-scholar.js';
import { CrossRefClient } from '../apis/crossref.js';
import { DBLPClient } from '../apis/dblp.js';
import { OpenAlexClient } from '../apis/openalex.js';
import { ArxivClient } from '../apis/arxiv.js';
import { getCache } from '../cache/sqlite.js';
import { findBestMatch, paperSimilarity } from '../utils/similarity.js';
import { normalizeDoi } from '../utils/normalize.js';

interface SearchOptions {
  limit?: number;
  sources?: DataSource[];
}

interface SearchResult {
  papers: Paper[];
  totalResults: number;
  sourcesQueried: DataSource[];
}

// Client instances
const semanticScholar = new SemanticScholarClient();
const crossRef = new CrossRefClient();
const dblp = new DBLPClient();
const openAlex = new OpenAlexClient();
const arxiv = new ArxivClient();

const DEFAULT_SOURCES: DataSource[] = ['semantic-scholar', 'crossref', 'dblp', 'openalex', 'arxiv'];

/**
 * Search for papers by title or query
 */
export async function searchPapers(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const { limit = 10, sources = DEFAULT_SOURCES } = options;
  const cache = getCache();

  // Check cache for all sources and collect cached results
  const allPapers: Paper[] = [];
  const cachedSources: DataSource[] = [];
  const uncachedSources: DataSource[] = [];

  for (const source of sources) {
    const cached = cache.getSearchResults(query, source);
    if (cached && cached.length > 0) {
      allPapers.push(...cached);
      cachedSources.push(source);
    } else {
      uncachedSources.push(source);
    }
  }

  // If we have all sources cached, return deduplicated results
  if (uncachedSources.length === 0) {
    const deduplicated = deduplicatePapers(allPapers);
    return {
      papers: deduplicated.slice(0, limit),
      totalResults: deduplicated.length,
      sourcesQueried: cachedSources
    };
  }

  // Query uncached APIs in parallel
  const searchPromises: Promise<Paper[]>[] = [];
  const activeSourcesForQuery: DataSource[] = [];

  if (uncachedSources.includes('semantic-scholar')) {
    searchPromises.push(semanticScholar.searchByTitle(query, limit));
    activeSourcesForQuery.push('semantic-scholar');
  }
  if (uncachedSources.includes('crossref')) {
    searchPromises.push(crossRef.searchByTitle(query, limit));
    activeSourcesForQuery.push('crossref');
  }
  if (uncachedSources.includes('dblp')) {
    searchPromises.push(dblp.searchByTitle(query, limit));
    activeSourcesForQuery.push('dblp');
  }
  if (uncachedSources.includes('openalex')) {
    searchPromises.push(openAlex.searchByTitle(query, limit));
    activeSourcesForQuery.push('openalex');
  }
  if (uncachedSources.includes('arxiv')) {
    searchPromises.push(arxiv.searchByTitle(query, limit));
    activeSourcesForQuery.push('arxiv');
  }

  const results = await Promise.allSettled(searchPromises);

  // Collect all successful results from API calls
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allPapers.push(...result.value);
      // Cache successful results
      cache.storeSearchResults(query, activeSourcesForQuery[i], result.value);
    }
  }

  // Deduplicate and merge results (includes both cached and fresh results)
  const deduplicated = deduplicatePapers(allPapers);

  return {
    papers: deduplicated.slice(0, limit),
    totalResults: deduplicated.length,
    sourcesQueried: [...cachedSources, ...activeSourcesForQuery]
  };
}

/**
 * Search for papers by author
 */
export async function searchByAuthor(
  author: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const { limit = 10, sources = DEFAULT_SOURCES } = options;

  // Query APIs in parallel
  const searchPromises: Promise<Paper[]>[] = [];
  const activeSourcesForQuery: DataSource[] = [];

  if (sources.includes('semantic-scholar')) {
    searchPromises.push(semanticScholar.searchByAuthor(author, limit));
    activeSourcesForQuery.push('semantic-scholar');
  }
  if (sources.includes('crossref')) {
    searchPromises.push(crossRef.searchByAuthor(author, limit));
    activeSourcesForQuery.push('crossref');
  }
  if (sources.includes('dblp')) {
    searchPromises.push(dblp.searchByAuthor(author, limit));
    activeSourcesForQuery.push('dblp');
  }
  if (sources.includes('openalex')) {
    searchPromises.push(openAlex.searchByAuthor(author, limit));
    activeSourcesForQuery.push('openalex');
  }
  if (sources.includes('arxiv')) {
    searchPromises.push(arxiv.searchByAuthor(author, limit));
    activeSourcesForQuery.push('arxiv');
  }

  const results = await Promise.allSettled(searchPromises);

  // Collect all successful results
  const allPapers: Paper[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allPapers.push(...result.value);
    }
  }

  // Deduplicate and merge results
  const deduplicated = deduplicatePapers(allPapers);

  return {
    papers: deduplicated.slice(0, limit),
    totalResults: deduplicated.length,
    sourcesQueried: activeSourcesForQuery
  };
}

/**
 * Deduplicate papers by merging similar entries
 */
function deduplicatePapers(papers: Paper[]): Paper[] {
  const uniquePapers: Paper[] = [];
  const seen = new Set<string>();

  for (const paper of papers) {
    // Check by DOI first (most reliable)
    if (paper.doi) {
      const normalizedDoi = normalizeDoi(paper.doi);
      if (seen.has(`doi:${normalizedDoi}`)) {
        // Merge into existing paper
        const existingIdx = uniquePapers.findIndex(p => p.doi && normalizeDoi(p.doi) === normalizedDoi);
        if (existingIdx >= 0) {
          uniquePapers[existingIdx] = mergePapers(uniquePapers[existingIdx], paper);
        }
        continue;
      }
      seen.add(`doi:${normalizedDoi}`);
    }

    // Check by arXiv ID
    if (paper.arxivId) {
      const normalizedArxiv = paper.arxivId.toLowerCase();
      if (seen.has(`arxiv:${normalizedArxiv}`)) {
        const existingIdx = uniquePapers.findIndex(p => p.arxivId?.toLowerCase() === normalizedArxiv);
        if (existingIdx >= 0) {
          uniquePapers[existingIdx] = mergePapers(uniquePapers[existingIdx], paper);
        }
        continue;
      }
      seen.add(`arxiv:${normalizedArxiv}`);
    }

    // Check for similar papers by title
    const match = findBestMatch(paper, uniquePapers, 0.85);
    if (match) {
      const existingIdx = uniquePapers.indexOf(match.paper);
      if (existingIdx >= 0) {
        uniquePapers[existingIdx] = mergePapers(uniquePapers[existingIdx], paper);
      }
      continue;
    }

    uniquePapers.push(paper);
  }

  // Sort by relevance/citations
  uniquePapers.sort((a, b) => (b.citations || 0) - (a.citations || 0));

  return uniquePapers;
}

/**
 * Merge two paper records, preferring more complete data
 */
function mergePapers(existing: Paper, newPaper: Paper): Paper {
  // Venue type priority: journal > conference > workshop > book > thesis > arxiv > other
  const venueTypePriority: Record<string, number> = {
    'journal': 7,
    'conference': 6,
    'workshop': 5,
    'book': 4,
    'thesis': 3,
    'arxiv': 2,
    'other': 1
  };
  
  const existingPriority = venueTypePriority[existing.venueType || 'other'] || 0;
  const newPriority = venueTypePriority[newPaper.venueType || 'other'] || 0;
  
  return {
    ...existing,
    // Prefer DOI if available and normalize it
    doi: existing.doi ? normalizeDoi(existing.doi) : (newPaper.doi ? normalizeDoi(newPaper.doi) : undefined),
    arxivId: existing.arxivId || newPaper.arxivId,
    // Prefer longer/more complete fields
    abstract: (existing.abstract?.length || 0) >= (newPaper.abstract?.length || 0)
      ? existing.abstract
      : newPaper.abstract,
    // Merge authors if more complete
    authors: existing.authors.length >= newPaper.authors.length
      ? existing.authors
      : newPaper.authors,
    // Prefer venue type with higher priority
    venueType: existingPriority >= newPriority ? existing.venueType : newPaper.venueType,
    venue: existing.venue || newPaper.venue,
    // Keep higher citation count
    citations: Math.max(existing.citations || 0, newPaper.citations || 0),
    // Fill in missing fields
    year: existing.year || newPaper.year,
    month: existing.month || newPaper.month,
    volume: existing.volume || newPaper.volume,
    issue: existing.issue || newPaper.issue,
    pages: existing.pages || newPaper.pages,
    publisher: existing.publisher || newPaper.publisher,
    url: existing.url || newPaper.url
  };
}
