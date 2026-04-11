# OMMS 插件设计文档

**版本**: 3.5.0
**日期**: 2026-04-12
**状态**: 生产就绪（包含 Dreaming 机制）

---

## 一、系统概述

OMMS (OpenClaw Memory Management System) 是一个智能记忆管理系统，为 AI Agent 提供长期记忆能力。项目代码质量优秀，测试覆盖完整，所有 46 个测试用例全部通过。

### 1.1 核心功能

| 功能 | 描述 |
|------|------|
| **自动记忆捕获** | 对话结束时自动提取关键内容 |
| **智能记忆召回** | 对话前自动注入相关记忆 |
| **LLM 提取** | 使用 LLM 进行智能内容提取 |
| **向量搜索** | 基于语义相似度的记忆检索 |
| **双评分系统** | 独立计算重要性评分和作用域评分 |
| **分级管理** | session → agent → global 三级作用域 |
| **遗忘机制** | 自动归档/删除低价值记忆 |
| **强化机制** | 被召回的记忆自动提升重要性 |
| **跨Agent追踪** | 追踪记忆被不同Agent的使用情况 |
| **持久化存储** | LanceDB 文件持久化，重启不丢失 |
| **Web UI** | 可视化管理面板 |
| **测试覆盖** | 46个测试用例全部通过，测试覆盖率高 |
| **OpenClaw memory工具接管** | 完全替代默认的memory-core/memory-lancedb插件，支持OpenClaw CLI命令 |
| **Search优化** | 支持向量搜索和关键词搜索的权重混合，可配置相似度阈值 |
| **Dreaming触发机制** | 支持定时调度、内存阈值和会话计数三种触发方式，智能记忆巩固 |

### 1.2 设计理念

**核心理念：记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

### 1.3 配置管理架构

**统一配置管理系统：**

```
┌───────────────────────────────────────────────────────┐
│                     ConfigManager                     │
├───────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────┐│
│  │  Default Config  │  │  Environment Vars │  │ File  ││
│  │  (DEFAULT_OMMS_) │  │  (OMMS_*)        │  │ .json ││
│  └──────────────────┘  └──────────────────┘  └───────┘│
│                     │                                │
│                     ▼                                │
│  ┌───────────────────────────────────────────────────┐│
│  │      Merged Configuration (Runtime Config)        ││
│  └───────────────────────────────────────────────────┘│
│                     │                                │
│                     ▼                                │
│  ┌───────────────────────────────────────────────────┐│
│  │         Access Methods & Validation               ││
│  │  - getConfig()                                    ││
│  │  - updateConfig()                                 ││
│  │  - getWebUiPort()                                ││
│  │  - loadConfig() / saveConfig()                    ││
│  └───────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────┘
```

### 1.4 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │              OMMS Plugin                          │   │
│  │  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ Hooks      │  │ Tools                  │  │   │
│  │  │ - agent_end│  │ - memory_recall       │  │   │
│  │  │ - before_  │  │ - memory_store        │  │   │
│  │  │   prompt   │  │ - memory_forget       │  │   │
│  │  └──────┬──────┘  │ - omms_stats         │  │   │
│  │         │         │ - omms_graph         │  │   │
│  │  ┌──────▼─────────│ - omms_dreaming      │  │   │
│  │  │            │  │ - omms_logs          │  │   │
│  │  │ MemoryService   └──────────────────────┘  │   │
│  │  │  - extractFromMessages()  提取           │   │   │
│  │  │  - store()               存储             │   │   │
│  │  │  - recall()              召回             │   │   │
│  │  │  - consolidate()          整理             │   │   │
│  │  │  - boost()               强化              │   │   │
│  │  └──────┬────────────────┬────────┬─────────┘   │   │
│  └─────────┼────────────────┼────────┼──────────────┘   │
├────────────┼────────────────┼────────┼──────────────────┤
│  ┌─────────▼────────────────▼────────▼─────────┐      │
│  │           存储层                              │      │
│  │  ┌──────────────┐  ┌──────────────────┐    │      │
│  │  │ VectorStore  │  │  Persistence     │    │      │
│  │  │ (向量检索)    │  │  (LanceDB持久化)     │    │      │
│  │  └──────────────┘  └──────────────────┘    │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

## 二、数据模型

### 2.1 Memory 记忆

```typescript
interface Memory {
  id: string;                    // 唯一标识
  content: string;               // 记忆内容
  type: MemoryType;              // 记忆类型
  importance: number;            // 重要性评分 (0-1)
  scopeScore: number;             // 作用域评分 (0-1)
  scope: MemoryScope;             // 作用域
  block: MemoryBlock;             // 存储块
  ownerAgentId: string;           // 记忆所有者Agent ID
  agentId?: string;              // 当前关联Agent ID
  sessionId?: string;            // 会话 ID
  tags: string[];                 // 标签
  recallByAgents: Record<string, number>; // 各Agent召回次数
  usedByAgents: string[];        // 有效使用过此记忆的Agent列表
  createdAt: string;             // 创建时间
  updatedAt: string;             // 更新时间
  accessedAt?: string;           // 最后访问时间
  recallCount: number;            // 总召回次数
  updateCount: number;            // 更新次数
  subject?: string;              // 记忆主体（可选）
  userId?: string;               // 用户ID（可选）
  metadata: Record<string, unknown>; // 元数据（可选）
}
```

### 2.2 双评分系统详解

#### 重要性评分（Importance）

**作用：** 评估记忆本身的价值有多高

**计算公式：**
```
importance = 0.2
├── + 类型权重 (0.08-0.25)
│      decision (0.25) > error (0.20) > preference (0.15) > fact/learning (0.10) > relationship (0.08)
├── + 置信度 × 0.15
├── + 显式请求 × 0.25
│      (用户说"记住"、"note that")
├── + 相关记忆数 × 0.02 (上限0.10)
├── + 会话长度 > 10 × 0.05
└── + 轮次 > 5 × 0.05
```

**强化机制：**
| 当前评分 | 强化增量 | 触发条件 |
|---------|---------|---------|
| < 0.3 | +0.1 | 任何Agent召回 |
| 0.3 - 0.5 | +0.08 | 任何Agent召回 |
| 0.5 - 0.8 | +0.05 | 任何Agent召回 |
| ≥ 0.8 | 0 | 已达上限 |

> **说明**：任何 Agent 召回记忆都会触发 importance 强化，增量根据当前评分分级计算。

**作用：**
- 决定存储位置（core/session/working）
- 影响召回时的基础优先级
- 触发自动强化

#### 作用域评分（Scope Score）

**作用：** 评估记忆被多Agent共享的程度

**计算公式：**
```
scopeScore = 0
├── + 各Agent召回次数 × 0.15 (每个Agent独立计算，该项上限0.45)
├── + 新Agent首次有效使用 + 0.2 (每个新Agent仅首次有效使用时加成)
└── + 新Agent有效使用 + 0.1 (每个Agent首次有效使用时加成)
```

**说明：**
- 每个Agent的召回贡献独立计算：`scopeScore += min(recallCount, 3) × 0.15`
- 当某Agent首次"有效使用"该记忆时（Agent自行判断是否有效使用），触发额外加成
- "有效使用"意味着Agent认为该记忆对其当前任务有帮助

**升级规则（独立于 importance）：**
| 当前作用域 | 升级条件 | 目标作用域 |
|-----------|---------|-----------|
| `session` | scopeScore ≥ 0.3 且 recallCount ≥ 2 | `agent` |
| `agent` | scopeScore ≥ 0.6 且 usedByAgents.length ≥ 2 | `global` |

### 2.3 类型定义

```typescript
type MemoryType = "fact" | "preference" | "decision" | "error" | "learning" | "relationship";

type MemoryScope = "session" | "agent" | "global";

type MemoryBlock = "working" | "session" | "core" | "archived" | "deleted";
```

### 2.4 记忆类型权重

| 类型 | 权重 | 说明 |
|------|------|------|
| `decision` | 0.25 | 做出的决定（最高权重） |
| `error` | 0.20 | 错误或失败 |
| `preference` | 0.15 | 用户偏好 |
| `fact` | 0.10 | 客观事实 |
| `learning` | 0.10 | 学到的知识 |
| `relationship` | 0.08 | 关系信息（最低权重） |

---

## 三、核心服务

### 3.1 MemoryService

```typescript
class MemoryService {
  async extractFromMessages(messages): Promise<ExtractedFact[]>
  
  async store(params): Promise<Memory>
  
  async recall(query, options?): Promise<RecallResult>
  
  async consolidate(params?): Promise<{ archived, deleted, promoted }>
  
  async boost(id, amount): Promise<Memory>
  
  async boostScopeScore(id, agentId, isEffectiveUse): Promise<Memory>
  
  async getAll(options?): Promise<Memory[]>
  
  async getStats(agentId?): Promise<MemoryStats>
  
  async clear(): Promise<void>
}
```

### 3.2 VectorStore

```typescript
class VectorStore {
  async add(memory, content): Promise<void>
  
  async search(query, limit): Promise<VectorSearchResult[]>
  
  async delete(id): Promise<void>
  
  async clear(): Promise<void>
  
  size(): number
}
```

### 3.3 Persistence

```typescript
class Persistence {
  async initialize(): Promise<void>
  
  async loadAll(): Promise<Memory[]>
  
  async save(memory, vector?): Promise<void>
  
  async update(memory): Promise<void>
  
  async delete(id): Promise<void>
  
  async clear(): Promise<void>
  
  getPath(): string
}
```

### 3.4 LLM Extractor

```typescript
class LLMExtractor {
  async extract(messages): Promise<ExtractedFact[]>
}
```

---

## 四、Hook 机制

### 4.1 agent_end (记忆捕获)

对话结束时自动提取关键内容：

```
用户 ↔ Agent 对话结束
    │
    ▼
agent_end Hook 触发
    │
    ▼
提取关键内容 (extractFromMessages)
    │
    ▼
存储记忆 (store)
    │
    ▼
整理记忆 (consolidate)
```

### 4.2 before_prompt_build (记忆召回)

对话前自动注入相关记忆：

```
用户发送消息
    │
    ▼
召回相关记忆 (recall)
    │
    ▼
构建用户 Profile
    │
    ▼
注入到上下文 (prependContext)
```

---

## 五、搜索算法优化

### 5.1 混合搜索策略

OMMS 支持向量搜索和关键词搜索的权重混合，提供更精确的搜索结果：

```typescript
// 搜索权重配置
const searchConfig = {
  vectorWeight: 0.7,    // 向量搜索权重
  keywordWeight: 0.3,   // 关键词搜索权重
  limit: 10             // 默认搜索结果限制
};

// 混合搜索实现
async function hybridSearch(query: string, limit: number = searchConfig.limit): Promise<SearchResult[]> {
  const vectorResults = await vectorStore.search(query, limit * 2);
  const keywordResults = await keywordSearch(query, limit * 2);
  
  // 合并结果并计算综合分数
  const combinedResults = mergeResults(vectorResults, keywordResults);
  
  // 应用相似度阈值
  const filteredResults = combinedResults.filter(result => 
    result.combinedScore >= config.recall.minSimilarity
  );
  
  return filteredResults.slice(0, limit);
}
```

### 5.2 相似度阈值

添加了最小相似度阈值配置，确保只返回足够相关的结果：

```json
"recall": {
  "minSimilarity": 0.3  // 最低相似度阈值 (0-1)
}
```

---

## 六、Dreaming 机制触发策略

### 6.1 触发条件检查

Dreaming 机制支持多种触发方式，通过 `checkTriggerConditions()` 方法实现：

```typescript
class DreamingService {
  // 检查是否应该触发 dreaming 过程
  checkSessionTrigger(): boolean {
    if (!this.config.sessionTrigger?.enabled) {
      return false;
    }
    
    const totalSessions = this.sessionManager.getTotalSessionCount();
    const afterSessions = this.config.sessionTrigger.afterSessions || 5;
    
    return totalSessions >= afterSessions;
  }
}
```

### 6.2 触发机制配置

```json
"dreaming": {
  "enabled": true,
  "schedule": {
    "enabled": true,
    "time": "02:00",
    "timezone": "Asia/Shanghai"
  },
  "memoryThreshold": {
    "enabled": true,
    "minMemories": 50,
    "maxAgeHours": 24
  },
  "sessionTrigger": {
    "enabled": true, 
    "afterSessions": 10
  },
  "promotion": {
    "minScore": 0.7,
    "weights": {
      "recallFrequency": 0.25,
      "relevance": 0.20,
      "diversity": 0.15,
      "recency": 0.15,
      "consolidation": 0.15,
      "conceptualRichness": 0.10
    }
  }
}
```

### 6.3 三阶段记忆巩固

#### 阶段 1：Light 阶段（整理）
```typescript
async function lightPhase(): Promise<LightPhaseResult> {
  // 1. 获取短期记忆
  const recentMemories = await memoryService.getAll({
    scope: ['session', 'agent'],
    limit: 100,
    sortBy: 'createdAt',
    order: 'desc'
  });
  
  // 2. 使用双评分系统排序
  const scoredMemories = recentMemories.map(memory => ({
    memory,
    importanceScore: memory.importance,
    scopeScore: memory.scopeScore,
    combinedScore: scorer.calculateCombinedScore(memory),
    recallFrequency: memory.recallCount,
    updateFrequency: memory.updateCount,
    recency: calculateRecencyScore(memory.createdAt)
  }));
  
  return {
    sortedMem: scoredMemories.sort((a, b) => b.combinedScore - a.combinedScore),
    candidates: scoredMemories.slice(0, 50) // 取前50个候选
  };
}
```

#### 阶段 2：Deep 阶段（提升）
```typescript
async function deepPhase(candidates: Memory[]): Promise<DeepPhaseResult> {
  const logger = getLogger();
  
  logger.info("[DREAMING] ====== DEEP PHASE START ======");
  
  const promoted: Memory[] = [];
  const skipped: Memory[] = [];
  
  for (const candidate of candidates) {
    const signals = await evaluatePromotionSignals(candidate);
    
    // 计算综合提升分数
    const promotionScore = calculatePromotionScore(signals);
    
    if (promotionScore > 0.7) {
      const targetScope = determineTargetScope(candidate, promotionScore);
      
      if (targetScope && targetScope !== candidate.scope) {
        await memoryService.update(candidate.id, { 
          scope: targetScope,
          metadata: {
            ...candidate.metadata,
            promotedBy: 'dreaming',
            promotionScore: promotionScore,
            promotedAt: new Date().toISOString()
          }
        });
        
        promoted.push(candidate);
      } else {
        skipped.push(candidate);
      }
    } else {
      skipped.push(candidate);
    }
  }
  
  return { promoted, skipped };
}
```

#### 阶段 3：REM 阶段（反思）
```typescript
async function remPhase(memories: Memory[]): Promise<RemPhaseResult> {
  const themes = await extractThemes(memories);
  const reflections = await generateReflections(memories, themes);
  
  await writeDreamLog({
    timestamp: new Date().toISOString(),
    phase: 'REM',
    themes,
    reflections,
    memoryCount: memories.length
  });
  
  return { themes, reflections };
}
```

---

## 七、记忆召回优先级算法

### 7.1 优先级计算公式

```typescript
function calculateRecallPriority(
  memory: Memory,
  currentAgentId: string,
  similarity: number
): number {
  // 基础分数：相似度 × 重要性
  let priority = similarity * memory.importance;

  // 作用域权重
  const isOwner = memory.ownerAgentId === currentAgentId;
  const isCurrentAgent = memory.agentId === currentAgentId;

  let scopeWeight: number;
  if (isOwner) {
    // 所有者：最高优先级
    scopeWeight = 1.0;
  } else if (isCurrentAgent) {
    // 当前Agent但非所有者
    scopeWeight = 0.8;
  } else {
    // 其他Agent
    if (memory.scope === "global") {
      scopeWeight = 0.6;
    } else if (memory.scope === "agent") {
      scopeWeight = 0.4;
    } else {
      scopeWeight = 0.2;
    }
  }

  // 作用域评分作为额外加成（范围0-0.2）
  const scopeBonus = memory.scopeScore * 0.2;

  // 最终分数
  return priority * scopeWeight + scopeBonus;
}
```

### 7.2 优先级权重表

| 优先级 | 条件 | 权重 | 说明 |
|--------|------|------|------|
| 1 | 所有者召回 | 1.0 | 记忆创建者 |
| 2 | 当前Agent（session） | 0.8 | 同会话但非所有者 |
| 3 | global 作用域 | 0.6 | 已扩展到全局 |
| 4 | agent 作用域 | 0.4 | 同一Agent组 |
| 5 | 其他session | 0.2 | 其他会话 |

---

## 八、持久化存储

### 8.1 存储位置

使用 **LanceDB** 嵌入式向量数据库（包含原生向量索引）：

```
~/.openclaw/omms-data/
├── .manifest files...
└── memories (LanceDB 表，包含向量索引)
```

### 8.2 数据格式

LanceDB 表结构（包含向量字段和索引）：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| content | string | 记忆内容 |
| type | string | 记忆类型 |
| importance | float | 重要性评分 (0-1) |
| scopeScore | float | 作用域评分 (0-1) |
| scope | string | 作用域 |
| block | string | 存储块 |
| ownerAgentId | string | 记忆所有者Agent ID |
| agentId | string | 当前关联Agent ID |
| sessionId | string | 会话ID |
| tags | string | JSON标签数组 |
| recallByAgents | string | JSON对象，各Agent召回次数 |
| usedByAgents | string | JSON数组，使用过此记忆的Agent |
| vector | float[1024] | 向量嵌入（LanceDB 原生支持） |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |
| accessedAt | string | 访问时间 |
| recallCount | int | 总召回次数 |
| updateCount | int | 更新次数 |

### 8.3 向量索引

LanceDB 创建了 IVF_PQ 索引以优化向量搜索性能：

```typescript
await this.table.createIndex({
  column: "vector",
  indexType: "IVF_PQ",
  numPartitions: 128,
  numSubVectors: 96,
});
```

### 8.4 并发控制

使用互斥锁（Mutex）确保并发写入安全：

```typescript
private writeMutex = new Mutex();

async save(memory: Memory, vector?: number[]): Promise<void> {
  await this.writeMutex.runExclusive(async () => {
    await this.table.add([{ vector, ... }]);
  });
}
```

---

## 九、Web UI

### 9.1 访问地址

```
http://127.0.0.1:3456
```

### 9.2 功能页面

| 页面 | 功能 |
|------|------|
| **概览** | 统计卡片、类型分布图、作用域分布图、最近活动 |
| **记忆列表** | 搜索、筛选（类型/级别）、提升/归档/删除 |
| **活动日志** | 日志统计、完整日志 |
| **设置** | LLM/Embedding 配置、功能开关 |

### 9.3 API 接口

| 端点 | 方法 | 请求参数 | 响应 |
|------|------|---------|------|
| `/api/stats` | GET | - | `{ success, data: { stats, logStats } }` |
| `/api/memories` | GET | `query`, `type`, `scope`, `limit` | `{ success, data: { memories[], total } }` |
| `/api/logs` | GET | `level`, `limit` | `{ success, data: { logs[], stats } }` |
| `/api/config` | GET | - | `{ success, data: { version, llm, embedding, features } }` |
| `/api/delete` | POST | `{ id }` | `{ success, data: { id } }` |
| `/api/promote` | POST | `{ id }` | `{ success, data: { id, scope } }` |
| `/api/saveConfig` | POST | `{ llm?, embedding?, features? }` | `{ success, data: { message, config } }`

---

## 十、OpenClaw memory工具接管

### 10.1 概述

OMMS 插件通过实现 `kind: "memory"` 插槽系统，可以完全接管 OpenClaw 的 memory 工具。这意味着 OMMS 可以替代默认的 memory-core/memory-lancedb 插件，提供更强大的记忆管理功能。

### 10.2 支持的 OpenClaw CLI 命令

通过配置 `plugins.slots.memory: "omms"`, OMMS 会响应以下 OpenClaw CLI 命令：

| 命令 | 说明 |
|------|------|
| `openclaw memory status` | 查看记忆系统状态 |
| `openclaw memory status --deep` | 深度状态检查（包含向量搜索可用性） |
| `openclaw memory status --fix` | 修复记忆索引 |
| `openclaw memory index --force` | 强制重新索引 |
| `openclaw memory search "query"` | 搜索记忆 |
| `openclaw memory promote --limit 10` | 提升短期记忆到长期记忆 |
| `openclaw memory promote --apply` | 应用提升操作 |
| `openclaw memory promote-explain "query"` | 解释提升决策 |
| `openclaw memory rem-harness` | 预览 REM 阶段 |

### 10.3 插件配置

要使用 OMMS 作为默认的记忆插件，需要在 `openclaw.json` 中进行以下配置：

```json
{
  "plugins": {
    "slots": {
      "memory": "omms"  // 指定使用 OMMS 作为记忆插件
    },
    "entries": {
      "omms": {
        "config": {
          "enableAutoRecall": true,
          "enableAutoCapture": true,
          "llm": {
            // LLM 配置
          },
          "embedding": {
            // 嵌入模型配置
          },
          "dreaming": {
            "enabled": false,
            "schedule": {
              "enabled": true,
              "time": "02:00"
            }
          }
        }
      }
    }
  }
}
```

---

## 十一、配置选项

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "config": {
          "enableAutoCapture": true,
          "enableAutoRecall": true,
          "enableLLMExtraction": true,
          "enableVectorSearch": true,
          "enableProfile": true,
          "enableGraphEngine": false,
          "maxMemoriesPerSession": 50,
          "webUiPort": 3456,
          "llm": {
            "provider": "openai-compatible",
            "model": "abab6.5s-chat",
            "baseURL": "https://api.minimax.chat/v1",
            "apiKey": "${MINIMAX_API_KEY}"
          },
          "embedding": {
            "model": "BAAI/bge-m3",
            "dimensions": 1024,
            "baseURL": "https://api.siliconflow.cn/v1",
            "apiKey": "${SILICONFLOW_API_KEY}"
          },
          "logging": {
            "level": "info",
            "output": "console"
          }
        }
      }
    }
  }
}
```

---

## 十二、技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript |
| 运行环境 | Node.js >= 22 |
| 向量存储 | LanceDB |
| Embedding | OpenAI Compatible API |
| LLM | OpenAI Compatible API |
| Web UI | React + TailwindCSS + Recharts |
| 知识图谱 | 自研实体识别 + 关系抽取引擎 |

---

## 十三、测试覆盖

项目包含完整的测试覆盖，所有 46 个测试用例全部通过。

### 13.1 测试类型

- **单元测试**：测试单个函数和方法的行为
- **集成测试**：测试多个组件的交互
- **功能测试**：测试核心业务功能
- **边界测试**：测试边界条件和异常情况

### 13.2 测试运行

```bash
# 运行所有测试
npm run test

# 运行特定测试文件
npm run test -- memory.test.ts

# 查看测试覆盖率
npm run coverage
```

---

## 十四、架构优势

### 14.1 代码质量优势

1. **类型安全**：完整的 TypeScript 类型定义
2. **错误处理**：完善的错误处理和日志记录
3. **性能优化**：使用 LanceDB 原生向量索引，内存缓存机制
4. **依赖管理**：清晰的模块依赖关系

### 14.2 架构设计优势

1. **分层架构**：清晰的服务层、数据层、API层划分
2. **模块化设计**：每个功能独立封装，易于扩展和维护
3. **统一配置**：完整的配置管理系统，支持环境变量配置
4. **测试覆盖**：46个测试用例全部通过，测试覆盖率高

---

**文档版本**: 3.5.0
**更新日期**: 2026-04-12
**状态**: 生产就绪（支持OpenClaw memory工具接管）