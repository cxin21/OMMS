# Dreaming Engine 重构设计文档

**版本**: v1.0.0
**更新日期**: 2026-04-13
**状态**: 待实现

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [核心定位转变](#2-核心定位转变)
3. [四种整理类型](#3-四种整理类型)
4. [架构设计](#4-架构设计)
5. [核心接口定义](#5-核心接口定义)
6. [三阶段整理流程](#6-三阶段整理流程)
7. [核心组件设计](#7-核心组件设计)
8. [调度策略](#8-调度策略)
9. [文件改动清单](#9-文件改动清单)
10. [实现顺序](#10-实现顺序)

---

## 1. 背景与目标

### 1.1 现状问题

当前 `DreamingEngine` 模块存在以下问题：

| 组件 | 问题 |
|------|------|
| `DreamingManager` | 所有核心方法返回 stub 数据，标注 TODO |
| `DreamGenerator` | 完全 stub，依赖已移除的 LLMManager/GraphManager |
| `DreamExecutor` | 有壳但 `applyConsolidation()` 返回空数据 |
| `MemoryConsolidator` | 使用旧的 MemoryManager 接口 |
| `DreamStorage` | 纯内存 Map，无持久化 |
| `DreamAnalyzer` | 基本可用但与新架构脱节 |

### 1.2 重构目标

1. **功能转变**: 从"模拟睡眠做梦"转变为"后台记忆整理服务"
2. **架构对齐**: 依赖已重构的 StorageMemoryService + GraphStore
3. **真正价值**: 提供记忆合并、图谱重构、存储优化等维护能力
4. **可调度执行**: 后台定时运行，无需人工干预

---

## 2. 核心定位转变

### 2.1 旧定位

```
模拟人类睡眠时的记忆整合过程，通过梦境形式巩固重要记忆，建立新的关联
```

### 2.2 新定位

```
后台记忆整理服务，执行记忆合并、图谱重构、归档清理、碎片整理等维护任务
```

### 2.3 定位对比

| 维度 | 旧定位 | 新定位 |
|------|--------|--------|
| **触发方式** | 定时模拟睡眠周期 | 后台维护任务 |
| **用户感知** | 梦境叙事输出 | 无感知（后台运行） |
| **核心价值** | 记忆巩固 + 关系建立 | 存储优化 + 图谱健康 |
| **依赖** | LLMManager, GraphManager | StorageMemoryService, GraphStore |
| **维护负担** | 需要生成有意义的叙事 | 纯粹的后台任务 |

---

## 3. 四种整理类型

### 3.1 整理类型概览

| 类型 | 英文 | 描述 | 触发条件 |
|------|------|------|----------|
| **合并整理** | Consolidation | 相似记忆版本合并，去重 | 同一主题记忆 >= 3 |
| **图谱重构** | Reorganization | 重建记忆间关联，优化图谱 | 图谱边密度下降 |
| **归档清理** | Archival | 低重要性记忆归档，释放空间 | 记忆总数超阈值 |
| **碎片整理** | Defragmentation | Palace 存储碎片整理 | 存储碎片率 > 30% |

### 3.2 合并整理 (Consolidation)

**目标**: 减少重复记忆，合并相似内容

**流程**:
1. 向量搜索找相似记忆 (similarity >= 0.85)
2. 对每组分析内容重叠度、时间衰减、重要性
3. 合并决策:
   - 保留最高 importance + 最新 version
   - 内容有差异 → 创建新版本
   - 完全重复 → 直接删除

### 3.3 图谱重构 (Reorganization)

**目标**: 保持知识图谱健康，优化关联质量

**流程**:
1. 分析断开连接的节点
2. 识别弱关联边 (weight < 0.3)
3. 重建关联:
   - 向量相似度补充关联
   - 类型一致性验证
   - 传递性闭包扩展

### 3.4 归档清理 (Archival)

**目标**: 释放存储空间，保留核心记忆

**流程**:
1. 识别低价值记忆 (importance < 2, 长期未访问)
2. 移动到归档区块 (MemoryBlock.ARCHIVED)
3. 释放 VectorStore 和 Cache 空间

### 3.5 碎片整理 (Defragmentation)

**目标**: 优化 Palace 存储布局，提升 I/O 效率

**流程**:
1. 计算碎片率指标
2. 重新组织 closet 存储位置
3. 清理孤儿引用

---

## 4. 架构设计

### 4.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                     DreamingManager (记忆整理管理器)                   │
│                         统一入口 + 调度器                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ MemoryMerger    │  │ GraphReorganizer│  │ StorageOptimizer│  │
│  │ (记忆合并器)    │  │ (图谱重构器)    │  │ (存储优化器)    │  │
│  │                 │  │                 │  │                 │  │
│  │ - 相似度检测    │  │ - 关联分析      │  │ - 碎片检测      │  │
│  │ - 版本合并      │  │ - 边重建        │  │ - 归档策略      │  │
│  │ - 去重          │  │ - 节点优化      │  │ - 压缩          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                        MemoryConsolidator                         │
│                      (统一记忆巩固逻辑)                             │
│                                                                  │
│  - importance 提升     - scope 升级评估     - recallCount 更新     │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      StorageMemoryService                         │
│                         (记忆存储服务)                             │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│  Cache   │ VectorDB │ SQLite   │ Palace   │ Graph Store         │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

### 4.2 模块依赖关系

```
DreamingManager
    ├── MemoryMerger
    │       └── StorageMemoryService (recall, update)
    ├── GraphReorganizer
    │       └── GraphStore (query, addRelation, removeRelation)
    ├── StorageOptimizer
    │       └── StorageMemoryService
    │       └── PalaceStore (stats, defragment)
    └── MemoryConsolidator
            └── StorageMemoryService (reinforce, upgrade)

DreamScheduler (定时调度)
    └── DreamingManager.dream()
```

---

## 5. 核心接口定义

### 5.1 枚举定义

```typescript
/**
 * 整理类型
 */
export enum OrganizationType {
  CONSOLIDATION = 'consolidation',     // 记忆合并
  REORGANIZATION = 'reorganization',   // 图谱重构
  ARCHIVAL = 'archival',             // 归档清理
  DEFRAGMENTATION = 'defragmentation', // 碎片整理
  ALL = 'all',                        // 全量整理
}

/**
 * 整理任务状态
 */
export enum OrganizationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 整理阶段状态
 */
export enum OrganizationPhase {
  SCAN = 'scan',       // 扫描阶段
  ANALYZE = 'analyze', // 分析阶段
  EXECUTE = 'execute', // 执行阶段
}
```

### 5.2 核心接口

```typescript
/**
 * 相似记忆组
 */
export interface SimilarMemoryGroup {
  primaryMemory: string;     // 保留的记忆 ID
  mergedMemories: string[];  // 被合并的记忆 ID
  similarity: number;        // 相似度
  reason: string;            // 合并原因
  potentialSavings: number; // 预估节省空间 (bytes)
}

/**
 * 碎片化指标
 */
export interface FragmentationMetrics {
  palaceFragmentation: number;  // Palace 碎片率 (0-1)
  graphEdgeDensity: number;     // 图谱边密度 (0-1)
  orphanedMemories: number;     // 孤儿记忆数 (无关联)
  staleMemories: number;        // 陈旧记忆数 (长期未访问)
  lastDefragmentationAt?: number;
}

/**
 * 整理报告
 */
export interface OrganizationReport {
  id: string;
  type: OrganizationType;
  status: OrganizationStatus;

  // 执行阶段
  phases: {
    scan: {
      scannedCount: number;
      candidateCount: number;
      duration: number;  // ms
    };
    analyze: {
      analyzedCount: number;
      foundIssues: number;
      duration: number;
    };
    execute: {
      fixedCount: number;
      deletedCount: number;
      duration: number;
    };
  };

  // 结果统计
  memoriesMerged: number;
  memoriesArchived: number;
  memoriesDeleted: number;
  relationsRebuilt: number;
  storageFreed: number;  // bytes

  executedAt: number;
  totalDuration: number;  // ms
}

/**
 * 整理输入选项
 */
export interface OrganizationInput {
  type?: OrganizationType;
  force?: boolean;  // 强制执行，忽略阈值检查
  limit?: number;   // 限制处理数量
}
```

### 5.3 配置接口

```typescript
/**
 * 整理调度配置
 */
export interface DreamingSchedulerConfig {
  autoOrganize: boolean;           // 是否启用自动调度
  organizeInterval: number;        // 触发间隔 (ms), 默认 6 小时
  memoryThreshold: number;          // 触发归档的记忆总数阈值
  fragmentationThreshold: number;   // 触发碎片整理的碎片率阈值
  stalenessDays: number;           // 触发归档的陈旧天数阈值
  maxMemoriesPerCycle: number;      // 每轮最多处理记忆数
  maxRelationsPerCycle: number;     // 每轮最多重建关联数
}

/**
 * 合并整理配置
 */
export interface ConsolidationConfig {
  similarityThreshold: number;     // 相似度阈值, 默认 0.85
  maxGroupSize: number;            // 最大合并组大小, 默认 5
  preserveNewest: boolean;         // 是否保留最新版本
  createNewVersion: boolean;        // 内容差异大时是否创建版本
}

/**
 * 图谱重构配置
 */
export interface ReorganizationConfig {
  minEdgeWeight: number;           // 最小边权重, 默认 0.3
  densityTarget: number;           // 目标边密度, 默认 0.5
  orphanThreshold: number;         // 孤儿节点判定阈值
  maxNewRelationsPerCycle: number; // 每轮最大新建关联数
}

/**
 * 归档清理配置
 */
export interface ArchivalConfig {
  importanceThreshold: number;      // 归档重要性阈值, 默认 2
  stalenessDays: number;            // 陈旧天数阈值, 默认 30
  archiveBlock: MemoryBlock;        // 归档区块, 默认 ARCHIVED
  retentionDays: number;            // 保留天数, 默认 90
}
```

---

## 6. 三阶段整理流程

### 6.1 主流程图

```
┌──────────────────────────────────────────────────────────────────┐
│                         dream(input)                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: SCAN (扫描)                                            │
│  ├── 扫描所有记忆，计算碎片化指标                                  │
│  ├── 检查是否触发整理条件                                          │
│  └── 输出: FragmentationMetrics                                  │
│           │                                                      │
│           ▼                                                      │
│  Phase 2: ANALYZE (分析)                                         │
│  ├── MemoryMerger: 找相似记忆组                                   │
│  ├── GraphReorganizer: 找断开的关联                               │
│  └── StorageOptimizer: 找可归档记忆                               │
│           │                                                      │
│           ▼                                                      │
│  Phase 3: EXECUTE (执行)                                          │
│  ├── 执行记忆合并                                                 │
│  ├── 重建图谱关联                                                 │
│  └── 归档/删除低价值记忆                                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Phase 1: SCAN

**目标**: 快速扫描，生成碎片化指标，决定是否需要整理

**输出**:
- `FragmentationMetrics`: 碎片率、孤儿记忆数、陈旧记忆数等
- `scannedCount`: 扫描的记忆总数
- `candidateCount`: 需要处理的候选记忆数

**实现**:
```typescript
async scan(): Promise<{
  metrics: FragmentationMetrics;
  scannedCount: number;
  candidates: string[];
}> {
  // 1. 从 GraphStore 获取边密度
  const graphStats = await this.graphStore.getStats();

  // 2. 从 SQLite 统计孤儿记忆 (无图谱关联)
  const orphanedCount = await this.countOrphanedMemories();

  // 3. 统计陈旧记忆 (最后访问 > 30 天)
  const staleCount = await this.countStaleMemories(this.config.stalenessDays);

  // 4. 从 PalaceStore 获取碎片率
  const palaceStats = await this.palaceStore.getStats();

  return {
    metrics: {
      palaceFragmentation: palaceStats.fragmentationRate,
      graphEdgeDensity: graphStats.edgeDensity,
      orphanedMemories: orphanedCount,
      staleMemories: staleCount,
    },
    scannedCount: ...,
    candidates: ...,
  };
}
```

### 6.3 Phase 2: ANALYZE

**目标**: 分析候选记忆，生成处理任务列表

**任务类型**:
1. **合并任务** (ConsolidationTask): 相似记忆组
2. **重构任务** (ReorganizationTask): 断开的关联
3. **归档任务** (ArchivalTask): 低价值记忆

**实现**:
```typescript
async analyze(candidates: string[]): Promise<{
  similarGroups: SimilarMemoryGroup[];
  brokenRelations: Array<{ from: string; to: string }>;
  archivalCandidates: string[];
  foundIssues: number;
}> {
  // 1. MemoryMerger: 向量搜索找相似记忆
  const similarGroups = await this.memoryMerger.findSimilarGroups(candidates);

  // 2. GraphReorganizer: 分析图谱缺口
  const brokenRelations = await this.graphReorganizer.analyzeGaps();

  // 3. StorageOptimizer: 识别可归档记忆
  const archivalCandidates = await this.storageOptimizer.findArchivalCandidates();

  return {
    similarGroups,
    brokenRelations,
    archivalCandidates,
    foundIssues: similarGroups.length + brokenRelations.length + archivalCandidates.length,
  };
}
```

### 6.4 Phase 3: EXECUTE

**目标**: 执行分析阶段生成的任务，更新存储

**实现**:
```typescript
async execute(tasks: {
  similarGroups: SimilarMemoryGroup[];
  brokenRelations: Array<{ from: string; to: string }>;
  archivalCandidates: string[];
}): Promise<{
  memoriesMerged: number;
  relationsRebuilt: number;
  memoriesArchived: number;
  storageFreed: number;
}> {
  // 1. 执行记忆合并
  for (const group of tasks.similarGroups) {
    await this.memoryMerger.mergeGroup(group);
  }

  // 2. 重建图谱关联
  for (const relation of tasks.brokenRelations) {
    await this.graphReorganizer.rebuildRelation(relation);
  }

  // 3. 归档低价值记忆
  for (const memoryId of tasks.archivalCandidates) {
    await this.storageOptimizer.archiveMemory(memoryId);
  }
}
```

---

## 7. 核心组件设计

### 7.1 DreamingManager

**职责**: 统一入口，编排三阶段流程，管理调度器

```typescript
export class DreamingManager {
  constructor(
    private memoryService: StorageMemoryService,
    private graphStore: IGraphStore,
    private palaceStore: IPalaceStore,
    private config?: Partial<DreamingEngineConfig>
  );

  // 主入口
  async dream(input?: OrganizationInput): Promise<OrganizationReport>;

  // 三阶段
  private async scan(): Promise<ScanResult>;
  private async analyze(candidates: string[]): Promise<AnalyzeResult>;
  private async execute(tasks: TaskList): Promise<ExecuteResult>;

  // 调度
  startScheduler(): void;
  stopScheduler(): void;
}
```

### 7.2 MemoryMerger

**职责**: 记忆合并，去重，版本整合

```typescript
export class MemoryMerger {
  constructor(
    private memoryService: StorageMemoryService,
    private vectorStore: IVectorStore,
    private config?: ConsolidationConfig
  );

  // 找相似记忆组
  async findSimilarGroups(candidates: string[]): Promise<SimilarMemoryGroup[]>;

  // 执行合并
  async mergeGroup(group: SimilarMemoryGroup): Promise<{
    mergedCount: number;
    storageFreed: number;
  }>;

  // 计算相似度
  private calculateSimilarity(m1: RecallMemory, m2: RecallMemory): number;
}
```

### 7.3 GraphReorganizer

**职责**: 图谱分析，关联重建，节点优化

```typescript
export class GraphReorganizer {
  constructor(
    private graphStore: IGraphStore,
    private memoryService: StorageMemoryService,
    private config?: ReorganizationConfig
  );

  // 分析图谱缺口
  async analyzeGaps(): Promise<Array<{
    from: string;
    to: string;
    reason: string;
  }>>;

  // 重建关联
  async rebuildRelation(relation: { from: string; to: string }): Promise<boolean>;

  // 补充新关联 (基于向量相似度)
  async supplementRelations(): Promise<number>;
}
```

### 7.4 StorageOptimizer

**职责**: 碎片检测，归档策略，存储优化

```typescript
export class StorageOptimizer {
  constructor(
    private memoryService: StorageMemoryService,
    private palaceStore: IPalaceStore,
    private config?: ArchivalConfig
  );

  // 计算碎片率
  async calculateFragmentation(): Promise<FragmentationMetrics>;

  // 找可归档记忆
  async findArchivalCandidates(): Promise<string[]>;

  // 归档记忆
  async archiveMemory(memoryId: string): Promise<boolean>;

  // 执行碎片整理
  async defragment(): Promise<{ filesMoved: number; spaceFreed: number }>;
}
```

---

## 8. 调度策略

### 8.1 调度配置

```typescript
const DEFAULT_DREAMING_CONFIG: DreamingEngineConfig = {
  scheduler: {
    autoOrganize: true,
    organizeInterval: 6 * 60 * 60 * 1000,  // 6 小时
    memoryThreshold: 1000,                  // 1000 条记忆触发归档
    fragmentationThreshold: 0.3,             // 30% 碎片率触发整理
    stalenessDays: 30,                       // 30 天未访问触发归档
    maxMemoriesPerCycle: 100,                // 每轮最多 100 条
    maxRelationsPerCycle: 50,                // 每轮最多 50 条关联
  },
  consolidation: {
    similarityThreshold: 0.85,
    maxGroupSize: 5,
    preserveNewest: true,
    createNewVersion: true,
  },
  reorganization: {
    minEdgeWeight: 0.3,
    densityTarget: 0.5,
    orphanThreshold: 0.2,
    maxNewRelationsPerCycle: 30,
  },
  archival: {
    importanceThreshold: 2,
    stalenessDays: 30,
    retentionDays: 90,
  },
};
```

### 8.2 触发条件

| 条件 | 阈值 | 触发动作 |
|------|------|----------|
| 记忆总数 | > 1000 | 归档清理 |
| 碎片率 | > 30% | 碎片整理 |
| 孤儿记忆 | > 50 | 图谱重构 |
| 相似记忆组 | >= 3 | 合并整理 |

### 8.3 调度流程

```
1. 定时器触发 (every 6 hours)
   │
   ├── 检查是否满足触发条件
   │   ├── 记忆总数超限 → 执行归档
   │   ├── 碎片率超限 → 执行碎片整理
   │   └── 孤儿记忆超限 → 执行图谱重构
   │
   └── 执行全量整理 (dream({ type: ALL }))
```

---

## 9. 文件改动清单

### 9.1 新增文件

| 文件 | 描述 |
|------|------|
| `memory-merger.ts` | 记忆合并器 |
| `graph-reorganizer.ts` | 图谱重构器 |
| `storage-optimizer.ts` | 存储优化器 |

### 9.2 重构文件

| 文件 | 改动类型 | 描述 |
|------|----------|------|
| `types.ts` | 重构 | OrganizationType, OrganizationReport, 配置接口 |
| `dreaming-manager.ts` | 重写 | 依赖注入 + 三阶段流程 |
| `memory-consolidator.ts` | 重构 | 适配 StorageMemoryService |
| `dream-storage.ts` | 重构 | 持久化 OrganizationReport |
| `dream-scheduler.ts` | 保留 | 基本可用 |
| `dream-analyzer.ts` | 删除 | 功能合并到其他组件 |
| `dream-generator.ts` | 删除 | 不再需要叙事生成 |
| `dream-executor.ts` | 删除 | 功能合并到 dreaming-manager |

### 9.3 最终目录结构

```
dreaming-engine/
├── index.ts                    # 导出
├── types.ts                    # 重构: OrganizationType, OrganizationReport
├── dreaming-manager.ts         # 重写: 三阶段流程 + 调度器
│
├── memory-merger.ts            # 新增: 记忆合并器
│   ├── findSimilarGroups()     # 向量搜索找相似
│   ├── mergeGroup()            # 执行合并
│   └── calculateSimilarity()   # 相似度计算
│
├── graph-reorganizer.ts        # 新增: 图谱重构器
│   ├── analyzeGaps()           # 分析图谱缺口
│   ├── rebuildRelation()       # 重建关联
│   └── supplementRelations()   # 补充关联
│
├── storage-optimizer.ts        # 新增: 存储优化器
│   ├── calculateFragmentation() # 计算碎片率
│   ├── findArchivalCandidates() # 找可归档记忆
│   └── defragment()            # 碎片整理
│
├── memory-consolidator.ts      # 重构: 适配新架构
├── dream-storage.ts            # 重构: 持久化 OrganizationReport
└── dream-scheduler.ts          # 保留: 定时调度
```

---

## 10. 实现顺序

### Phase 1: 基础框架

1. **`types.ts`** - 定义新的类型和枚举
2. **`dreaming-manager.ts`** - 核心框架 + 三阶段流程骨架
3. **`dream-storage.ts`** - 持久化 OrganizationReport

### Phase 2: 核心组件

4. **`memory-merger.ts`** - 记忆合并逻辑
5. **`graph-reorganizer.ts`** - 图谱重构逻辑
6. **`storage-optimizer.ts`** - 存储优化逻辑

### Phase 3: 集成与调度

7. **`memory-consolidator.ts`** - 适配新架构
8. **`dream-scheduler.ts`** - 集成到 manager
9. 端到端测试

### Phase 4: 清理

10. 删除 `dream-generator.ts`, `dream-executor.ts`, `dream-analyzer.ts`
11. 更新 `index.ts` 导出

---

## 附录 A: 调用示例

```typescript
import { DreamingManager, OrganizationType } from './dreaming-engine';

// 创建实例
const dreamingManager = new DreamingManager(
  storageMemoryService,
  graphStore,
  palaceStore,
  {
    scheduler: {
      autoOrganize: true,
      organizeInterval: 6 * 60 * 60 * 1000,
    },
  }
);

// 初始化
await dreamingManager.initialize();

// 执行一轮整理
const report = await dreamingManager.dream({
  type: OrganizationType.ALL,
  force: false,
});

console.log(`
整理完成:
- 类型: ${report.type}
- 记忆合并: ${report.memoriesMerged}
- 关联重建: ${report.relationsRebuilt}
- 归档记忆: ${report.memoriesArchived}
- 释放空间: ${report.storageFreed} bytes
- 总耗时: ${report.totalDuration}ms
`);

// 关闭
await dreamingManager.shutdown();
```

---

## 附录 B: 与旧版本对比

| 旧组件 | 新组件 | 变化 |
|--------|--------|------|
| DreamGenerator | (删除) | 不再生成叙事 |
| DreamExecutor | (删除) | 功能合并到 DreamingManager |
| DreamAnalyzer | (删除) | 功能合并到其他组件 |
| Dream (类型) | OrganizationReport | 报告格式完全重定义 |
| DreamType | OrganizationType | 枚举含义完全不同 |
| MemoryConsolidator | MemoryConsolidator | 接口基本保留 |
| DreamStorage | DreamStorage | 增加持久化 |
| DreamScheduler | DreamScheduler | 基本不变 |
