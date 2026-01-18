# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ESLint configuration with TypeScript support for better code quality
- Input sanitization functions to prevent XSS attacks
- String length validation to prevent DoS attacks
- BibTeX field sanitization to block LaTeX command injection
- Custom error types: `ValidationError`, `ApiError`, `NotFoundError`, `RateLimitError`
- Enhanced tool descriptions with detailed documentation and usage examples
- Security features documentation in README
- Improved error responses with error codes and tool names

### Changed
- Updated @modelcontextprotocol/sdk to fix high severity ReDoS vulnerability (CVE)
- Enhanced validation with stricter input checks
- Improved BibTeX generation with better LaTeX character escaping
- Better error handling with structured error responses
- Enhanced tool descriptions for `search_papers`, `verify_citation`, and `get_bibtex`

### Security
- Fixed high severity vulnerability in @modelcontextprotocol/sdk (< 1.25.2)
- Added input sanitization for all user inputs
- Added BibTeX injection prevention
- Enhanced validation to prevent malicious inputs
- Added string length limits to prevent resource exhaustion

### Fixed
- Improved LaTeX backslash escaping in BibTeX generation
- Better handling of special characters in BibTeX fields
- Enhanced validation error messages

## [1.0.0] - Initial Release

### Added
- Multi-source bibliography search across Semantic Scholar, CrossRef, DBLP, OpenAlex, and arXiv
- Citation verification with confidence scoring
- BibTeX generation with proper formatting
- Cross-validation and data merging from multiple sources
- SQLite-based caching for improved performance
- HTTP/SSE transport support for remote deployments
- Docker support for containerized deployments
- Azure deployment scripts and documentation
