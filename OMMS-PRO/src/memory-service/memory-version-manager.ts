/**
 * Memory Version Manager - 记忆版本管理
 * @module memory-service/memory-version-manager
 *
 * 版本: v2.1.0
 * - UID 互换机制：新版本继承旧 UID，旧版本获得新 UID
 * - 向量相似度 >= 90% 判定为新版本
 * - 版本链管理，支持回滚
 * - 旧版本清理（保留 maxVersions 个）
 * - Palace 层级化存储
 */

import { MemoryType, MemoryScope, MemoryBlock, VersionInfo } from '../types/memory';
import type {
  ICacheManager,
  IVectorStore,
  ISQLiteMetaStore,
  IPalaceStore,
  IGraphStore,
  MemoryMetaRecord,
  VectorDocument,
  VectorSearchOptions,
  GraphNodeRecord,
  GraphEdgeRecord,
  PalaceLocation,
} from '../storage/types';
import { PalaceStore } from '../storage/palace-store';
import { IDGenerator } from '../utils/id-generator';
import { createLogger } from '../logging';
import type { ILogger } from '../logging';

const DEFAULT_CONFIG = {
  similarityThreshold: 0.9,  // 90% 相似度阈值
  maxVersions: 3,             // 最多保留版本数
  enableVersioning: true,      // 是否启用版本管理
};

/**
 * 版本检测结果
 */
export interface VersionDetectionResult {
  isNewVersion: boolean;       // 是否是新版本
  existingMemoryId: string | null;  // 匹配的已有记忆 UID
  similarity: number;           // 相似度
  shouldReplace: boolean;       // 是否应该替换
}

/**
 * 版本创建结果
 */
export interface VersionCreateResult {
  success: boolean;
  newMemoryId: string;         // 新记忆 UID（新版本继承旧 UID）
  oldMemoryId: string;         // 旧记忆 UID（旧版本获得新 UID）
  version: number;              // 新版本号
  palaceRef: string;            // palace_{uid}_v{version}
}

/**
 * 回滚结果
 */
export interface RollbackResult {
  success: boolean;
  targetVersion: number;       // 回滚到的版本
  currentMemoryId: string;      // 回滚后的当前版本 UID
  previousMemoryId: string;    // 替换为旧版的 UID
}

/**
 * MemoryVersionManager
 * 负责记忆的版本化管理
 */
export class MemoryVersionManager {
  private logger: ILogger;
  private config: typeof DEFAULT_CONFIG;

  private cache: ICacheManager;
  private vectorStore: IVectorStore;
  private metaStore: ISQLiteMetaStore;
  private palaceStore: IPalaceStore;
  private graphStore: IGraphStore;
  private embedder: (text: string) => Promise<number[]>;

  constructor(
    cache: ICacheManager,
    vectorStore: IVectorStore,
    metaStore: ISQLiteMetaStore,
    palaceStore: IPalaceStore,
    graphStore: IGraphStore,
    embedder: (text: string) => Promise<number[]>,
    config?: Partial<typeof DEFAULT_CONFIG>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('MemoryVersionManager');

    this.cache = cache;
    this.vectorStore = vectorStore;
    this.metaStore = metaStore;
    this.palaceStore = palaceStore;
    this.graphStore = graphStore;
    this.embedder = embedder;
  }

  /**
   * 检测是否为新版本
   * 通过向量相似度判定 >= 90% 则认为是对已有记忆的更新
   *
   * 注意：Profile 类型（IDENTITY/PREFERENCE/PERSONA）总是创建新记忆，不做版本检测
   * 因为 Profile 类型具有高度个性化，应该保留完整的更新历史
   */
  async detectVersion(
    content: string,
    options: {
      agentId?: string;
      type?: MemoryType;
      scope?: MemoryScope;
      minImportance?: number;
    } = {}
  ): Promise<VersionDetectionResult> {
    if (!this.config.enableVersioning) {
      return { isNewVersion: false, existingMemoryId: null, similarity: 0, shouldReplace: false };
    }

    // Profile 类型总是创建新记忆，不做版本检测
    const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];
    if (options.type && PROFILE_TYPES.includes(options.type)) {
      this.logger.debug('Profile type detected, skipping version detection', { type: options.type });
      return { isNewVersion: false, existingMemoryId: null, similarity: 0, shouldReplace: false };
    }

    try {
      // 生成新内容的向量
      const queryVector = await this.embedder(content);

      // 搜索相似记忆
      const searchOptions: VectorSearchOptions = {
        query: content,
        queryVector,
        limit: 5,
        minScore: this.config.similarityThreshold,
      };

      // 添加过滤条件
      if (options.agentId) {
        searchOptions.filters = { ...searchOptions.filters, agentId: options.agentId };
      }
      if (options.type) {
        searchOptions.filters = { ...searchOptions.filters, type: options.type };
      }
      if (options.scope) {
        searchOptions.filters = { ...searchOptions.filters, scope: options.scope };
      }
      if (options.minImportance !== undefined) {
        searchOptions.filters = {
          ...searchOptions.filters,
        };
      }

      const results = await this.vectorStore.search(searchOptions);

      if (results.length > 0) {
        const topMatch = results[0];
        return {
          isNewVersion: true,
          existingMemoryId: topMatch.metadata.uid,
          similarity: topMatch.score,
          shouldReplace: topMatch.score >= this.config.similarityThreshold,
        };
      }

      return { isNewVersion: false, existingMemoryId: null, similarity: 0, shouldReplace: false };
    } catch (error) {
      this.logger.error('Version detection failed', { error });
      return { isNewVersion: false, existingMemoryId: null, similarity: 0, shouldReplace: false };
    }
  }

  /**
   * 创建新版本
   *
   * 流程：
   * 1. 新版本生成新 UID_B，新 palace_B
   * 2. 旧版本（UID_A）的 UID 与新版本 UID 互换
   * 3. 新版本继承 UID_A，旧版本获得 UID_B
   *
   * 结果：
   * - 新版本：uid=UID_A, palace=新 palace, isLatest=true
   * - 旧版本：uid=UID_B, palace=旧 palace, isLatest=false
   */
  async createVersion(
    existingMemoryId: string,
    newContent: string,
    newSummary: string,
    newScores: { importance: number; scopeScore: number },
    newPalaceMetadata: { createdAt: number; updatedAt: number; originalSize: number; compressed: boolean; encrypted: boolean }
  ): Promise<VersionCreateResult> {
    const now = Date.now();

    // 1. 获取旧版本元数据
    const existingMeta = await this.metaStore.getById(existingMemoryId);
    if (!existingMeta) {
      throw new Error(`Existing memory not found: ${existingMemoryId}`);
    }

    const oldUid = existingMemoryId;
    const oldPalaceRef = existingMeta.currentPalaceRef;
    const newVersion = existingMeta.version + 1;

    // 2. 生成新 UID 和新 palaceRef
    const newUid = IDGenerator.generate('mem');
    const newPalaceLocation: PalaceLocation = {
      wingId: existingMeta.palace.wingId,
      hallId: existingMeta.palace.hallId,
      roomId: existingMeta.palace.roomId,
      closetId: `closet_${newUid}`,
    };
    const newPalaceRef = PalaceStore.generatePalaceRef(newPalaceLocation, newUid, newVersion);

    // 3. 存储新版本内容到新 palace
    await this.palaceStore.store(newPalaceRef, newContent, {
      uid: newUid,
      version: newVersion,
      ...newPalaceMetadata,
    });

    // 4. 生成新版本的向量
    const newVector = await this.embedder(newSummary);
    const versionGroupId = existingMeta.versionGroupId || existingMeta.uid;
    const newVectorDoc: VectorDocument = {
      id: newUid,
      vector: newVector,
      text: newSummary,
      metadata: {
        uid: newUid,
        type: existingMeta.type,
        scope: existingMeta.scope,
        importanceScore: newScores.importance,
        scopeScore: newScores.scopeScore,
        agentId: existingMeta.agentId,
        sessionId: existingMeta.sessionId,  // 继承旧版本的 sessionId
        tags: existingMeta.tags,
        createdAt: now,
        palaceRef: newPalaceRef,
        version: newVersion,
        isLatestVersion: true,
        versionGroupId,
        summary: newSummary,
      },
    };

    // 5. 创建新版本元数据（新版本继承旧 UID）
    const newMetaRecord: MemoryMetaRecord = {
      uid: oldUid,  // 继承旧 UID
      version: newVersion,
      agentId: existingMeta.agentId,
      sessionId: existingMeta.sessionId,  // 继承旧版本的 sessionId
      type: existingMeta.type,
      importanceScore: newScores.importance,
      scopeScore: newScores.scopeScore,
      scope: existingMeta.scope,
      palace: newPalaceLocation,
      versionChain: [
        ...existingMeta.versionChain,
        {
          version: newVersion,
          palaceRef: newPalaceRef,
          createdAt: now,
          summary: newSummary,
          contentLength: newContent.length,
        },
      ],
      isLatestVersion: true,
      versionGroupId,
      tags: existingMeta.tags,
      createdAt: existingMeta.createdAt,  // 继承原始创建时间
      updatedAt: now,
      recallCount: existingMeta.recallCount ?? 0,  // 继承旧版本的召回次数
      currentPalaceRef: newPalaceRef,
    };

    // 6. 创建旧版本的元数据（获得新 UID）
    const oldVersionMetaRecord: MemoryMetaRecord = {
      uid: newUid,  // 旧版本获得新 UID
      version: existingMeta.version,
      agentId: existingMeta.agentId,
      sessionId: existingMeta.sessionId,  // 继承旧版本的 sessionId
      type: existingMeta.type,
      importanceScore: existingMeta.importanceScore,
      scopeScore: existingMeta.scopeScore,
      scope: existingMeta.scope,
      palace: existingMeta.palace,  // 旧版本保持原有 palace 位置
      versionChain: existingMeta.versionChain,
      isLatestVersion: false,
      versionGroupId,
      tags: existingMeta.tags,
      createdAt: now,  // 重新创建
      updatedAt: now,
      recallCount: existingMeta.recallCount ?? 0,  // 继承旧版本的召回次数
      currentPalaceRef: oldPalaceRef,
    };

    // 7. 更新数据库
    // 7.1 删除旧记录（旧 UID）
    await this.metaStore.delete(oldUid);

    // 7.2 插入新版本记录（新版本继承旧 UID）
    await this.metaStore.insert(newMetaRecord);

    // 7.3 插入旧版本记录（获得新 UID）
    await this.metaStore.insert(oldVersionMetaRecord);

    // 8. 更新向量存储
    // 8.1 删除旧向量
    await this.vectorStore.delete(oldUid);

    // 8.2 添加新版本向量
    await this.vectorStore.store(newVectorDoc);

    // 9. 更新缓存
    // 9.1 获取旧版本完整记忆并更新
    const oldMemory = await this.cache.get(oldUid);
    if (oldMemory) {
      await this.cache.delete(oldUid);
      // 旧版本记忆获得新 UID
      const updatedOldMemory = {
        ...oldMemory,
        uid: newUid,
        isLatestVersion: false,
        updatedAt: now,
      };
      await this.cache.set(updatedOldMemory);
    }

    // 9.2 创建新版本缓存
    const newMemoryCache = {
      uid: oldUid,
      version: newVersion,
      content: newContent,
      summary: newSummary,
      type: existingMeta.type,
      importance: newScores.importance,
      scopeScore: newScores.scopeScore,
      scope: existingMeta.scope,
      agentId: existingMeta.agentId,
      tags: existingMeta.tags,
      createdAt: existingMeta.createdAt,
      updatedAt: now,
      accessedAt: now,
      palaceRef: newPalaceRef,
      isLatestVersion: true,
    };
    await this.cache.set(newMemoryCache);

    // 10. 图谱关联更新（只建立最新版本间的关联）
    await this.updateGraphForVersion(oldUid, newUid);

    this.logger.info('Version created via UID swap', {
      oldUid,
      newUid,
      newVersion,
      palaceRef: newPalaceRef,
    });

    return {
      success: true,
      newMemoryId: oldUid,      // 新版本继承旧 UID
      oldMemoryId: newUid,       // 旧版本获得新 UID
      version: newVersion,
      palaceRef: newPalaceRef,
    };
  }

  /**
   * 回滚到指定版本
   *
   * 基于 UID 互换机制：
   * - 将当前版本（isLatest=true）回滚到指定版本
   * - 回滚后的版本成为新的 isLatest=true
   * - 原最新版本成为 isLatest=false
   */
  async rollback(memoryId: string, targetVersion: number): Promise<RollbackResult> {
    const now = Date.now();

    // 1. 获取当前版本元数据
    const currentMeta = await this.metaStore.getById(memoryId);
    if (!currentMeta) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    if (!currentMeta.isLatestVersion) {
      throw new Error(`Memory is not the latest version: ${memoryId}`);
    }

    // 2. 查找目标版本
    const targetVersionInfo = currentMeta.versionChain.find(v => v.version === targetVersion);
    if (!targetVersionInfo) {
      throw new Error(`Version not found: v${targetVersion}`);
    }

    // 3. 获取目标版本内容
    const targetContent = await this.palaceStore.retrieve(targetVersionInfo.palaceRef);
    if (!targetContent) {
      throw new Error(`Target version content not found: ${targetVersionInfo.palaceRef}`);
    }

    // 4. 获取目标版本元数据（如果有的话，通过 versionChain 查找）
    // 实际上版本链中只存储了 palaceRef，我们需要从其他版本记录中获取信息
    // 先查询所有版本记录
    const allRecords = await this.metaStore.query({
      limit: 100,
    });

    // 找到属于同一记忆的所有版本（通过 versionChain 识别）
    const relatedRecords = allRecords.filter(r =>
      r.versionChain.some(v => v.palaceRef === targetVersionInfo.palaceRef) ||
      r.currentPalaceRef === targetVersionInfo.palaceRef
    );

    const targetRecord = relatedRecords.find(r => r.currentPalaceRef === targetVersionInfo.palaceRef);
    const targetUid = targetRecord?.uid || `restored_${memoryId}_v${targetVersion}`;

    // 5. 生成新 UID 用于当前版本（旧版互换）
    const newUidForCurrent = IDGenerator.generate('mem');

    // 6. 执行回滚
    // 6.1 目标版本内容保持不变，但更新元数据
    if (targetRecord) {
      // 目标版本继承当前版本的 UID
      await this.metaStore.delete(targetUid);
      await this.metaStore.insert({
        ...targetRecord,
        uid: memoryId,  // 继承当前 UID
        isLatestVersion: true,
        updatedAt: now,
      });

      // 当前版本获得新 UID
      await this.metaStore.insert({
        ...currentMeta,
        uid: newUidForCurrent,
        isLatestVersion: false,
        updatedAt: now,
      });
    } else {
      // 目标版本是新创建的，需要创建完整记录
      const targetPalaceInfo = PalaceStore.parsePalaceRef(targetVersionInfo.palaceRef);
      const targetPalace = targetPalaceInfo?.location || currentMeta.palace;

      await this.metaStore.delete(memoryId);
      await this.metaStore.insert({
        uid: memoryId,
        version: targetVersion,
        agentId: currentMeta.agentId,
        sessionId: currentMeta.sessionId,  // 继承 sessionId
        type: currentMeta.type,
        importanceScore: currentMeta.importanceScore,
        scopeScore: currentMeta.scopeScore,
        scope: currentMeta.scope,
        palace: targetPalace,
        versionChain: currentMeta.versionChain.filter(v => v.version <= targetVersion),
        isLatestVersion: true,
        versionGroupId: currentMeta.versionGroupId,
        tags: currentMeta.tags,
        createdAt: currentMeta.createdAt,
        updatedAt: now,
        recallCount: currentMeta.recallCount ?? 0,
        currentPalaceRef: targetVersionInfo.palaceRef,
      });

      // 当前版本获得新 UID
      await this.metaStore.insert({
        ...currentMeta,
        uid: newUidForCurrent,
        isLatestVersion: false,
        updatedAt: now,
      });
    }

    // 7. 更新向量存储
    const targetSummary = targetVersionInfo.summary;
    const targetVector = await this.embedder(targetSummary);

    await this.vectorStore.delete(memoryId);
    await this.vectorStore.store({
      id: memoryId,
      vector: targetVector,
      text: targetSummary,
      metadata: {
        uid: memoryId,
        type: currentMeta.type,
        scope: currentMeta.scope,
        importanceScore: currentMeta.importanceScore,
        scopeScore: currentMeta.scopeScore,
        agentId: currentMeta.agentId,
        sessionId: currentMeta.sessionId,  // 继承 sessionId
        tags: currentMeta.tags,
        createdAt: currentMeta.createdAt,
        palaceRef: targetVersionInfo.palaceRef,
        version: targetVersion,
        isLatestVersion: true,
        versionGroupId: currentMeta.versionGroupId,
      },
    });

    // 8. 更新图谱关联
    await this.updateGraphForVersion(memoryId, newUidForCurrent);

    this.logger.info('Rollback completed', {
      memoryId,
      targetVersion,
      newUidForCurrent,
    });

    return {
      success: true,
      targetVersion,
      currentMemoryId: memoryId,
      previousMemoryId: newUidForCurrent,
    };
  }

  /**
   * 获取版本历史
   */
  async getVersionHistory(memoryId: string): Promise<VersionInfo[]> {
    const record = await this.metaStore.getById(memoryId);
    if (!record) {
      return [];
    }
    return record.versionChain;
  }

  /**
   * 获取所有版本记录
   */
  async getAllVersions(memoryId: string): Promise<MemoryMetaRecord[]> {
    const currentMeta = await this.metaStore.getById(memoryId);
    if (!currentMeta) {
      return [];
    }

    // 找到所有相关版本（通过 versionChain 中的 palaceRef 匹配）
    const allRecords = await this.metaStore.query({ limit: 100 });

    return allRecords.filter(r => {
      // 匹配 versionChain 或 currentPalaceRef
      const inChain = r.versionChain.some(v =>
        currentMeta.versionChain.some(cv => cv.palaceRef === v.palaceRef)
      );
      const isCurrent = currentMeta.versionChain.some(cv => cv.palaceRef === r.currentPalaceRef);
      return inChain || isCurrent;
    });
  }

  /**
   * 清理旧版本
   * 保留最近 maxVersions 个版本
   */
  async pruneVersions(memoryId: string, maxVersions?: number): Promise<string[]> {
    const limit = maxVersions ?? this.config.maxVersions;
    const now = Date.now();

    const currentMeta = await this.metaStore.getById(memoryId);
    if (!currentMeta) {
      return [];
    }

    if (currentMeta.versionChain.length <= limit) {
      return [];
    }

    // 需要删除的版本
    const toDelete = currentMeta.versionChain.slice(0, currentMeta.versionChain.length - limit);
    const deletedPalaceRefs: string[] = [];

    for (const versionInfo of toDelete) {
      // 查找对应的版本记录
      const allRecords = await this.metaStore.query({ limit: 100 });
      const versionRecord = allRecords.find(r => r.currentPalaceRef === versionInfo.palaceRef);

      if (versionRecord && versionRecord.uid !== memoryId) {
        // 删除向量
        await this.vectorStore.delete(versionRecord.uid);

        // 删除缓存
        await this.cache.delete(versionRecord.uid);

        // 删除元数据记录
        await this.metaStore.delete(versionRecord.uid);
      }

      // 删除 palace 内容
      await this.palaceStore.delete(versionInfo.palaceRef);
      deletedPalaceRefs.push(versionInfo.palaceRef);
    }

    // 更新当前记录的 versionChain
    const newChain = currentMeta.versionChain.slice(-limit);
    await this.metaStore.update(memoryId, {
      versionChain: newChain,
    });

    this.logger.info('Versions pruned', {
      memoryId,
      deletedCount: toDelete.length,
      remainingCount: limit,
    });

    return deletedPalaceRefs;
  }

  /**
   * 更新图谱关联
   * 图谱只建立最新版本间的关联
   */
  private async updateGraphForVersion(newVersionId: string, oldVersionId: string): Promise<void> {
    try {
      // 移除旧版本的图谱数据
      await this.graphStore.removeMemory(oldVersionId);

      // 新版本的图谱关联保持不变（如果之前有的话）
      // 图谱更新需要在调用处处理
    } catch (error) {
      this.logger.warn('Graph update skipped', { error: String(error) });
    }
  }

  /**
   * 计算向量相似度
   */
  private computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 配置更新
   */
  updateConfig(config: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Config updated', this.config);
  }

  /**
   * 获取版本统计
   */
  async getVersionStats(memoryId: string): Promise<{
    totalVersions: number;
    latestVersion: number;
    oldestVersion: number;
    totalSize: number;
  }> {
    const record = await this.metaStore.getById(memoryId);
    if (!record) {
      return { totalVersions: 0, latestVersion: 0, oldestVersion: 0, totalSize: 0 };
    }

    let totalSize = 0;
    for (const versionInfo of record.versionChain) {
      const content = await this.palaceStore.retrieve(versionInfo.palaceRef);
      if (content) {
        totalSize += content.length;
      }
    }

    return {
      totalVersions: record.versionChain.length,
      latestVersion: record.version,
      oldestVersion: record.versionChain[0]?.version || 1,
      totalSize,
    };
  }
}
