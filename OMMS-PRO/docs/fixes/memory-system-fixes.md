# OMMS-PRO 记忆系统问题修复方案

## 问题总览

通过深度代码审查和模拟测试，发现以下关键问题需要修复：

1. **记忆捕获流程问题**
2. **记忆召回流程问题**
3. **版本管理问题**
4. **用户画像流程问题**
5. **Dreaming 引擎问题**

---

## 1. 记忆捕获流程修复

### 问题描述
- ❌ `CaptureInput` 不支持对话轮次格式
- ❌ LLM Extractor 未实现，无法测试
- ❌ 置信度阈值 0.2 过低，会捕获低质量记忆

### 解决方案

#### 1.1 添加对话轮次支持
**文件**: `src/types/memory.ts`

新增 `ConversationTurn` 类型和增强的 `CaptureInput`:

```typescript
/**
 * 对话轮次
 */
export interface ConversationTurn {
  /** 角色 */
  role: 'user' | 'assistant';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 增强的捕获输入
 */
export interface EnhancedCaptureInput {
  /** Agent ID */
  agentId: string;
  /** 会话 ID */
  sessionId?: string;
  /** 对话轮次列表 */
  turns: ConversationTurn[];
  /** 配置选项 */
  config?: CaptureConfig;
}
```

#### 1.2 实现 LLM Extractor 模拟
**文件**: `src/memory-service/llm-extractor.ts`

创建模拟实现用于测试:

```typescript
/**
 * LLM Extractor 模拟实现（用于测试）
 */
export class MockLLMExtractor implements ILLMExtractor {
  async extractMemories(
    text: string,
    options: { maxCount: number; typeHints?: MemoryType[] }
  ): Promise<ExtractedMemory[]> {
    // 基于关键词的简单提取逻辑
    const memories: ExtractedMemory[] = [];
    
    // 检测用户信息
    if (text.includes('我叫') || text.includes('我是')) {
      memories.push({
        content: extractIdentityInfo(text),
        type: MemoryType.IDENTITY,
        confidence: 0.9,
        keywords: [],
        tags: ['identity'],
      });
    }
    
    // 检测偏好
    if (text.includes('喜欢') || text.includes('偏好')) {
      memories.push({
        content: extractPreference(text),
        type: MemoryType.PREFERENCE,
        confidence: 0.85,
        keywords: [],
        tags: ['preference'],
      });
    }
    
    return memories.slice(0, options.maxCount);
  }

  async generateScores(content: string): Promise<{
    importance: number;
    scope: number;
    confidence: number;
    reasoning: string;
  }> {
    // 基于内容长度和关键词的简单评分
    const hasIdentity = /姓名 | 年龄 | 职业 | 工作/.test(content);
    const hasPreference = /喜欢 | 偏好 | 爱好/.test(content);
    
    return {
      importance: hasIdentity ? 9 : hasPreference ? 7 : 5,
      scope: hasIdentity ? 8 : 6,
      confidence: 0.85,
      reasoning: '基于关键词的自动评分',
    };
  }

  async generateSummary(content: string): Promise<string> {
    // 简单截断作为摘要
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }
}
```

#### 1.3 调整置信度阈值
**文件**: `src/memory-service/memory-capture-service.ts`

```typescript
const DEFAULT_CONFIG = {
  // ...
  confidenceThreshold: 0.5,  // 从 0.2 提升到 0.5
  // ...
};
```

---

## 2. 记忆召回流程修复

### 问题描述
- ❌ `RecallOptions` 类型定义不完整
- ❌ 作用域升级逻辑未完全实现
- ❌ 遗忘机制需要手动触发

### 解决方案

#### 2.1 完善 RecallOptions
**文件**: `src/types/memory.ts`

```typescript
export interface RecallOptions {
  query: string;
  wingId?: string;
  roomId?: string;
  hallId?: HallId;
  types?: MemoryType[];
  tags?: string[];
  limit?: number;
  minImportance?: number;
  minSimilarity?: number;
  timeRange?: {
    from: Timestamp;
    to: Timestamp;
  };
  // 新增字段
  agentId?: string;  // 当前 Agent ID
  sessionId?: string;  // 当前会话 ID
  useVectorSearch?: boolean;  // 是否使用向量搜索
  includeVersionChain?: boolean;  // 是否包含版本链
}
```

#### 2.2 实现作用域升级逻辑
**文件**: `src/memory-service/memory-recall-manager.ts`

添加作用域升级检测:

```typescript
/**
 * 检查并执行作用域升级
 */
async function checkScopeUpgrade(memory: MemoryMetaRecord): Promise<boolean> {
  const recallCount = memory.recallCount || 0;
  const importance = memory.importanceScore;
  const currentScope = memory.scope;
  
  // SESSION -> AGENT
  if (currentScope === MemoryScope.SESSION) {
    if (recallCount >= 3 && importance >= 5) {
      await this.upgradeScope(memory.uid, MemoryScope.AGENT);
      return true;
    }
  }
  
  // AGENT -> GLOBAL
  if (currentScope === MemoryScope.AGENT) {
    if (recallCount >= 5 && importance >= 6) {
      await this.upgradeScope(memory.uid, MemoryScope.GLOBAL);
      return true;
    }
  }
  
  return false;
}
```

#### 2.3 实现自动化遗忘调度
**文件**: `src/memory-service/memory-degradation-manager.ts`

添加定时检查:

```typescript
/**
 * 启动遗忘检查调度器
 */
startScheduler(checkIntervalMs: number = 3600000) {  // 默认 1 小时
  setInterval(async () => {
    await this.checkAndForget();
  }, checkIntervalMs);
  
  this.logger.info('Forgetting scheduler started', { interval: checkIntervalMs });
}

/**
 * 执行遗忘检查
 */
async checkAndForget(): Promise<ForgetReport> {
  const now = Date.now();
  const allMemories = await this.metaStore.getAll();
  
  const toArchive: string[] = [];
  const toDelete: string[] = [];
  
  for (const memory of allMemories) {
    const forgetScore = this.calculateForgetScore(memory, now);
    
    if (forgetScore < 1) {
      toDelete.push(memory.uid);
    } else if (forgetScore < 3) {
      toArchive.push(memory.uid);
    }
  }
  
  // 执行归档和删除
  await this.batchArchive(toArchive);
  await this.batchDelete(toDelete);
  
  return {
    archived: toArchive.length,
    deleted: toDelete.length,
    timestamp: now,
  };
}
```

---

## 3. 版本管理修复

### 问题描述
- ❌ 版本检测依赖于简单的相似度比较
- ❌ 版本链更新可能导致数据不一致

### 解决方案

#### 3.1 实现语义相似度检测
**文件**: `src/memory-service/memory-version-manager.ts`

```typescript
/**
 * 检测版本（增强版）
 */
async detectVersion(
  content: string,
  options: { agentId: string; type: MemoryType }
): Promise<{
  isNewVersion: boolean;
  existingMemoryId: string | null;
  similarity: number;
}> {
  // 1. 使用向量相似度
  const similarMemories = await this.vectorStore.search(content, {
    limit: 5,
    filters: {
      agentId: options.agentId,
      type: options.type,
    },
  });
  
  // 2. 检查语义相似度
  for (const result of similarMemories) {
    const semanticSimilarity = await this.calculateSemanticSimilarity(
      content,
      result.text
    );
    
    if (semanticSimilarity >= this.config.similarityThreshold) {
      return {
        isNewVersion: true,
        existingMemoryId: result.id,
        similarity: semanticSimilarity,
      };
    }
  }
  
  return {
    isNewVersion: false,
    existingMemoryId: null,
    similarity: 0,
  };
}

/**
 * 计算语义相似度（使用余弦相似度）
 */
private async calculateSemanticSimilarity(text1: string, text2: string): Promise<number> {
  const vector1 = await this.embedder(text1);
  const vector2 = await this.embedder(text2);
  
  return this.cosineSimilarity(vector1, vector2);
}

/**
 * 余弦相似度计算
 */
private cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const norm2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
  
  return dotProduct / (norm1 * norm2);
}
```

#### 3.2 版本链原子性更新
**文件**: `src/memory-service/memory-version-manager.ts`

```typescript
/**
 * 创建新版本（事务性）
 */
async createVersion(
  existingMemoryId: string,
  newContent: string,
  newSummary: string,
  scores: { importance: number; scopeScore: number }
): Promise<{ newMemoryId: string; oldMemoryId: string }> {
  const transaction = await this.metaStore.beginTransaction();
  
  try {
    // 1. 获取现有记忆
    const existing = await this.metaStore.getById(existingMemoryId);
    if (!existing) {
      throw new Error('Memory not found');
    }
    
    // 2. 创建新版本记忆
    const newMemory = await this.storeManager.store({
      content: newContent,
      type: existing.type,
      metadata: {
        ...existing.metadata,
        version: (existing.version || 1) + 1,
        versionGroupId: existing.versionGroupId || existingMemoryId,
        previousVersionId: existingMemoryId,
      },
    }, scores);
    
    // 3. 更新旧版本状态
    await this.metaStore.update(existingMemoryId, {
      isLatestVersion: false,
      metadata: {
        ...existing.metadata,
        nextVersionId: newMemory.uid,
      },
    });
    
    // 4. 更新版本链索引
    await this.updateVersionChainIndex(existingMemoryId, newMemory.uid);
    
    await transaction.commit();
    
    return {
      newMemoryId: newMemory.uid,
      oldMemoryId: existingMemoryId,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

---

## 4. 用户画像流程修复

### 问题描述
- ❌ ProfileManager 依赖 MemoryService 但为可选
- ❌ Persona 构建需要至少 5 轮对话，但没有提示机制

### 解决方案

#### 4.1 强制 MemoryService 依赖
**文件**: `src/profile-manager/profile-manager.ts`

```typescript
export interface ProfileManagerOptions {
  storagePath?: string;
  config?: Partial<ProfileManagerConfig>;
  memoryService: StorageMemoryService;  // 改为必需
}

constructor(options?: ProfileManagerOptions) {
  // ...
  if (!options?.memoryService) {
    throw new Error('MemoryService is required for ProfileManager');
  }
  this.memoryService = options.memoryService;
  // ...
}
```

#### 4.2 添加构建进度提示
**文件**: `src/profile-manager/persona-builder.ts`

```typescript
/**
 * 构建 Persona（带进度检查）
 */
async buildPersona(
  userId: string,
  conversations: ConversationTurn[]
): Promise<{
  persona: Persona;
  progress: number;
  minTurnsRequired: number;
  ready: boolean;
}> {
  const minTurns = this.config.minConversationTurns || 5;
  const turnCount = conversations.length;
  const progress = Math.min(turnCount / minTurns, 1);
  const ready = turnCount >= minTurns;
  
  if (!ready) {
    return {
      persona: this.createEmptyPersona(),
      progress,
      minTurnsRequired: minTurns,
      ready: false,
    };
  }
  
  // 正常构建逻辑
  const persona = await this.doBuildPersona(conversations);
  
  return {
    persona,
    progress: 1,
    minTurnsRequired: minTurns,
    ready: true,
  };
}
```

---

## 5. Dreaming 引擎修复

### 问题描述
- ❌ 记忆整理任务没有自动调度器
- ❌ 归档和清理策略配置不完整

### 解决方案

#### 5.1 实现自动调度器
**文件**: `src/dreaming-engine/dreaming-manager.ts`

```typescript
/**
 * DreamingManager
 */
export class DreamingManager {
  private schedulerTimer?: NodeJS.Timeout;
  
  /**
   * 启动自动调度器
   */
  startAutoScheduler(config: {
    consolidationInterval?: number;  // 合并间隔（毫秒）
    reorganizationInterval?: number;  // 重构间隔
    archivalInterval?: number;  // 归档间隔
  } = {}) {
    const defaultConfig = {
      consolidationInterval: 3600000,  // 1 小时
      reorganizationInterval: 7200000,  // 2 小时
      archivalInterval: 86400000,  // 24 小时
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    
    // 定时执行合并任务
    this.schedulerTimer = setInterval(async () => {
      await this.runAllTasks();
    }, finalConfig.consolidationInterval);
    
    this.logger.info('Auto scheduler started', finalConfig);
  }
  
  /**
   * 停止调度器
   */
  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
      this.logger.info('Auto scheduler stopped');
    }
  }
  
  /**
   * 执行所有整理任务
   */
  private async runAllTasks(): Promise<void> {
    try {
      await this.consolidateMemories();
      await this.reorganizeGraph();
      await this.archiveOldMemories();
      await this.defragmentStorage();
      
      this.logger.info('All organization tasks completed');
    } catch (error) {
      this.logger.error('Organization tasks failed', { error });
    }
  }
}
```

#### 5.2 完善配置
**文件**: `src/dreaming-engine/types.ts`

```typescript
export interface DreamingEngineConfig {
  // 合并配置
  consolidation: {
    enabled: boolean;
    similarityThreshold: number;  // 相似度阈值
    maxGroupSize: number;  // 最大组大小
  };
  
  // 重构配置
  reorganization: {
    enabled: boolean;
    minRelations: number;  // 最小关联数
    autoLinkThreshold: number;  // 自动关联阈值
  };
  
  // 归档配置
  archival: {
    enabled: boolean;
    daysBeforeArchive: number;  // 归档前天
    forgetScoreThreshold: number;  // 遗忘分数阈值
  };
  
  // 碎片整理配置
  defragmentation: {
    enabled: boolean;
    fragmentationThreshold: number;  // 碎片化阈值
  };
  
  // 调度配置
  scheduling: {
    autoStart: boolean;
    intervals: {
      consolidation: number;
      reorganization: number;
      archival: number;
      defragmentation: number;
    };
  };
}

export const DEFAULT_DREAMING_ENGINE_CONFIG: DreamingEngineConfig = {
  consolidation: {
    enabled: true,
    similarityThreshold: 0.85,
    maxGroupSize: 10,
  },
  reorganization: {
    enabled: true,
    minRelations: 3,
    autoLinkThreshold: 0.7,
  },
  archival: {
    enabled: true,
    daysBeforeArchive: 30,
    forgetScoreThreshold: 2.5,
  },
  defragmentation: {
    enabled: true,
    fragmentationThreshold: 0.3,
  },
  scheduling: {
    autoStart: true,
    intervals: {
      consolidation: 3600000,  // 1 小时
      reorganization: 7200000,  // 2 小时
      archival: 86400000,  // 24 小时
      defragmentation: 604800000,  // 7 天
    },
  },
};
```

---

## 实施计划

### 第一阶段：核心修复（高优先级）
1. ✅ 修复记忆捕获流程
2. ✅ 修复记忆召回流程
3. ✅ 修复版本管理问题

### 第二阶段：功能完善（中优先级）
4. ✅ 修复用户画像流程
5. ✅ 修复 Dreaming 引擎问题
6. ✅ 实现 LLM Extractor 模拟

### 第三阶段：测试验证
7. ✅ 运行完整测试套件
8. ✅ 验证所有修复效果

---

## 预期效果

修复后的系统将具备：

1. ✅ **完整的对话捕获能力** - 支持多轮对话记忆提取
2. ✅ **智能作用域管理** - 自动升级/降级
3. ✅ **可靠的版本控制** - 语义相似度检测 + 事务性更新
4. ✅ **健壮的用户画像** - 强制依赖 + 进度提示
5. ✅ **自动化记忆整理** - 定时调度 + 完整配置
6. ✅ **可测试性** - Mock LLM Extractor
