/**
 * Citation and reference lookup tools
 */

import { Paper, DataSource } from '../types.js';
import { SemanticScholarClient } from '../apis/semantic-scholar.js';
import { getCache } from '../cache/sqlite.js';

const semanticScholar = new SemanticScholarClient();

interface CitationResult {
  paper: Paper | null;
  citations: Paper[];
  totalCitations: number;
  source: DataSource;
}

interface ReferenceResult {
  paper: Paper | null;
  references: Paper[];
  totalReferences: number;
  source: DataSource;
}

/**
 * Get papers that cite a given paper
 */
export async function getCitations(options: {
  doi?: string;
  arxivId?: string;
  title?: string;
  limit?: number;
}): Promise<CitationResult> {
  const { doi, arxivId, title, limit = 10 } = options;

  let paper: Paper | null = null;

  // Find the paper first
  if (doi) {
    paper = await semanticScholar.getByDoi(doi);
  } else if (arxivId) {
    paper = await semanticScholar.getByArxivId(arxivId);
  } else if (title) {
    const results = await semanticScholar.searchByTitle(title, 1);
    paper = results[0] || null;
  }

  if (!paper || !paper.id) {
    return {
      paper: null,
      citations: [],
      totalCitations: 0,
      source: 'semantic-scholar'
    };
  }

  // Get citations
  const citations = await semanticScholar.getCitations(paper.id, limit);

  return {
    paper,
    citations,
    totalCitations: paper.citations || citations.length,
    source: 'semantic-scholar'
  };
}

/**
 * Get papers referenced by a given paper
 */
export async function getReferences(options: {
  doi?: string;
  arxivId?: string;
  title?: string;
  limit?: number;
}): Promise<ReferenceResult> {
  const { doi, arxivId, title, limit = 10 } = options;

  let paper: Paper | null = null;

  // Find the paper first
  if (doi) {
    paper = await semanticScholar.getByDoi(doi);
  } else if (arxivId) {
    paper = await semanticScholar.getByArxivId(arxivId);
  } else if (title) {
    const results = await semanticScholar.searchByTitle(title, 1);
    paper = results[0] || null;
  }

  if (!paper || !paper.id) {
    return {
      paper: null,
      references: [],
      totalReferences: 0,
      source: 'semantic-scholar'
    };
  }

  // Get references
  const references = await semanticScholar.getReferences(paper.id, limit);

  return {
    paper,
    references,
    totalReferences: references.length,
    source: 'semantic-scholar'
  };
}
