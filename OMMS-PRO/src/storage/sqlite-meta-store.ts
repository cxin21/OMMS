/**
 * SQLite Meta Store - 基于 SQLite 的元数据索引存储
 * @module storage/sqlite-meta-store
 *
 * 版本: v2.1.0
 * - UID 作为主键
 * - 版本链管理
 * - Palace 层级化存储
 */

import type { MemoryScope, MemoryType, MemoryBlock } from '../types/memory';
import type {
  ISQLiteMetaStore,
  MemoryMetaRecord,
  SQLiteQueryOptions,
  VersionInfo,
} from './types';
import { createLogger, ILogger } from '../logging';
import { FileUtils } from '../utils/file';
import Database from 'better-sqlite3';

const DEFAULT_CONFIG = {
  dbPath: './data/graph/memory_meta.db',
};

/**
 * SQLite Meta Store
 * 负责记忆元数据的索引存储，提供高效的条件过滤查询
 * 支持版本化管理
 */
export class SQLiteMetaStore implements ISQLiteMetaStore {
  private logger: ILogger;
  private db: any; // better-sqlite3 database
  private initialized: boolean;
  private config: typeof DEFAULT_CONFIG;

  constructor(config: Partial<typeof DEFAULT_CONFIG> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('SQLiteMetaStore', { enabled: true });
    this.db = null;
    this.initialized = false;
  }

  /**
   * 初始化数据库连接和表结构
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      await FileUtils.ensureDirectory(this.config.dbPath.replace(/[^/]+$/, ''));

      this.db = new Database(this.config.dbPath);

      // Create table with version support
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_meta (
          uid TEXT PRIMARY KEY,
          version INTEGER NOT NULL DEFAULT 1,

          -- 类型与来源
          agentId TEXT NOT NULL,
          sessionId TEXT,
          type TEXT NOT NULL,

          -- 评分
          importanceScore REAL NOT NULL,
          scopeScore REAL NOT NULL,
          scope TEXT NOT NULL,

          -- Palace 位置 (v2.1.0)
          wingId TEXT NOT NULL,
          hallId TEXT NOT NULL,
          roomId TEXT NOT NULL,
          closetId TEXT NOT NULL,

          -- 版本
          versionChain TEXT NOT NULL DEFAULT '[]',
          isLatestVersion INTEGER NOT NULL DEFAULT 1,
          versionGroupId TEXT NOT NULL,

          -- 其他
          tags TEXT NOT NULL DEFAULT '[]',
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          lastRecalledAt INTEGER,
          recallCount INTEGER NOT NULL DEFAULT 0,

          -- 指向当前版本内容
          currentPalaceRef TEXT NOT NULL
        )
      `);

      // Create indexes for common queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_agentId ON memory_meta(agentId);
        CREATE INDEX IF NOT EXISTS idx_sessionId ON memory_meta(sessionId);
        CREATE INDEX IF NOT EXISTS idx_scope ON memory_meta(scope);
        CREATE INDEX IF NOT EXISTS idx_type ON memory_meta(type);
        CREATE INDEX IF NOT EXISTS idx_createdAt ON memory_meta(createdAt);
        CREATE INDEX IF NOT EXISTS idx_importanceScore ON memory_meta(importanceScore);
        CREATE INDEX IF NOT EXISTS idx_isLatestVersion ON memory_meta(isLatestVersion);
        CREATE INDEX IF NOT EXISTS idx_versionGroupId ON memory_meta(versionGroupId);
        CREATE INDEX IF NOT EXISTS idx_lastRecalledAt ON memory_meta(lastRecalledAt);
        CREATE INDEX IF NOT EXISTS idx_recallCount ON memory_meta(recallCount);
        CREATE INDEX IF NOT EXISTS idx_wingId ON memory_meta(wingId);
        CREATE INDEX IF NOT EXISTS idx_hallId ON memory_meta(hallId);
        CREATE INDEX IF NOT EXISTS idx_roomId ON memory_meta(roomId);
      `);

      this.initialized = true;
      this.logger.info('SQLiteMetaStore initialized', { dbPath: this.config.dbPath });
    } catch (error) {
      this.logger.error('Failed to initialize SQLiteMetaStore', { error });
      throw error;
    }
  }

  /**
   * 插入元数据记录
   */
  async insert(record: MemoryMetaRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO memory_meta (
          uid, version, agentId, sessionId, type, importanceScore, scopeScore, scope,
          wingId, hallId, roomId, closetId,
          versionChain, isLatestVersion, versionGroupId, tags, createdAt, updatedAt, lastRecalledAt, recallCount, currentPalaceRef
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.uid,
        record.version,
        record.agentId,
        record.sessionId ?? null,
        record.type,
        record.importanceScore,
        record.scopeScore,
        record.scope,
        record.palace.wingId,
        record.palace.hallId,
        record.palace.roomId,
        record.palace.closetId,
        JSON.stringify(record.versionChain),
        record.isLatestVersion ? 1 : 0,
        record.versionGroupId,
        JSON.stringify(record.tags),
        record.createdAt,
        record.updatedAt,
        record.lastRecalledAt ?? null,
        record.recallCount ?? 0,
        record.currentPalaceRef
      );

      this.logger.debug('Meta record inserted', { uid: record.uid, versionGroupId: record.versionGroupId });
    } catch (error) {
      this.logger.error('Failed to insert meta record', { uid: record.uid, error });
      throw error;
    }
  }

  /**
   * 批量插入
   */
  async insertBatch(records: MemoryMetaRecord[]): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.db.transaction(() => {
      for (const record of records) {
        const stmt = this.db.prepare(`
          INSERT INTO memory_meta (
            uid, version, agentId, sessionId, type, importanceScore, scopeScore, scope,
            wingId, hallId, roomId, closetId,
            versionChain, isLatestVersion, versionGroupId, tags, createdAt, updatedAt, lastRecalledAt, recallCount, currentPalaceRef
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          record.uid,
          record.version,
          record.agentId,
          record.sessionId ?? null,
          record.type,
          record.importanceScore,
          record.scopeScore,
          record.scope,
          record.palace.wingId,
          record.palace.hallId,
          record.palace.roomId,
          record.palace.closetId,
          JSON.stringify(record.versionChain),
          record.isLatestVersion ? 1 : 0,
          record.versionGroupId,
          JSON.stringify(record.tags),
          record.createdAt,
          record.updatedAt,
          record.lastRecalledAt ?? null,
          record.recallCount ?? 0,
          record.currentPalaceRef
        );
      }
    });

    try {
      transaction();
      this.logger.debug('Meta records batch inserted', { count: records.length });
    } catch (error) {
      this.logger.error('Failed to batch insert meta records', { error });
      throw error;
    }
  }

  /**
   * 更新元数据记录
   */
  async update(uid: string, updates: Partial<MemoryMetaRecord>): Promise<void> {
    await this.ensureInitialized();

    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.version !== undefined) {
        fields.push('version = ?');
        values.push(updates.version);
      }
      if (updates.agentId !== undefined) {
        fields.push('agentId = ?');
        values.push(updates.agentId);
      }
      if (updates.sessionId !== undefined) {
        fields.push('sessionId = ?');
        values.push(updates.sessionId);
      }
      if (updates.scope !== undefined) {
        fields.push('scope = ?');
        values.push(updates.scope);
      }
      if (updates.scopeScore !== undefined) {
        fields.push('scopeScore = ?');
        values.push(updates.scopeScore);
      }
      if (updates.type !== undefined) {
        fields.push('type = ?');
        values.push(updates.type);
      }
      if (updates.importanceScore !== undefined) {
        fields.push('importanceScore = ?');
        values.push(updates.importanceScore);
      }
      if (updates.isLatestVersion !== undefined) {
        fields.push('isLatestVersion = ?');
        values.push(updates.isLatestVersion ? 1 : 0);
      }
      if (updates.versionChain !== undefined) {
        fields.push('versionChain = ?');
        values.push(JSON.stringify(updates.versionChain));
      }
      if (updates.tags !== undefined) {
        fields.push('tags = ?');
        values.push(JSON.stringify(updates.tags));
      }
      if (updates.currentPalaceRef !== undefined) {
        fields.push('currentPalaceRef = ?');
        values.push(updates.currentPalaceRef);
      }
      if (updates.lastRecalledAt !== undefined) {
        fields.push('lastRecalledAt = ?');
        values.push(updates.lastRecalledAt);
      }
      if (updates.recallCount !== undefined) {
        fields.push('recallCount = ?');
        values.push(updates.recallCount);
      }
      if (updates.palace !== undefined) {
        fields.push('wingId = ?');
        values.push(updates.palace.wingId);
        fields.push('hallId = ?');
        values.push(updates.palace.hallId);
        fields.push('roomId = ?');
        values.push(updates.palace.roomId);
        fields.push('closetId = ?');
        values.push(updates.palace.closetId);
      }

      fields.push('updatedAt = ?');
      values.push(Date.now());

      values.push(uid);

      const stmt = this.db.prepare(`
        UPDATE memory_meta SET ${fields.join(', ')} WHERE uid = ?
      `);

      stmt.run(...values);
      this.logger.debug('Meta record updated', { uid });
    } catch (error) {
      this.logger.error('Failed to update meta record', { uid, error });
      throw error;
    }
  }

  /**
   * 删除元数据记录
   */
  async delete(uid: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare('DELETE FROM memory_meta WHERE uid = ?');
      stmt.run(uid);
      this.logger.debug('Meta record deleted', { uid });
    } catch (error) {
      this.logger.error('Failed to delete meta record', { uid, error });
      throw error;
    }
  }

  /**
   * 批量删除
   */
  async deleteBatch(uids: string[]): Promise<void> {
    await this.ensureInitialized();

    if (uids.length === 0) return;

    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare('DELETE FROM memory_meta WHERE uid = ?');
      for (const uid of uids) {
        stmt.run(uid);
      }
    });

    try {
      transaction();
      this.logger.debug('Meta records batch deleted', { count: uids.length });
    } catch (error) {
      this.logger.error('Failed to batch delete meta records', { error });
      throw error;
    }
  }

  /**
   * 条件查询
   */
  async query(options: SQLiteQueryOptions): Promise<MemoryMetaRecord[]> {
    await this.ensureInitialized();

    try {
      const { whereClause, params, orderByClause } = this.buildQuery(options);

      const sql = `
        SELECT * FROM memory_meta
        ${whereClause}
        ${orderByClause}
        ${options.limit ? `LIMIT ${options.limit}` : ''}
        ${options.offset ? `OFFSET ${options.offset}` : ''}
      `;

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);

      return rows.map(this.rowToRecord);
    } catch (error) {
      this.logger.error('Query failed', { error });
      throw error;
    }
  }

  /**
   * 根据 UID 获取记录
   */
  async getById(uid: string): Promise<MemoryMetaRecord | null> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare('SELECT * FROM memory_meta WHERE uid = ?');
      const row = stmt.get(uid);

      return row ? this.rowToRecord(row) : null;
    } catch (error) {
      this.logger.error('Failed to get by uid', { uid, error });
      throw error;
    }
  }

  /**
   * 根据 UIDs 批量获取
   */
  async getByIds(uids: string[]): Promise<MemoryMetaRecord[]> {
    await this.ensureInitialized();

    if (uids.length === 0) return [];

    try {
      const placeholders = uids.map(() => '?').join(',');
      const stmt = this.db.prepare(`SELECT * FROM memory_meta WHERE uid IN (${placeholders})`);
      const rows = stmt.all(...uids);

      return rows.map(this.rowToRecord);
    } catch (error) {
      this.logger.error('Failed to get by uids', { error });
      throw error;
    }
  }

  /**
   * 统计数量
   */
  async count(options?: Partial<SQLiteQueryOptions>): Promise<number> {
    await this.ensureInitialized();

    try {
      const queryOptions: SQLiteQueryOptions = { ...options } as SQLiteQueryOptions;
      const { whereClause, params } = this.buildQuery(queryOptions);

      const sql = `SELECT COUNT(*) as count FROM memory_meta ${whereClause}`;
      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);

      return result.count;
    } catch (error) {
      this.logger.error('Count failed', { error });
      throw error;
    }
  }

  /**
   * 获取版本历史
   */
  async getVersionHistory(uid: string): Promise<VersionInfo[]> {
    const record = await this.getById(uid);
    if (!record) {
      return [];
    }
    return record.versionChain;
  }

  /**
   * 添加新版本
   */
  async addVersion(uid: string, versionInfo: VersionInfo): Promise<void> {
    await this.ensureInitialized();

    try {
      const record = await this.getById(uid);
      if (!record) {
        throw new Error(`Memory not found: ${uid}`);
      }

      const newVersionChain = [...record.versionChain, versionInfo];
      const stmt = this.db.prepare(`
        UPDATE memory_meta SET
          version = ?,
          versionChain = ?,
          isLatestVersion = 1,
          currentPalaceRef = ?,
          updatedAt = ?
        WHERE uid = ?
      `);

      stmt.run(
        versionInfo.version,
        JSON.stringify(newVersionChain),
        versionInfo.palaceRef,
        Date.now(),
        uid
      );

      this.logger.debug('Version added', { uid, version: versionInfo.version });
    } catch (error) {
      this.logger.error('Failed to add version', { uid, error });
      throw error;
    }
  }

  /**
   * 清理旧版本
   */
  async pruneVersions(uid: string, maxVersions: number): Promise<void> {
    await this.ensureInitialized();

    try {
      const record = await this.getById(uid);
      if (!record) {
        return;
      }

      if (record.versionChain.length <= maxVersions) {
        return;
      }

      // 删除超出的旧版本
      const toDelete = record.versionChain.slice(0, record.versionChain.length - maxVersions);
      const newChain = record.versionChain.slice(-maxVersions);

      const stmt = this.db.prepare(`
        UPDATE memory_meta SET
          versionChain = ?,
          updatedAt = ?
        WHERE uid = ?
      `);

      stmt.run(JSON.stringify(newChain), Date.now(), uid);

      this.logger.debug('Versions pruned', { uid, deleted: toDelete.length, remaining: newChain.length });

      // 返回需要删除的 palaceRef 列表（由调用方删除）
      return;
    } catch (error) {
      this.logger.error('Failed to prune versions', { uid, error });
      throw error;
    }
  }

  /**
   * 获取需要删除的旧版本 palaceRefs
   */
  async getOldVersionPalaceRefs(uid: string, maxVersions: number): Promise<string[]> {
    const record = await this.getById(uid);
    if (!record) {
      return [];
    }

    if (record.versionChain.length <= maxVersions) {
      return [];
    }

    return record.versionChain.slice(0, record.versionChain.length - maxVersions).map(v => v.palaceRef);
  }

  /**
   * 构建查询条件
   */
  private buildQuery(options: SQLiteQueryOptions): {
    whereClause: string;
    params: any[];
    orderByClause: string;
  } {
    const conditions: string[] = [];
    const params: any[] = [];

    // UID
    if (options.uid) {
      conditions.push('uid = ?');
      params.push(options.uid);
    }

    // UIDs (IN)
    if (options.uids && options.uids.length > 0) {
      const placeholders = options.uids.map(() => '?').join(',');
      conditions.push(`uid IN (${placeholders})`);
      params.push(...options.uids);
    }

    // agentId
    if (options.agentId) {
      conditions.push('agentId = ?');
      params.push(options.agentId);
    }

    // agentId 不等于
    if (options.agentIdNotEq) {
      conditions.push('agentId != ?');
      params.push(options.agentIdNotEq);
    }

    // sessionId
    if (options.sessionId) {
      conditions.push('sessionId = ?');
      params.push(options.sessionId);
    }

    // scope
    if (options.scope) {
      conditions.push('scope = ?');
      params.push(options.scope);
    }

    // scopes (IN)
    if (options.scopes && options.scopes.length > 0) {
      const placeholders = options.scopes.map(() => '?').join(',');
      conditions.push(`scope IN (${placeholders})`);
      params.push(...options.scopes);
    }

    // type
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    // types (IN)
    if (options.types && options.types.length > 0) {
      const placeholders = options.types.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.types);
    }

    // block
    if (options.block) {
      conditions.push('block = ?');
      params.push(options.block);
    }

    // importance range
    if (options.minImportance !== undefined) {
      conditions.push('importanceScore >= ?');
      params.push(options.minImportance);
    }
    if (options.maxImportance !== undefined) {
      conditions.push('importanceScore <= ?');
      params.push(options.maxImportance);
    }

    // scopeScore range
    if (options.minScopeScore !== undefined) {
      conditions.push('scopeScore >= ?');
      params.push(options.minScopeScore);
    }
    if (options.maxScopeScore !== undefined) {
      conditions.push('scopeScore <= ?');
      params.push(options.maxScopeScore);
    }

    // time range
    if (options.timeRange) {
      conditions.push('createdAt >= ?');
      params.push(options.timeRange.start);
      conditions.push('createdAt <= ?');
      params.push(options.timeRange.end);
    }

    // isLatestVersion
    if (options.isLatestVersion !== undefined) {
      conditions.push('isLatestVersion = ?');
      params.push(options.isLatestVersion ? 1 : 0);
    }

    // tags (JSON array contains)
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        conditions.push("tags LIKE ?");
        params.push(`%"${tag}"%`);
      }
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // order by
    const orderBy = options.orderBy || 'createdAt';
    const orderDir = options.orderDir || 'desc';
    const orderByClause = `ORDER BY ${orderBy} ${orderDir}`;

    return { whereClause, params, orderByClause };
  }

  /**
   * 行数据转换为记录
   */
  private rowToRecord(row: any): MemoryMetaRecord {
    return {
      uid: row.uid,
      version: row.version,
      agentId: row.agentId,
      sessionId: row.sessionId ?? undefined,
      type: row.type as MemoryType,
      importanceScore: row.importanceScore,
      scopeScore: row.scopeScore,
      scope: row.scope as MemoryScope,
      palace: {
        wingId: row.wingId,
        hallId: row.hallId,
        roomId: row.roomId,
        closetId: row.closetId,
      },
      versionChain: JSON.parse(row.versionChain || '[]'),
      isLatestVersion: row.isLatestVersion === 1,
      versionGroupId: row.versionGroupId,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastRecalledAt: row.lastRecalledAt ?? undefined,
      recallCount: row.recallCount ?? 0,
      currentPalaceRef: row.currentPalaceRef,
    };
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.logger.info('SQLiteMetaStore closed');
  }

  /**
   * 获取数据库统计
   */
  async getStats(): Promise<{
    total: number;
    byScope: Record<string, number>;
    byType: Record<string, number>;
  }> {
    await this.ensureInitialized();

    const total = await this.count();

    const scopeStmt = this.db.prepare('SELECT scope, COUNT(*) as count FROM memory_meta GROUP BY scope');
    const scopeRows = scopeStmt.all();
    const byScope: Record<string, number> = {};
    for (const row of scopeRows) {
      byScope[row.scope] = row.count;
    }

    const typeStmt = this.db.prepare('SELECT type, COUNT(*) as count FROM memory_meta GROUP BY type');
    const typeRows = typeStmt.all();
    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    return { total, byScope, byType };
  }
}
