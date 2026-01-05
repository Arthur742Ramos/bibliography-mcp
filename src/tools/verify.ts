/**
 * Citation verification tool
 */

import { Paper, Author, VerificationResult, DataSource } from '../types.js';
import { searchPapers } from './search.js';
import { getByDoi, getByArxivId } from './lookup.js';
import {
  titleSimilarity,
  authorsSimilarity,
  venueSimilarity,
  findBestMatch
} from '../utils/similarity.js';
import { normalizeDoi, normalizeAuthorName } from '../utils/normalize.js';

interface CitationInput {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxivId?: string;
}

/**
 * Verify a citation against known databases
 */
export async function verifyCitation(citation: CitationInput): Promise<VerificationResult> {
  const result: VerificationResult = {
    verified: false,
    confidence: 0,
    corrections: {},
    sources: [],
    warnings: []
  };

  // If DOI provided, use it for direct lookup (most reliable)
  if (citation.doi) {
    const doiLookup = await getByDoi(citation.doi);
    if (doiLookup.paper) {
      result.matchedPaper = doiLookup.paper;
      result.sources = doiLookup.sources;
      result.verified = true;
      result.confidence = 0.99; // DOI match is very high confidence

      // Check for discrepancies
      checkAndAddCorrections(citation, doiLookup.paper, result);
      return result;
    } else {
      result.warnings.push(`DOI "${citation.doi}" not found in any database`);
    }
  }

  // If arXiv ID provided, use it for lookup
  if (citation.arxivId) {
    const arxivLookup = await getByArxivId(citation.arxivId);
    if (arxivLookup.paper) {
      result.matchedPaper = arxivLookup.paper;
      result.sources = arxivLookup.sources;
      result.verified = true;
      result.confidence = 0.95; // arXiv ID match is high confidence

      checkAndAddCorrections(citation, arxivLookup.paper, result);
      return result;
    } else {
      result.warnings.push(`arXiv ID "${citation.arxivId}" not found`);
    }
  }

  // Search by title
  const searchResults = await searchPapers(citation.title, { limit: 10 });
  result.sources = searchResults.sourcesQueried;

  if (searchResults.papers.length === 0) {
    result.warnings.push('No papers found matching the title');
    return result;
  }

  // Convert citation to Paper format for comparison
  const citationAsPaper: Partial<Paper> = {
    title: citation.title,
    authors: citation.authors?.map(name => ({
      name: normalizeAuthorName(name)
    })) || [],
    year: citation.year,
    venue: citation.venue
  };

  // Find best match
  const match = findBestMatch(citationAsPaper, searchResults.papers, 0.6);

  if (!match) {
    result.warnings.push('No sufficiently similar paper found');
    // Return the closest match anyway for user to review
    if (searchResults.papers.length > 0) {
      result.matchedPaper = searchResults.papers[0];
      result.confidence = calculateConfidence(citationAsPaper, searchResults.papers[0]);
      checkAndAddCorrections(citation, searchResults.papers[0], result);
    }
    return result;
  }

  result.matchedPaper = match.paper;
  result.confidence = match.similarity;
  result.verified = match.similarity >= 0.75;

  // Add corrections for any discrepancies
  checkAndAddCorrections(citation, match.paper, result);

  // Add warnings for low confidence matches
  if (match.similarity < 0.75) {
    result.warnings.push(`Low confidence match (${(match.similarity * 100).toFixed(1)}%)`);
  }

  return result;
}

/**
 * Check for discrepancies and add corrections
 */
function checkAndAddCorrections(
  citation: CitationInput,
  paper: Paper,
  result: VerificationResult
): void {
  // Title check
  const titleSim = titleSimilarity(citation.title, paper.title);
  if (titleSim < 0.95) {
    result.corrections.title = {
      original: citation.title,
      suggested: paper.title
    };
    if (titleSim < 0.8) {
      result.warnings.push('Title differs significantly from database record');
    }
  }

  // Author check
  if (citation.authors && citation.authors.length > 0) {
    const citationAuthors: Author[] = citation.authors.map(name => ({
      name: normalizeAuthorName(name)
    }));
    const authorSim = authorsSimilarity(citationAuthors, paper.authors);

    if (authorSim < 0.9) {
      result.corrections.authors = {
        original: citation.authors,
        suggested: paper.authors.map(a => a.name)
      };
      if (authorSim < 0.7) {
        result.warnings.push('Author list differs significantly');
      }
    }
  } else if (paper.authors.length > 0) {
    // No authors provided, suggest them
    result.corrections.authors = {
      original: [],
      suggested: paper.authors.map(a => a.name)
    };
  }

  // Year check
  if (citation.year && paper.year && citation.year !== paper.year) {
    result.corrections.year = {
      original: citation.year,
      suggested: paper.year
    };
    if (Math.abs(citation.year - paper.year) > 1) {
      result.warnings.push(`Year differs by ${Math.abs(citation.year - paper.year)} years`);
    }
  } else if (!citation.year && paper.year) {
    result.corrections.year = {
      original: 0,
      suggested: paper.year
    };
  }

  // Venue check
  if (citation.venue && paper.venue) {
    const venueSim = venueSimilarity(citation.venue, paper.venue);
    if (venueSim < 0.8) {
      result.corrections.venue = {
        original: citation.venue,
        suggested: paper.venue
      };
    }
  } else if (!citation.venue && paper.venue) {
    result.corrections.venue = {
      original: '',
      suggested: paper.venue
    };
  }

  // DOI check
  if (citation.doi && paper.doi) {
    const normalizedCitationDoi = normalizeDoi(citation.doi);
    const normalizedPaperDoi = normalizeDoi(paper.doi);
    if (normalizedCitationDoi !== normalizedPaperDoi) {
      result.corrections.doi = {
        original: citation.doi,
        suggested: paper.doi
      };
      result.warnings.push('DOI mismatch');
    }
  } else if (!citation.doi && paper.doi) {
    result.corrections.doi = {
      original: '',
      suggested: paper.doi
    };
  }
}

/**
 * Calculate confidence score for a match
 */
function calculateConfidence(citation: Partial<Paper>, paper: Paper): number {
  let score = 0;
  let weights = 0;

  // Title (40% weight)
  const titleSim = titleSimilarity(citation.title || '', paper.title);
  score += titleSim * 0.4;
  weights += 0.4;

  // Authors (30% weight)
  if (citation.authors && citation.authors.length > 0) {
    const authorSim = authorsSimilarity(citation.authors, paper.authors);
    score += authorSim * 0.3;
    weights += 0.3;
  }

  // Year (15% weight)
  if (citation.year && paper.year) {
    const yearScore = citation.year === paper.year ? 1 : (Math.abs(citation.year - paper.year) <= 1 ? 0.5 : 0);
    score += yearScore * 0.15;
    weights += 0.15;
  }

  // Venue (15% weight)
  if (citation.venue && paper.venue) {
    const venueSim = venueSimilarity(citation.venue, paper.venue);
    score += venueSim * 0.15;
    weights += 0.15;
  }

  return weights > 0 ? score / weights : 0;
}
