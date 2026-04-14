/**
 * Cache Manager - LRU 缓存管理
 * @module storage/cache-manager
 */

import type { ICacheManager, CacheConfig, CacheStats } from './types';
import { createLogger, ILogger } from '../logging';
import { config } from '../config';

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttl: 3600000, // 1 hour
  evictionPolicy: 'lru',
};

interface CacheEntry {
  memory: any;  // Memory 对象
  accessTime: number;
  accessCount: number;
}

/**
 * LRU Cache implementation for Memory objects
 */
export class CacheManager implements ICacheManager {
  private cache: Map<string, CacheEntry>;
  private config: CacheConfig;
  private logger: ILogger;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  constructor(userConfig: Partial<CacheConfig> = {}) {
    // 如果传入配置则使用，否则从 ConfigManager 获取
    if (userConfig && Object.keys(userConfig).length > 0) {
      this.config = { ...DEFAULT_CACHE_CONFIG, ...userConfig };
    } else {
      try {
        const managerCacheConfig = config.getConfig<{ maxSize: number; ttl: number }>('memoryService.cache');
        this.config = {
          maxSize: managerCacheConfig.maxSize ?? DEFAULT_CACHE_CONFIG.maxSize,
          ttl: managerCacheConfig.ttl ?? DEFAULT_CACHE_CONFIG.ttl,
          evictionPolicy: DEFAULT_CACHE_CONFIG.evictionPolicy,
        };
      } catch {
        // ConfigManager 未初始化，使用默认配置
        this.config = DEFAULT_CACHE_CONFIG;
      }
    }
    this.cache = new Map();
    this.logger = createLogger('CacheManager', { enabled: true });
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get a memory from cache by UID
   */
  async get(uid: string): Promise<any | null> {
    const entry = this.cache.get(uid);

    if (!entry) {
      this.stats.misses++;
      this.logger.debug('Cache miss', { uid });
      return null;
    }

    // Check TTL
    if (Date.now() - entry.accessTime > this.config.ttl) {
      this.cache.delete(uid);
      this.stats.misses++;
      this.logger.debug('Cache expired', { uid });
      return null;
    }

    // Update access metadata (LRU)
    entry.accessTime = Date.now();
    entry.accessCount++;

    this.stats.hits++;
    this.logger.debug('Cache hit', { uid, accessCount: entry.accessCount });
    return entry.memory;
  }

  /**
   * Set a memory in cache
   */
  async set(memory: any): Promise<void> {
    const uid = memory.uid;
    // Check if we need to evict
    if (this.cache.size >= this.config.maxSize && !this.cache.has(uid)) {
      this.evict();
    }

    const entry: CacheEntry = {
      memory,
      accessTime: Date.now(),
      accessCount: 0,
    };

    this.cache.set(uid, entry);
    this.logger.debug('Cache set', { uid, size: this.cache.size });
  }

  /**
   * Delete a memory from cache by UID
   */
  async delete(uid: string): Promise<void> {
    const deleted = this.cache.delete(uid);
    if (deleted) {
      this.logger.debug('Cache delete', { uid });
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * Check if memory exists in cache (without updating access time)
   */
  has(uid: string): boolean {
    return this.cache.has(uid);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Evict the least recently used entry
   */
  private evict(): void {
    if (this.config.evictionPolicy === 'lru') {
      this.evictLRU();
    } else {
      this.evictLFU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [id, entry] of this.cache.entries()) {
      if (entry.accessTime < oldestTime) {
        oldestTime = entry.accessTime;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.cache.delete(oldestId);
      this.stats.evictions++;
      this.logger.debug('LRU eviction', { uid: oldestId });
    }
  }

  /**
   * Evict least frequently used entry
   */
  private evictLFU(): void {
    let leastFreqId: string | null = null;
    let leastFreq = Infinity;

    for (const [id, entry] of this.cache.entries()) {
      if (entry.accessCount < leastFreq) {
        leastFreq = entry.accessCount;
        leastFreqId = id;
      }
    }

    if (leastFreqId) {
      this.cache.delete(leastFreqId);
      this.stats.evictions++;
      this.logger.debug('LFU eviction', { uid: leastFreqId });
    }
  }

  /**
   * Get multiple memories from cache
   */
  async getMany(uids: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();

    for (const uid of uids) {
      const memory = await this.get(uid);
      if (memory) {
        result.set(uid, memory);
      }
    }

    return result;
  }

  /**
   * Set multiple memories in cache
   */
  async setMany(memories: any[]): Promise<void> {
    for (const memory of memories) {
      await this.set(memory);
    }
  }

  /**
   * Delete multiple memories from cache
   */
  async deleteMany(uids: string[]): Promise<void> {
    for (const uid of uids) {
      await this.delete(uid);
    }
  }

  /**
   * Remove memories by filter
   */
  async removeByFilter(filter: (memory: any) => boolean): Promise<number> {
    let removed = 0;

    for (const [uid, entry] of this.cache.entries()) {
      if (filter(entry.memory)) {
        this.cache.delete(uid);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.info('Cache bulk delete', { count: removed });
    }

    return removed;
  }

  /**
   * Get memories sorted by importance
   */
  async getTopByImportance(limit: number): Promise<any[]> {
    const entries = Array.from(this.cache.values());

    entries.sort((a, b) => b.memory.importanceScore - a.memory.importanceScore);

    return entries.slice(0, limit).map(e => e.memory);
  }
}
