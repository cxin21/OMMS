# Core Memory Module Design

## 1. 模块概述

核心记忆模块是 OMMS 系统的核心组件，负责记忆的创建、存储、召回和管理。

### 1.1 主要功能

- **记忆存储**：创建和管理记忆
- **双评分系统**：独立计算重要性评分和作用域评分
- **分级管理**：session → agent → global 三级作用域
- **遗忘机制**：自动归档/删除低价值记忆
- **强化机制**：被召回的记忆自动提升重要性
- **持久化**：使用 LanceDB 进行数据持久化

## 2. 核心组件

### 2.1 MemoryService

主服务类，提供所有记忆管理功能。

```typescript
class MemoryService {
  async initialize(): Promise<void>
  async extractFromMessages(messages): Promise<ExtractedFact[]>
  async store(params): Promise<Memory>
  async recall(query, options?): Promise<RecallResult>
  async consolidate(params?): Promise<{ archived, deleted, promoted }>
  async boost(id, amount): Promise<Memory>
  async getAll(options?): Promise<Memory[]>
  async getStats(agentId?): Promise<MemoryStats>
  async delete(id): Promise<boolean>
  async clear(): Promise<void>
}
```

### 2.2 ScorerService

评分服务，负责计算和管理记忆的评分。

```typescript
class ScorerService {
  score(input: ScoreInput): number
  calculateRecallPriority(memory, agentId, similarity): number
  boostScopeScore(memory, agentId, isEffectiveUse): number
  shouldPromote(memory): MemoryScope | null
  shouldArchive(memory): boolean
  shouldDelete(memory): boolean
  decideScope(importance): MemoryScope
  decideBlock(importance): MemoryBlock
}
```

### 2.3 Persistence

持久化服务，使用 LanceDB 存储记忆。

```typescript
class Persistence {
  async initialize(dimensions): Promise<void>
  async loadAll(): Promise<Memory[]>
  async save(memory, vector?): Promise<void>
  async update(memory): Promise<void>
  async delete(id): Promise<void>
  async clear(): Promise<void>
  async vectorSearch(vector, limit): Promise<VectorSearchResult[]>
}
```

## 3. 数据模型

### 3.1 Memory

```typescript
interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  scopeScore: number;
  scope: MemoryScope;
  block: MemoryBlock;
  ownerAgentId: string;
  agentId?: string;
  sessionId?: string;
  tags: string[];
  recallByAgents: Record<string, number>;
  usedByAgents: string[];
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  recallCount: number;
  updateCount: number;
  metadata?: Record<string, unknown>;
}
```

### 3.2 双评分系统

#### 重要性评分（Importance）

评估记忆本身的价值：

```
importance = 0.2
├── + 类型权重 (0.08-0.25)
├── + 置信度 × 0.15
├── + 显式请求 × 0.25
├── + 相关记忆数 × 0.02 (上限0.10)
├── + 会话长度 > 10 × 0.05
└── + 轮次 > 5 × 0.05
```

#### 作用域评分（Scope Score）

评估记忆被多Agent共享的程度：

```
scopeScore = 0
├── + 各Agent召回次数 × 0.15 (每个Agent独立计算，上限0.45)
├── + 新Agent首次有效使用 + 0.2
└── + 新Agent有效使用 + 0.1
```

## 4. 作用域升级机制

```
session (scopeScore ≥ 0.3 且 recallCount ≥ 2)
    ↓
agent (scopeScore ≥ 0.6 且 usedByAgents.length ≥ 2)
    ↓
global
```

## 5. 遗忘策略

| 优先级 | 条件 | 操作 |
|-------|------|------|
| 1 | importance < 0.1 且 180天未更新且 updateCount === 0 | 删除 |
| 2 | importance < 0.2 且 30天未访问且 14天未更新 | 归档 |
| 3 | importance < 0.3 且 60天未访问且 30天未更新 | 归档 |

## 6. 召回优先级算法

```typescript
function calculateRecallPriority(
  memory: Memory,
  currentAgentId: string,
  similarity: number
): number {
  let priority = similarity * memory.importance;
  
  let scopeWeight: number;
  if (memory.ownerAgentId === currentAgentId) {
    scopeWeight = 1.0;  // 所有者
  } else if (memory.agentId === currentAgentId) {
    scopeWeight = 0.8;  // 当前Agent
  } else if (memory.scope === "global") {
    scopeWeight = 0.6;
  } else if (memory.scope === "agent") {
    scopeWeight = 0.4;
  } else {
    scopeWeight = 0.2;
  }
  
  const scopeBonus = memory.scopeScore * 0.2;
  
  return priority * scopeWeight + scopeBonus;
}
```

## 7. 持久化存储

### 7.1 存储位置

```
~/.openclaw/omms-data/
├── .manifest files...
└── memories (LanceDB 表)
```

### 7.2 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| content | string | 记忆内容 |
| vector | float[1024] | 向量嵌入 |
| importance | float | 重要性评分 |
| scopeScore | float | 作用域评分 |
| scope | string | 作用域 |
| block | string | 存储块 |
| createdAt | string | 创建时间 |
| ... | ... | ... |

### 7.3 向量索引

使用 IVF_PQ 索引优化向量搜索：

```typescript
await table.createIndex({
  column: "vector",
  indexType: "IVF_PQ",
  numPartitions: 128,
  numSubVectors: 96,
});
```

## 8. 集成其他模块

### 8.1 依赖关系

```
MemoryService
├── ScorerService (同模块)
├── ProfileEngine (profile 模块)
├── EmbeddingService (vector-search 模块)
├── LoggerService (logging 模块)
├── Persistence (同模块)
├── GraphEngine (knowledge-graph 模块)
└── LLMService (llm 模块)
```

## 9. 设计优势

1. **评分解耦**：重要性评分和作用域评分独立计算
2. **渐进式扩展**：记忆通过使用逐渐扩展作用域
3. **灵活召回**：所有者有最高优先级
4. **高效持久化**：LanceDB 提供快速向量搜索
5. **并发安全**：使用互斥锁防止写入冲突
