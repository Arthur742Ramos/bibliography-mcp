/**
 * SQLite caching layer for bibliography data
 */

import Database from 'better-sqlite3';
import { Paper, DataSource, CacheEntry } from '../types.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = process.env.CACHE_DIR
  ? join(process.env.CACHE_DIR, 'cache.db')
  : join(__dirname, '..', '..', 'data', 'cache.db');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class BibliographyCache {
  private db: Database.Database;
  private ttlMs: number;

  constructor(dbPath: string = DEFAULT_DB_PATH, ttlMs: number = DEFAULT_TTL_MS) {
    // Ensure data directory exists
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.ttlMs = ttlMs;
    this.initialize();
  }

  private initialize(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        doi TEXT,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi);
      CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title);
      CREATE INDEX IF NOT EXISTS idx_papers_source ON papers(source);
      CREATE INDEX IF NOT EXISTS idx_papers_expires ON papers(expires_at);

      CREATE TABLE IF NOT EXISTS search_cache (
        cache_key TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        source TEXT NOT NULL,
        results TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_search_expires ON search_cache(expires_at);
    `);

    // Clean up expired entries on startup
    this.cleanExpired();
  }

  /**
   * Store a paper in the cache
   */
  storePaper(paper: Paper): void {
    const now = Date.now();
    const id = paper.doi || paper.arxivId || `${paper.source}:${this.hashTitle(paper.title)}`;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO papers (id, doi, title, data, source, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      paper.doi || null,
      paper.title.toLowerCase(),
      JSON.stringify(paper),
      paper.source,
      now,
      now + this.ttlMs
    );
  }

  /**
   * Store multiple papers in a transaction
   */
  storePapers(papers: Paper[]): void {
    const transaction = this.db.transaction((papers: Paper[]) => {
      for (const paper of papers) {
        this.storePaper(paper);
      }
    });
    transaction(papers);
  }

  /**
   * Get a paper by DOI
   */
  getByDoi(doi: string): Paper | null {
    const stmt = this.db.prepare(`
      SELECT data FROM papers
      WHERE doi = ? AND expires_at > ?
    `);
    const row = stmt.get(doi, Date.now()) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /**
   * Search papers by title (fuzzy match)
   */
  searchByTitle(title: string, limit: number = 10): Paper[] {
    const normalizedTitle = title.toLowerCase();
    const stmt = this.db.prepare(`
      SELECT data FROM papers
      WHERE title LIKE ? AND expires_at > ?
      LIMIT ?
    `);
    const rows = stmt.all(`%${normalizedTitle}%`, Date.now(), limit) as { data: string }[];
    return rows.map(row => JSON.parse(row.data));
  }

  /**
   * Store search results
   */
  storeSearchResults(query: string, source: DataSource, results: Paper[]): void {
    const now = Date.now();
    const cacheKey = `${source}:${query.toLowerCase()}`;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO search_cache (cache_key, query, source, results, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      cacheKey,
      query,
      source,
      JSON.stringify(results),
      now,
      now + this.ttlMs
    );

    // Also store individual papers
    this.storePapers(results);
  }

  /**
   * Get cached search results
   */
  getSearchResults(query: string, source: DataSource): Paper[] | null {
    const cacheKey = `${source}:${query.toLowerCase()}`;
    const stmt = this.db.prepare(`
      SELECT results FROM search_cache
      WHERE cache_key = ? AND expires_at > ?
    `);
    const row = stmt.get(cacheKey, Date.now()) as { results: string } | undefined;
    return row ? JSON.parse(row.results) : null;
  }

  /**
   * Clean up expired entries
   */
  cleanExpired(): void {
    const now = Date.now();
    this.db.prepare('DELETE FROM papers WHERE expires_at < ?').run(now);
    this.db.prepare('DELETE FROM search_cache WHERE expires_at < ?').run(now);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.db.prepare('DELETE FROM papers').run();
    this.db.prepare('DELETE FROM search_cache').run();
  }

  /**
   * Get cache statistics
   */
  getStats(): { papers: number; searches: number; sizeBytes: number } {
    const paperCount = this.db.prepare('SELECT COUNT(*) as count FROM papers').get() as { count: number };
    const searchCount = this.db.prepare('SELECT COUNT(*) as count FROM search_cache').get() as { count: number };

    // Get approximate size
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;

    return {
      papers: paperCount.count,
      searches: searchCount.count,
      sizeBytes: pageSize * pageCount
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  private hashTitle(title: string): string {
    // Simple hash for creating unique IDs
    let hash = 0;
    const normalized = title.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

// Singleton instance
let cacheInstance: BibliographyCache | null = null;

export function getCache(dbPath?: string): BibliographyCache {
  if (!cacheInstance) {
    cacheInstance = new BibliographyCache(dbPath);
  }
  return cacheInstance;
}

export function closeCache(): void {
  if (cacheInstance) {
    cacheInstance.close();
    cacheInstance = null;
  }
}
