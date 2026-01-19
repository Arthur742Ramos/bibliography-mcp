/**
 * SQLite caching layer for bibliography data
 * Falls back to in-memory mode if disk-based SQLite fails (e.g., on Azure Files)
 */

import Database from 'better-sqlite3';
import { Paper, DataSource, CacheEntry } from '../types.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeDoi } from '../utils/normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = process.env.CACHE_DIR
  ? join(process.env.CACHE_DIR, 'cache.db')
  : join(__dirname, '..', '..', 'data', 'cache.db');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class BibliographyCache {
  private db: Database.Database;
  private ttlMs: number;
  private isInMemory: boolean = false;

  constructor(dbPath: string = DEFAULT_DB_PATH, ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    
    // Try disk-based SQLite first, fall back to in-memory if it fails
    try {
      const dataDir = dirname(dbPath);
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      this.db = new Database(dbPath);
      // Use DELETE journal mode instead of WAL for Azure Files compatibility
      // WAL requires file locking that doesn't work on SMB/network shares
      this.db.pragma('journal_mode = DELETE');
      // Reduce lock contention
      this.db.pragma('busy_timeout = 5000');
      console.error(`Cache initialized at: ${dbPath}`);
    } catch (error) {
      console.error(`Failed to initialize disk cache: ${error}. Falling back to in-memory mode.`);
      this.db = new Database(':memory:');
      this.isInMemory = true;
    }
    
    this.initialize();
  }

  /**
   * Check if cache is running in memory-only mode
   */
  isMemoryMode(): boolean {
    return this.isInMemory;
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
    const normalizedDoi = paper.doi ? normalizeDoi(paper.doi) : null;
    const id = normalizedDoi || paper.arxivId || `${paper.source}:${this.hashTitle(paper.title)}`;

    // Ensure the stored paper has normalized DOI only
    const paperToStore = {
      ...paper,
      doi: normalizedDoi || undefined
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO papers (id, doi, title, data, source, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      normalizedDoi,
      paper.title.toLowerCase(),
      JSON.stringify(paperToStore),
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
    const normalizedDoi = normalizeDoi(doi);
    const stmt = this.db.prepare(`
      SELECT data FROM papers
      WHERE doi = ? AND expires_at > ?
    `);
    const row = stmt.get(normalizedDoi, Date.now()) as { data: string } | undefined;
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
  getStats(): { papers: number; searches: number; sizeBytes: number; inMemory: boolean } {
    const paperCount = this.db.prepare('SELECT COUNT(*) as count FROM papers').get() as { count: number };
    const searchCount = this.db.prepare('SELECT COUNT(*) as count FROM search_cache').get() as { count: number };

    // Get approximate size
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;

    return {
      papers: paperCount.count,
      searches: searchCount.count,
      sizeBytes: pageSize * pageCount,
      inMemory: this.isInMemory
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
