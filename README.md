# Bibliography MCP Server

A Model Context Protocol (MCP) server for accurate bibliography lookup, verification, and BibTeX generation. Integrates with multiple academic databases to cross-validate citations and prevent AI hallucination of references.

## Features

- **Multi-source Search**: Query Semantic Scholar, CrossRef, DBLP, OpenAlex, and arXiv simultaneously
- **Citation Verification**: Validate citations against real databases with confidence scoring
- **BibTeX Generation**: Generate properly formatted BibTeX entries
- **Cross-validation**: Merge data from multiple sources for accuracy
- **Local Caching**: SQLite-based caching reduces API calls and enables offline lookups

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/bibliography-mcp.git
cd bibliography-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bibliography": {
      "command": "node",
      "args": ["/path/to/bibliography-mcp/dist/index.js"]
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_TRANSPORT` | Transport mode: `stdio`, `http`, or `stdio,http` | `stdio` |
| `PORT` | HTTP server port | `3000` |
| `CACHE_DIR` | Directory for SQLite cache database | `./data` |
| `SEMANTIC_SCHOLAR_API_KEY` | API key for Semantic Scholar (optional, increases rate limits) | - |

## HTTP Streaming (SSE)

The server can run over streaming HTTP using Server-Sent Events (SSE), which is suitable for remote deployments. The server is public and does not require authentication.

### Endpoints
- `GET /health` - health check (returns cache stats and database status)
- `GET /sse` - opens SSE stream and returns a `sessionId`
- `POST /messages?sessionId=...` - JSON-RPC messages for the session

### Example

Open SSE stream and capture `sessionId` from the `endpoint` event:

```bash
curl -N https://your-app/sse
```

Send a request using the `sessionId`:

```bash
curl -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  "https://your-app/messages?sessionId=YOUR_SESSION_ID"
```

## Available Tools

### search_papers
Search for papers by title, topic, or keywords.

```json
{
  "query": "attention is all you need",
  "limit": 10,
  "sources": ["semantic-scholar", "dblp"]
}
```

### search_by_author
Find papers by a specific author.

```json
{
  "author": "Geoffrey Hinton",
  "limit": 10
}
```

### get_paper_by_doi
Look up a paper by DOI (most reliable method).

```json
{
  "doi": "10.1145/1234567.1234568"
}
```

### get_paper_by_arxiv
Look up a paper by arXiv ID.

```json
{
  "arxiv_id": "2301.01234"
}
```

### verify_citation
Verify citation accuracy against databases.

```json
{
  "title": "Attention Is All You Need",
  "authors": ["Vaswani", "Shazeer", "Parmar"],
  "year": 2017,
  "venue": "NeurIPS"
}
```

Returns:
- Verification status and confidence score
- Suggested corrections for any discrepancies
- Warnings about potential issues

### get_bibtex
Generate BibTeX entry for a paper.

```json
{
  "doi": "10.1145/1234567.1234568",
  "custom_key": "vaswani2017attention"
}
```

### get_bibtex_batch
Generate BibTeX entries for multiple papers at once (max 20).

```json
{
  "queries": [
    { "doi": "10.1145/1234567.1234568" },
    { "arxiv_id": "2301.01234" },
    { "title": "Attention Is All You Need", "custom_key": "vaswani2017" }
  ]
}
```

Returns a formatted `.bib` file with all entries.

## Azure Deployment

Deploy to Azure Container Apps for remote access:

```bash
# PowerShell
./infra/deploy.ps1 -ResourceGroup "bibliography-mcp-rg" -Environment "prod"

# Bash
./infra/deploy.sh -g "bibliography-mcp-rg" -e "prod"
```

The Container App exposes streaming HTTP over port `3000` by default.

### Build and Push Container

```bash
# Build
docker build -t bibliography-mcp:latest .

# Tag for Azure Container Registry
docker tag bibliography-mcp:latest your-registry.azurecr.io/bibliography-mcp:v1.0.0

# Push
docker push your-registry.azurecr.io/bibliography-mcp:v1.0.0
```

## Data Sources

| Source | Coverage | Best For |
|--------|----------|----------|
| Semantic Scholar | CS, AI, Medicine | CS papers, citation metrics |
| CrossRef | General | DOI lookups, metadata |
| DBLP | Computer Science | CS conferences/journals |
| OpenAlex | Broad | Open access papers |
| arXiv | Preprints | Latest research, CS/Physics/Math |

## Development

```bash
# Watch mode for development
npm run dev

# Run linting
npm run lint

# Clean build
npm run clean && npm run build
```

## Architecture

```
src/
├── index.ts           # MCP server entry point
├── types.ts           # TypeScript interfaces
├── apis/              # API clients
│   ├── semantic-scholar.ts
│   ├── crossref.ts
│   ├── dblp.ts
│   ├── openalex.ts
│   └── arxiv.ts
├── tools/             # MCP tool implementations
│   ├── search.ts
│   ├── lookup.ts
│   ├── verify.ts
│   └── bibtex.ts
├── cache/
│   └── sqlite.ts      # SQLite caching layer
└── utils/
    ├── bibtex.ts      # BibTeX formatting
    ├── normalize.ts   # Data normalization
    └── similarity.ts  # Fuzzy matching
```

## License

MIT
