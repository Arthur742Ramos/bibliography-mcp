/**
 * Lookup tools for retrieving paper by identifier
 */

import { Paper, DataSource } from '../types.js';
import { SemanticScholarClient } from '../apis/semantic-scholar.js';
import { CrossRefClient } from '../apis/crossref.js';
import { OpenAlexClient } from '../apis/openalex.js';
import { ArxivClient } from '../apis/arxiv.js';
import { getCache } from '../cache/sqlite.js';
import { normalizeDoi, getVenueTypePriority } from '../utils/normalize.js';

// Client instances
const semanticScholar = new SemanticScholarClient();
const crossRef = new CrossRefClient();
const openAlex = new OpenAlexClient();
const arxiv = new ArxivClient();

interface LookupResult {
  paper: Paper | null;
  sources: DataSource[];
  merged: boolean;
}

/**
 * Look up a paper by DOI
 */
export async function getByDoi(doi: string): Promise<LookupResult> {
  const normalizedDoi = normalizeDoi(doi);
  const cache = getCache();

  // Check cache first
  const cached = cache.getByDoi(normalizedDoi);
  if (cached) {
    return {
      paper: cached,
      sources: [cached.source],
      merged: false
    };
  }

  // Query multiple sources in parallel for cross-validation
  const [s2Result, crResult, oaResult] = await Promise.allSettled([
    semanticScholar.getByDoi(normalizedDoi),
    crossRef.getByDoi(normalizedDoi),
    openAlex.getByDoi(normalizedDoi)
  ]);

  const papers: Paper[] = [];
  const sources: DataSource[] = [];

  if (s2Result.status === 'fulfilled' && s2Result.value) {
    papers.push(s2Result.value);
    sources.push('semantic-scholar');
  }
  if (crResult.status === 'fulfilled' && crResult.value) {
    papers.push(crResult.value);
    sources.push('crossref');
  }
  if (oaResult.status === 'fulfilled' && oaResult.value) {
    papers.push(oaResult.value);
    sources.push('openalex');
  }

  if (papers.length === 0) {
    return { paper: null, sources: [], merged: false };
  }

  // Merge results from multiple sources
  const merged = papers.reduce((acc, p) => mergePaperData(acc, p));
  merged.doi = normalizedDoi; // Ensure DOI is set

  // Cache the result
  cache.storePaper(merged);

  return {
    paper: merged,
    sources,
    merged: sources.length > 1
  };
}

/**
 * Look up a paper by arXiv ID
 */
export async function getByArxivId(arxivId: string): Promise<LookupResult> {
  // Normalize arXiv ID
  const normalized = arxivId.replace('arXiv:', '').replace(/v\d+$/, '');

  // Query arXiv and Semantic Scholar
  const [arxivResult, s2Result] = await Promise.allSettled([
    arxiv.getById(normalized),
    semanticScholar.getByArxivId(normalized)
  ]);

  const papers: Paper[] = [];
  const sources: DataSource[] = [];

  if (arxivResult.status === 'fulfilled' && arxivResult.value) {
    papers.push(arxivResult.value);
    sources.push('arxiv');
  }
  if (s2Result.status === 'fulfilled' && s2Result.value) {
    papers.push(s2Result.value);
    sources.push('semantic-scholar');
  }

  if (papers.length === 0) {
    return { paper: null, sources: [], merged: false };
  }

  // Merge results
  const merged = papers.reduce((acc, p) => mergePaperData(acc, p));
  merged.arxivId = normalized;

  // Cache the result
  const cache = getCache();
  cache.storePaper(merged);

  return {
    paper: merged,
    sources,
    merged: sources.length > 1
  };
}

/**
 * Merge paper data from multiple sources
 */
function mergePaperData(primary: Paper, secondary: Paper): Paper {
  const primaryPriority = getVenueTypePriority(primary.venueType);
  const secondaryPriority = getVenueTypePriority(secondary.venueType);
  
  return {
    ...primary,
    // Prefer DOI if available and normalize it (primary should already be normalized)
    doi: primary.doi || (secondary.doi ? normalizeDoi(secondary.doi) : undefined),
    arxivId: primary.arxivId || secondary.arxivId,
    // Prefer longer/more complete fields
    title: primary.title.length >= secondary.title.length ? primary.title : secondary.title,
    abstract: (primary.abstract?.length || 0) >= (secondary.abstract?.length || 0)
      ? primary.abstract
      : secondary.abstract,
    // Merge authors - prefer more complete list
    authors: primary.authors.length >= secondary.authors.length
      ? mergeAuthors(primary.authors, secondary.authors)
      : mergeAuthors(secondary.authors, primary.authors),
    // Prefer venue type with higher priority
    venueType: primaryPriority >= secondaryPriority ? primary.venueType : secondary.venueType,
    venue: primary.venue || secondary.venue,
    // Keep higher citation count
    citations: Math.max(primary.citations || 0, secondary.citations || 0),
    // Fill in missing fields
    year: primary.year || secondary.year,
    month: primary.month || secondary.month,
    volume: primary.volume || secondary.volume,
    issue: primary.issue || secondary.issue,
    pages: primary.pages || secondary.pages,
    publisher: primary.publisher || secondary.publisher,
    url: primary.url || secondary.url
  };
}

/**
 * Merge author lists, enriching with ORCID and affiliations
 */
function mergeAuthors(primary: Paper['authors'], secondary: Paper['authors']): Paper['authors'] {
  return primary.map((author, idx) => {
    const secondaryAuthor = secondary[idx];
    if (!secondaryAuthor) return author;

    return {
      ...author,
      orcid: author.orcid || secondaryAuthor.orcid,
      affiliations: author.affiliations?.length
        ? author.affiliations
        : secondaryAuthor.affiliations
    };
  });
}
