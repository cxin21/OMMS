/**
 * Memory Store Manager - 存储协调类
 * @module memory-service/memory-store-manager
 *
 * 版本: v2.1.0
 * - 集成版本管理（MemoryVersionManager）
 * - 支持相似度检测和版本创建
 * - Palace 层级化存储
 */

import type { Memory, MemoryInput } from '../types/memory';
import { MemoryType, MemoryScope, MemoryBlock } from '../types/memory';
import type {
  ICacheManager,
  IVectorStore,
  ISQLiteMetaStore,
  IPalaceStore,
  IGraphStore,
  VectorDocument,
  MemoryMetaRecord,
  PalaceMetadata,
  PalaceLocation,
} from '../storage/types';
import { PalaceStore } from '../storage/palace-store';
import { IDGenerator } from '../utils/id-generator';
import { createLogger } from '../logging';
import type { ILogger } from '../logging';
import { MemoryVersionManager } from './memory-version-manager';

/**
 * MemoryStoreManager
 * 协调各存储层，将记忆写入 Cache、VectorDB、SQLite、Palace、Graph
 */
export class MemoryStoreManager {
  private logger: ILogger;
  private cache: ICacheManager;
  private vectorStore: IVectorStore;
  private metaStore: ISQLiteMetaStore;
  private palaceStore: IPalaceStore;
  private graphStore: IGraphStore;
  private embedder: (text: string) => Promise<number[]>;
  private versionManager: MemoryVersionManager;

  constructor(
    cache: ICacheManager,
    vectorStore: IVectorStore,
    metaStore: ISQLiteMetaStore,
    palaceStore: IPalaceStore,
    graphStore: IGraphStore,
    embedder: (text: string) => Promise<number[]>,
    versionManager?: MemoryVersionManager
  ) {
    this.cache = cache;
    this.vectorStore = vectorStore;
    this.metaStore = metaStore;
    this.palaceStore = palaceStore;
    this.graphStore = graphStore;
    this.embedder = embedder;
    this.logger = createLogger('MemoryStoreManager');

    // 初始化版本管理器
    this.versionManager = versionManager || new MemoryVersionManager(
      cache,
      vectorStore,
      metaStore,
      palaceStore,
      graphStore,
      embedder
    );
  }

  /**
   * 存储记忆 - 协调各存储层
   *
   * 版本: v2.1.0
   * - 支持版本检测：新内容与已有记忆相似度 >= 90% 时创建新版本
   * - 版本创建使用 UID 互换机制
   * - Palace 层级化存储
   */
  async store(input: MemoryInput, scores: { importance: number; scopeScore: number }): Promise<Memory> {
    const now = Date.now();

    // 1. 检测是否为新版本
    const versionDetection = await this.versionManager.detectVersion(input.content, {
      agentId: input.metadata?.agentId,
      type: input.type,
    });

    // 2. 如果是已有记忆的新版本，执行版本创建
    if (versionDetection.isNewVersion && versionDetection.shouldReplace && versionDetection.existingMemoryId) {
      const summary = this.generateSummary(input.content);

      const versionResult = await this.versionManager.createVersion(
        versionDetection.existingMemoryId,
        input.content,
        summary,
        scores,
        {
          createdAt: now,
          updatedAt: now,
          originalSize: input.content.length,
          compressed: false,
          encrypted: false,
        }
      );

      // 解析 palaceRef 获取 palace 位置
      const palaceInfo = PalaceStore.parsePalaceRef(versionResult.palaceRef);
      const palace = palaceInfo?.location || {
        wingId: 'agent_default',
        hallId: input.type.toLowerCase(),
        roomId: 'room_default',
        closetId: `closet_${versionResult.newMemoryId}`,
      };

      // 确定新版本的作用域和区块（继承自旧版本，或根据评分计算）
      const combined = (scores.importance + scores.scopeScore) / 2;
      const newScope = this.determineScope(combined);
      const newBlock = this.determineBlock(scores.importance);

      // 返回新版本记忆
      return {
        uid: versionResult.newMemoryId,
        content: input.content,
        summary,
        type: input.type,
        agentId: input.metadata?.agentId || 'default',
        importance: scores.importance,
        scopeScore: scores.scopeScore,
        scope: newScope,
        block: newBlock,
        palace,
        version: versionResult.version,
        isLatestVersion: true,
        versionChain: [{
          version: versionResult.version,
          palaceRef: versionResult.palaceRef,
          createdAt: now,
          summary,
          contentLength: input.content.length,
        }],
        accessCount: 0,
        lastAccessedAt: now,
        usedByAgents: [input.metadata?.agentId || 'default'],
        createdAt: now,
        updatedAt: now,
        metadata: {},
        tags: input.metadata?.tags || [],
        lifecycle: {
          createdAt: now,
          events: [{
            type: 'created',
            timestamp: now,
            details: { palaceRef: versionResult.palaceRef, isVersion: true },
          }],
        },
      };
    }

    // 3. 新建记忆
    const memoryId = IDGenerator.generate('memory');
    const now2 = Date.now();

    // Determine scope based on scores
    const combined = (scores.importance + scores.scopeScore) / 2;
    const scope = this.determineScope(combined);

    // Profile types (IDENTITY/PREFERENCE/PERSONA) always use CORE block
    const isProfileType = [
      MemoryType.IDENTITY,
      MemoryType.PREFERENCE,
      MemoryType.PERSONA,
    ].includes(input.type);
    const block = isProfileType
      ? MemoryBlock.CORE
      : this.determineBlock(scores.importance);

    // Generate summary (simplified, should use LLM in production)
    const summary = this.generateSummary(input.content);

    // Calculate palace location
    const palaceLocation = this.calculatePalaceLocation(
      input.type,
      scope,
      input.metadata?.agentId || 'default',
      input.metadata?.sessionId
    );

    // Generate palaceRef using new format
    const palaceRef = PalaceStore.generatePalaceRef(palaceLocation, memoryId, 1);

    // 4. Prepare palace metadata
    const palaceMetadata: PalaceMetadata = {
      uid: memoryId,
      version: 1,
      createdAt: now2,
      updatedAt: now2,
      originalSize: input.content.length,
      compressed: false,
      encrypted: false,
    };

    // 5. Prepare meta record for SQLite
    const metaRecord: MemoryMetaRecord = {
      uid: memoryId,
      version: 1,
      agentId: input.metadata?.agentId || 'default',
      sessionId: input.metadata?.sessionId,
      type: input.type,
      importanceScore: scores.importance,
      scopeScore: scores.scopeScore,
      scope,
      palace: palaceLocation,
      versionChain: [
        {
          version: 1,
          palaceRef,
          createdAt: now2,
          summary,
          contentLength: input.content.length,
        },
      ],
      isLatestVersion: true,
      versionGroupId: memoryId,
      tags: input.metadata?.tags || [],
      createdAt: now2,
      updatedAt: now2,
      recallCount: 0,
      currentPalaceRef: palaceRef,
    };

    // 6. Prepare vector document
    const vector = await this.embedder(summary);
    const vectorDoc: VectorDocument = {
      id: memoryId,
      vector,
      text: summary,
      metadata: {
        uid: memoryId,
        type: input.type,
        scope,
        importanceScore: scores.importance,
        scopeScore: scores.scopeScore,
        agentId: input.metadata?.agentId || 'default',
        sessionId: input.metadata?.sessionId,
        tags: input.metadata?.tags || [],
        createdAt: now2,
        palaceRef,
        version: 1,
        isLatestVersion: true,
        versionGroupId: memoryId,
        summary,
      },
    };

    // 7. Build memory object
    const memory: Memory = {
      uid: memoryId,
      version: 1,
      content: input.content,
      summary,
      type: input.type,
      agentId: input.metadata?.agentId || 'default',
      importance: scores.importance,
      scopeScore: scores.scopeScore,
      scope,
      block,
      palace: palaceLocation,
      isLatestVersion: true,
      versionChain: [{
        version: 1,
        palaceRef,
        createdAt: now2,
        summary,
        contentLength: input.content.length,
      }],
      accessCount: 0,
      lastAccessedAt: now2,
      usedByAgents: [input.metadata?.agentId || 'default'],
      createdAt: now2,
      updatedAt: now2,
      metadata: {},
      tags: input.metadata?.tags || [],
      lifecycle: {
        createdAt: now2,
        events: [{
          type: 'created',
          timestamp: now2,
          details: { palaceRef },
        }],
      },
    };

    // 8. Write to all stores in parallel
    await Promise.all([
      // Cache
      this.cache.set(memory),

      // VectorDB
      this.vectorStore.store(vectorDoc),

      // SQLite meta
      this.metaStore.insert(metaRecord),

      // Palace (archive)
      this.palaceStore.store(palaceRef, input.content, palaceMetadata),
    ]);

    this.logger.info('Memory stored via MemoryStoreManager', {
      memoryId,
      scope,
      importance: scores.importance,
      isNewVersion: false,
      palaceRef,
    });

    return memory;
  }

  /**
   * 删除记忆
   */
  async delete(memoryId: string): Promise<void> {
    // Get meta to find palaceRef
    const meta = await this.metaStore.getById(memoryId);
    if (!meta) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    await Promise.all([
      this.cache.delete(memoryId),
      this.vectorStore.delete(memoryId),
      this.metaStore.delete(memoryId),
      this.palaceStore.delete(meta.currentPalaceRef),
      this.graphStore.removeMemory(memoryId),
    ]);

    this.logger.info('Memory deleted via MemoryStoreManager', { memoryId, palaceRef: meta.currentPalaceRef });
  }

  /**
   * 更新记忆
   */
  async update(
    memoryId: string,
    updates: Partial<{
      content: string;
      importanceScore: number;
      scopeScore: number;
      scope: MemoryScope;
      block: MemoryBlock;
      tags: string[];
    }>
  ): Promise<void> {
    const now = Date.now();

    // Get existing meta
    const existingMeta = await this.metaStore.getById(memoryId);
    if (!existingMeta) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    // Update SQLite meta
    const metaUpdates: Partial<MemoryMetaRecord> = {
      updatedAt: now,
    };

    if (updates.importanceScore !== undefined) {
      metaUpdates.importanceScore = updates.importanceScore;
    }
    if (updates.scopeScore !== undefined) {
      metaUpdates.scopeScore = updates.scopeScore;
    }
    if (updates.scope !== undefined) {
      metaUpdates.scope = updates.scope;
    }
    // Note: block is not stored in MemoryMetaRecord, it's computed from importanceScore
    if (updates.tags !== undefined) {
      metaUpdates.tags = updates.tags;
    }

    await this.metaStore.update(memoryId, metaUpdates);

    // Update Palace content if content changed
    if (updates.content) {
      await this.palaceStore.store(
        existingMeta.currentPalaceRef,
        updates.content,
        {
          uid: memoryId,
          version: existingMeta.version,
          createdAt: existingMeta.createdAt,
          updatedAt: now,
          originalSize: updates.content.length,
          compressed: false,
          encrypted: false,
        }
      );
    }

    // Update Vector metadata
    await this.vectorStore.updateMetadata(memoryId, {
      importanceScore: updates.importanceScore ?? existingMeta.importanceScore,
      scopeScore: updates.scopeScore ?? existingMeta.scopeScore,
      scope: updates.scope ?? existingMeta.scope,
      tags: updates.tags ?? existingMeta.tags,
    });

    // Invalidate cache
    await this.cache.delete(memoryId);

    this.logger.info('Memory updated via MemoryStoreManager', { memoryId });
  }

  /**
   * 根据 scope 确定 MemoryScope 枚举值
   */
  private determineScope(combinedScore: number): MemoryScope {
    if (combinedScore >= 7) {
      return MemoryScope.GLOBAL;
    } else if (combinedScore >= 4) {
      return MemoryScope.AGENT;
    } else {
      return MemoryScope.SESSION;
    }
  }

  /**
   * 根据 importance 确定 MemoryBlock
   * 保护等级: importance >= 7 存入 CORE block
   */
  private determineBlock(importance: number): MemoryBlock {
    if (importance >= 7) {
      return MemoryBlock.CORE;
    } else if (importance >= 4) {
      return MemoryBlock.SESSION;
    } else if (importance >= 2) {
      return MemoryBlock.WORKING;
    } else if (importance >= 1) {
      return MemoryBlock.ARCHIVED;
    } else {
      return MemoryBlock.DELETED;
    }
  }

  /**
   * 生成摘要（简化版本）
   */
  private generateSummary(content: string): string {
    // Simple truncation for now, should use LLM in production
    const maxLength = 200;
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '...';
  }

  /**
   * 获取版本管理器
   */
  getVersionManager(): MemoryVersionManager {
    return this.versionManager;
  }

  // ============================================================
  // Palace 位置计算
  // ============================================================

  /**
   * 计算 Palace 位置
   *
   * 注意: closetId 由 PalaceStore.generatePalaceRef 根据 uid 和 version 自动生成
   *
   * @param type - 记忆类型 (决定 Hall)
   * @param scope - 作用域 (决定 Wing)
   * @param agentId - Agent ID
   * @param sessionId - 会话 ID (可选)
   * @param tags - 标签 (可选，用于 Room)
   */
  calculatePalaceLocation(
    type: MemoryType,
    scope: MemoryScope,
    agentId: string,
    sessionId?: string,
    tags?: string[]
  ): PalaceLocation {
    // Profile types use dedicated wing/hall/room
    const isProfileType = [
      MemoryType.IDENTITY,
      MemoryType.PREFERENCE,
      MemoryType.PERSONA,
    ].includes(type);

    // Wing: Profile types always use wing_profile; others based on scope
    const wingId = isProfileType
      ? 'wing_profile'
      : scope === MemoryScope.SESSION
        ? `session_${sessionId || 'default'}`
        : scope === MemoryScope.GLOBAL
          ? 'global'
          : `agent_${agentId}`;

    // Hall: Profile types use hall_profile; others based on type
    const hallId = isProfileType ? 'hall_profile' : type.toLowerCase();

    // Room: Profile types use room_{type}; others based on tags or default
    const roomId = isProfileType
      ? `room_${type.toLowerCase()}`
      : tags?.length
        ? `room_${tags[0].replace(/[^a-zA-Z0-9]/g, '_')}`
        : 'room_default';

    // Closet: 占位符，会在 generatePalaceRef 时被 uid 和 version 替换
    const closetId = 'closet_placeholder';

    return { wingId, hallId, roomId, closetId };
  }
}
