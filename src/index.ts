#!/usr/bin/env node
/**
 * Bibliography MCP Server
 *
 * A Model Context Protocol server for accurate bibliography lookup,
 * verification, and BibTeX generation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';

import { searchPapers, searchByAuthor } from './tools/search.js';
import { getByDoi, getByArxivId } from './tools/lookup.js';
import { verifyCitation } from './tools/verify.js';
import { getBibTeX, getBibTeXBatch, formatBibTeXFile } from './tools/bibtex.js';
import { closeCache, getCache } from './cache/sqlite.js';
import { DataSource } from './types.js';
import {
  validateSearchPapers,
  validateSearchByAuthor,
  validateGetByDoi,
  validateGetByArxiv,
  validateVerifyCitation,
  validateGetBibTeX,
  validateGetBibTeXBatch,
  formatValidationErrors
} from './utils/validation.js';

/**
 * Type guard to check if error has a string code property
 */
function hasErrorCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof (error as any).code === 'string';
}

// Tool definitions
const tools: Tool[] = [
  {
    name: 'search_papers',
    description: `Search for academic papers across multiple databases (Semantic Scholar, CrossRef, DBLP, OpenAlex, arXiv).

This tool performs a comprehensive search across multiple academic databases and returns deduplicated results with metadata.

**When to use**: Finding papers by topic, title keywords, author names, or general research queries.

**Returns**: Paper metadata including:
- Title, authors, and publication year
- Venue/conference name and type
- DOI and arXiv ID (when available)
- Citation count and abstract
- URLs for accessing the paper

**Features**:
- Multi-source aggregation with deduplication
- Intelligent merging of metadata from multiple sources
- Local caching for faster repeated searches
- Configurable source selection

**Example queries**: "attention is all you need", "graph neural networks", "transformer architecture"`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (title, topic, or keywords)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10, max: 50)',
          default: 10
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['semantic-scholar', 'crossref', 'dblp', 'openalex', 'arxiv']
          },
          description: 'Specific sources to query (default: all)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_by_author',
    description: `Search for papers by a specific author.
Returns papers authored by the specified person, with metadata from multiple sources.`,
    inputSchema: {
      type: 'object',
      properties: {
        author: {
          type: 'string',
          description: 'Author name to search for'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10, max: 50)',
          default: 10
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['semantic-scholar', 'crossref', 'dblp', 'openalex', 'arxiv']
          },
          description: 'Specific sources to query (default: all)'
        }
      },
      required: ['author']
    }
  },
  {
    name: 'get_paper_by_doi',
    description: `Look up a paper by its DOI (Digital Object Identifier).
This is the most reliable method for finding a specific paper.
Returns complete metadata from multiple sources, merged for accuracy.`,
    inputSchema: {
      type: 'object',
      properties: {
        doi: {
          type: 'string',
          description: 'The DOI of the paper (e.g., "10.1145/1234567.1234568")'
        }
      },
      required: ['doi']
    }
  },
  {
    name: 'get_paper_by_arxiv',
    description: `Look up a paper by its arXiv ID.
Returns complete metadata for arXiv preprints.`,
    inputSchema: {
      type: 'object',
      properties: {
        arxiv_id: {
          type: 'string',
          description: 'The arXiv ID (e.g., "2301.01234" or "arXiv:2301.01234")'
        }
      },
      required: ['arxiv_id']
    }
  },
  {
    name: 'verify_citation',
    description: `Verify the accuracy of a citation against academic databases.

This tool validates citation metadata by cross-referencing it against multiple authoritative sources.

**When to use**: 
- Before including citations in academic papers
- To check if citation details are accurate
- To find missing or incomplete citation information
- To detect potential hallucinations in AI-generated citations

**What it checks**:
- Title accuracy (fuzzy matching with normalization)
- Author list completeness and spelling
- Publication year correctness
- Venue/conference name accuracy
- DOI validity

**Returns**:
- Verification status (verified/unverified)
- Confidence score (0-100%)
- Matched paper from databases
- Suggested corrections for discrepancies
- Warnings about potential issues
- Sources consulted

**Confidence scoring**:
- 90-100%: Highly confident match
- 75-89%: Good match with minor discrepancies
- 60-74%: Possible match, review recommended
- <60%: Low confidence, may be incorrect`,
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The paper title to verify'
        },
        authors: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of author names'
        },
        year: {
          type: 'number',
          description: 'Publication year'
        },
        venue: {
          type: 'string',
          description: 'Publication venue (journal or conference name)'
        },
        doi: {
          type: 'string',
          description: 'DOI if known (provides highest accuracy)'
        },
        arxiv_id: {
          type: 'string',
          description: 'arXiv ID if known'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'get_bibtex',
    description: `Generate a properly formatted BibTeX entry for a paper.

This tool creates publication-ready BibTeX entries with proper LaTeX escaping and formatting.

**When to use**: 
- Creating bibliography files for LaTeX documents
- Generating citations for academic papers
- Converting paper metadata to BibTeX format

**Lookup methods** (in order of reliability):
1. DOI - Most reliable, provides complete metadata
2. arXiv ID - Good for preprints
3. Title search - Fallback option, may need manual verification

**Features**:
- Automatic entry type detection (article, inproceedings, misc, etc.)
- Proper LaTeX character escaping
- Intelligent citation key generation
- Support for custom citation keys
- Multi-source metadata merging
- Complete field population (authors, venue, DOI, abstract, etc.)

**Returns**:
- Formatted BibTeX entry
- Citation key used
- Source databases consulted
- Warnings about missing or incomplete data
- Paper metadata for verification`,
    inputSchema: {
      type: 'object',
      properties: {
        doi: {
          type: 'string',
          description: 'DOI of the paper (most reliable)'
        },
        arxiv_id: {
          type: 'string',
          description: 'arXiv ID of the paper'
        },
        title: {
          type: 'string',
          description: 'Paper title (used if DOI/arXiv not provided)'
        },
        custom_key: {
          type: 'string',
          description: 'Custom citation key to use (optional)'
        }
      }
    }
  },
  {
    name: 'get_bibtex_batch',
    description: `Generate BibTeX entries for multiple papers at once.
Returns a formatted .bib file with all entries.
Maximum 20 papers per request.`,
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          description: 'Array of paper lookup queries',
          items: {
            type: 'object',
            properties: {
              doi: {
                type: 'string',
                description: 'DOI of the paper'
              },
              arxiv_id: {
                type: 'string',
                description: 'arXiv ID of the paper'
              },
              title: {
                type: 'string',
                description: 'Paper title'
              },
              custom_key: {
                type: 'string',
                description: 'Custom citation key'
              }
            }
          },
          maxItems: 20
        }
      },
      required: ['queries']
    }
  }
];

// Create server
const server = new Server(
  {
    name: 'bibliography-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_papers': {
        // Validate input
        const validation = validateSearchPapers(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const query = args?.query as string;
        const limit = Math.min((args?.limit as number) || 10, 50);
        const sources = args?.sources as DataSource[] | undefined;

        const result = await searchPapers(query, { limit, sources });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total: result.totalResults,
                sources_queried: result.sourcesQueried,
                papers: result.papers.map(p => ({
                  title: p.title,
                  authors: p.authors.map(a => a.name),
                  year: p.year,
                  venue: p.venue,
                  doi: p.doi,
                  arxiv_id: p.arxivId,
                  citations: p.citations,
                  url: p.url
                }))
              }, null, 2)
            }
          ]
        };
      }

      case 'search_by_author': {
        // Validate input
        const validation = validateSearchByAuthor(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const author = args?.author as string;
        const limit = Math.min((args?.limit as number) || 10, 50);
        const sources = args?.sources as DataSource[] | undefined;

        const result = await searchByAuthor(author, { limit, sources });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total: result.totalResults,
                sources_queried: result.sourcesQueried,
                papers: result.papers.map(p => ({
                  title: p.title,
                  authors: p.authors.map(a => a.name),
                  year: p.year,
                  venue: p.venue,
                  doi: p.doi,
                  arxiv_id: p.arxivId,
                  citations: p.citations
                }))
              }, null, 2)
            }
          ]
        };
      }

      case 'get_paper_by_doi': {
        // Validate input
        const validation = validateGetByDoi(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const doi = args?.doi as string;
        const result = await getByDoi(doi);

        if (!result.paper) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Paper not found', doi }, null, 2)
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sources: result.sources,
                merged_from_multiple_sources: result.merged,
                paper: {
                  title: result.paper.title,
                  authors: result.paper.authors.map(a => ({
                    name: a.name,
                    orcid: a.orcid,
                    affiliations: a.affiliations
                  })),
                  year: result.paper.year,
                  month: result.paper.month,
                  venue: result.paper.venue,
                  venue_type: result.paper.venueType,
                  doi: result.paper.doi,
                  arxiv_id: result.paper.arxivId,
                  volume: result.paper.volume,
                  issue: result.paper.issue,
                  pages: result.paper.pages,
                  publisher: result.paper.publisher,
                  citations: result.paper.citations,
                  url: result.paper.url,
                  abstract: result.paper.abstract
                }
              }, null, 2)
            }
          ]
        };
      }

      case 'get_paper_by_arxiv': {
        // Validate input
        const validation = validateGetByArxiv(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const arxivId = args?.arxiv_id as string;
        const result = await getByArxivId(arxivId);

        if (!result.paper) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Paper not found', arxiv_id: arxivId }, null, 2)
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sources: result.sources,
                paper: {
                  title: result.paper.title,
                  authors: result.paper.authors.map(a => a.name),
                  year: result.paper.year,
                  venue: result.paper.venue,
                  doi: result.paper.doi,
                  arxiv_id: result.paper.arxivId,
                  abstract: result.paper.abstract,
                  url: result.paper.url
                }
              }, null, 2)
            }
          ]
        };
      }

      case 'verify_citation': {
        // Validate input
        const validation = validateVerifyCitation(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const citation = {
          title: args?.title as string,
          authors: args?.authors as string[] | undefined,
          year: args?.year as number | undefined,
          venue: args?.venue as string | undefined,
          doi: args?.doi as string | undefined,
          arxivId: args?.arxiv_id as string | undefined
        };

        const result = await verifyCitation(citation);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                verified: result.verified,
                confidence: `${(result.confidence * 100).toFixed(1)}%`,
                confidence_score: result.confidence,
                sources_checked: result.sources,
                matched_paper: result.matchedPaper ? {
                  title: result.matchedPaper.title,
                  authors: result.matchedPaper.authors.map(a => a.name),
                  year: result.matchedPaper.year,
                  venue: result.matchedPaper.venue,
                  doi: result.matchedPaper.doi
                } : null,
                corrections: result.corrections,
                warnings: result.warnings
              }, null, 2)
            }
          ]
        };
      }

      case 'get_bibtex': {
        // Validate input
        const validation = validateGetBibTeX(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const options = {
          doi: args?.doi as string | undefined,
          arxivId: args?.arxiv_id as string | undefined,
          title: args?.title as string | undefined,
          customKey: args?.custom_key as string | undefined
        };

        const result = await getBibTeX(options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                entry_key: result.entryKey,
                source: result.source,
                warnings: result.warnings,
                bibtex: result.bibtex,
                paper_info: result.paper ? {
                  title: result.paper.title,
                  authors: result.paper.authors.map(a => a.name),
                  year: result.paper.year,
                  doi: result.paper.doi
                } : null
              }, null, 2)
            }
          ]
        };
      }

      case 'get_bibtex_batch': {
        // Validate input
        const validation = validateGetBibTeXBatch(args as Record<string, unknown>);
        if (!validation.valid) {
          return {
            content: [{ type: 'text', text: formatValidationErrors(validation) }],
            isError: true
          };
        }

        const queries = (args?.queries as Array<{
          doi?: string;
          arxiv_id?: string;
          title?: string;
          custom_key?: string;
        }>).map(q => ({
          doi: q.doi,
          arxivId: q.arxiv_id,
          title: q.title,
          customKey: q.custom_key
        }));

        const results = await getBibTeXBatch(queries);
        const bibFile = formatBibTeXFile(results);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total_entries: results.filter(r => r.bibtex.length > 0).length,
                total_requested: queries.length,
                entries: results.map(r => ({
                  entry_key: r.entryKey,
                  source: r.source,
                  warnings: r.warnings,
                  success: r.bibtex.length > 0
                })),
                bib_file: bibFile
              }, null, 2)
            }
          ]
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2)
            }
          ],
          isError: true
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Safely extract error code using type guard
    const errorCode = hasErrorCode(error) ? error.code : 'UNKNOWN_ERROR';
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ 
            error: errorMessage,
            code: errorCode,
            tool: name
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Cleanup on exit
let httpServer: http.Server | null = null;

process.on('SIGINT', () => {
  if (httpServer) {
    httpServer.close();
  }
  closeCache();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (httpServer) {
    httpServer.close();
  }
  closeCache();
  process.exit(0);
});

// Start server
const DEFAULT_PORT = 3000;

function parseTransportModes(value: string | undefined): string[] {
  if (!value) {
    return ['stdio'];
  }

  return value
    .split(',')
    .map((mode) => mode.trim().toLowerCase())
    .filter(Boolean);
}

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Bibliography MCP Server running on stdio');
}

async function startHttpServer() {
  const transports = new Map<string, SSEServerTransport>();
  const port = Number(process.env.PORT || DEFAULT_PORT);

  httpServer = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check endpoint
    if (method === 'GET' && url.pathname === '/health') {
      try {
        // Verify database connectivity
        const cache = getCache();
        const stats = cache.getStats();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          version: '1.0.0',
          cache: {
            papers: stats.papers,
            searches: stats.searches,
            sizeBytes: stats.sizeBytes
          }
        }));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          message: 'Database connection failed'
        }));
      }
      return;
    }

    if (method === 'GET' && url.pathname === '/sse') {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId || crypto.randomUUID();
      transports.set(sessionId, transport);

      res.on('close', () => {
        transports.delete(sessionId);
      });

      await server.connect(transport);
      return;
    }

    if (method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'sessionId is required' }));
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown sessionId' }));
        return;
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => {
    httpServer?.listen(port, () => resolve());
  });

  console.error(`Bibliography MCP Server listening on http://0.0.0.0:${port}`);
}

async function main() {
  const modes = parseTransportModes(process.env.MCP_TRANSPORT);
  const supportedModes = new Set(['stdio', 'http']);
  const selectedModes = modes.filter((mode) => supportedModes.has(mode));

  if (selectedModes.length === 0) {
    throw new Error('No valid MCP_TRANSPORT specified. Use "stdio", "http", or "stdio,http".');
  }

  if (selectedModes.includes('stdio')) {
    await startStdioServer();
  }

  if (selectedModes.includes('http')) {
    await startHttpServer();
  }
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
