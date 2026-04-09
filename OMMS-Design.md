# OMMS 插件设计文档

**版本**: 3.0.0
**日期**: 2026-04-12
**状态**: 生产就绪（包含 Dreaming 机制）

---

## 一、系统概述

OMMS (OpenClaw Memory Management System) 是一个智能记忆管理系统，为 AI Agent 提供长期记忆能力。

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

### 1.2 设计理念

**核心理念：记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

### 1.3 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │              OMMS Plugin                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────┐  │   │
│  │  │ Hooks      │  │ Tools      │  │ Web UI  │  │   │
│  │  │ - agent_end│  │ - recall   │  │ - 概览   │  │   │
│  │  │ - before_  │  │ - write    │  │ - 记忆   │  │   │
│  │  │   prompt   │  │ - stats    │  │ - 日志   │  │   │
│  │  └──────┬──────┘  └──────┬─────┘  └────┬───┘  │   │
│  │         │                │             │        │   │
│  │  ┌──────▼────────────────▼─────────────▼────┐   │   │
│  │  │            MemoryService                  │   │   │
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

**示例演化：**
```
Agent A 创建记忆:
  importance = 0.6
  scopeScore = 0
  recallCount = 0
  usedByAgents = []
  ownerAgentId = "Agent A"
  scope = "session"

Agent A 召回2次:
  Agent A 的召回贡献: min(2, 3) × 0.15 = 0.30
  scopeScore += 0.30
  recallCount = 2
  → scopeScore = 0.30 ✓ 触发升级条件：session → agent

Agent B 召回并有效使用:
  Agent B 的召回贡献: min(1, 3) × 0.15 = 0.15
  首次有效使用加成: 0.2 + 0.1 = 0.30
  scopeScore += 0.15 + 0.30 = 0.45
  recallCount = 3
  usedByAgents = ["Agent B"]
  → scopeScore = 0.75 ✓ 但 usedByAgents.length = 1，不满足 global 条件

Agent C 召回并有效使用:
  Agent C 的召回贡献: min(1, 3) × 0.15 = 0.15
  首次有效使用加成: 0.2 + 0.1 = 0.30
  scopeScore += 0.15 + 0.30 = 0.45
  recallCount = 4
  usedByAgents = ["Agent B", "Agent C"]
  → scopeScore = 1.20 (上限1.0)，usedByAgents.length = 2 ✓
  → 触发升级条件：agent → global
```

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

## 五、记忆召回优先级算法

### 5.1 优先级计算公式

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

### 5.2 优先级权重表

| 优先级 | 条件 | 权重 | 说明 |
|--------|------|------|------|
| 1 | 所有者召回 | 1.0 | 记忆创建者 |
| 2 | 当前Agent（session） | 0.8 | 同会话但非所有者 |
| 3 | global 作用域 | 0.6 | 已扩展到全局 |
| 4 | agent 作用域 | 0.4 | 同一Agent组 |
| 5 | 其他session | 0.2 | 其他会话 |

### 5.3 最终分数计算

```
最终分数 = 相似度 × 重要性 × 作用域权重 + 作用域评分 × 0.2
```

**示例：**
```
记忆A（所有者召回）:
  similarity = 0.9
  importance = 0.7
  scopeScore = 0.3
  分数 = 0.9 × 0.7 × 1.0 + 0.3 × 0.2 = 0.63 + 0.06 = 0.69

记忆B（其他Agent，global作用域）:
  similarity = 0.9
  importance = 0.8
  scopeScore = 0.6
  分数 = 0.9 × 0.8 × 0.6 + 0.6 × 0.2 = 0.432 + 0.12 = 0.552
```

---

## 六、遗忘策略

### 6.1 遗忘条件

遗忘操作分为**删除**和**归档**两类，按以下优先级检查：

| 优先级 | 条件 | 操作 | 说明 |
|-------|------|------|------|
| 1 (最高) | importance < 0.1 **且** 180天未更新 **且** updateCount === 0 | **删除** | 从未更新的死记忆（永久删除，不可恢复） |
| 2 | importance < 0.2 **且** 30天未访问 **且** 14天未更新 | **归档** | 低价值冷门记忆 |
| 3 | importance < 0.3 **且** 60天未访问 **且** 30天未更新 | **归档** | 较低价值但偶尔使用的记忆 |

> **重要**：
> - 条件之间是**互斥**的，满足高优先级条件后不会检查低优先级
> - `importance < 0.1` 的记忆一定同时满足 `importance < 0.2`，但只要 `updateCount > 0` 或未满180天，就不会触发删除条件
> - 归档的记忆仍然可以被召回（但优先级较低），删除的记忆不可恢复

### 6.2 遗忘流程

```
每条记忆定期检查（由 consolidate() 触发）
    │
    ▼
检查删除条件 → 满足 → 删除记忆（永久移除）
    │
    │ 不满足
    ▼
检查归档条件 → 满足 → 归档记忆（block = "archived"）
    │
    │ 不满足
    ▼
检查作用域升级 → 满足 → 升级作用域（不影响 block）
```

> **注意**：遗忘流程与作用域升级是**独立的**两个检查维度：
> - 遗忘检查关注 `importance`、`accessedAt`、`updatedAt`
> - 作用域升级关注 `scopeScore`、`recallCount`、`usedByAgents`

### 6.3 存储块转换

存储块（block）由初始 importance 决定，但会被遗忘检查降级：

```
存储时根据 importance 确定 block：
┌─────────────────────────────────────────────┐
│ importance < 0.5  →  block = "working"      │
│ importance ≥ 0.5  →  block = "session"     │
│ importance ≥ 0.8  →  block = "core"        │
└─────────────────────────────────────────────┘

随着 importance 变化，block 可能会升级：
working → session → core

遗忘检查可能导致 block 降级：
core → archived → deleted  （注意：core 状态不会直接被遗忘检查降级）
                                   
记忆被归档后，可能通过以下方式恢复：
archived → (被召回且满足条件) → 恢复原 block
```

> **设计说明**：
> - `core` 状态的核心记忆**不会被遗忘检查直接降级**到 `archived`
> - 只有当 `core` 记忆被多次召回使用，触发 importance 下降到特定阈值时，才会考虑归档
> - 实际上，core 记忆由于 importance ≥ 0.8，通常不会满足遗忘条件（importance < 0.2 或 < 0.3）

---

## 七、作用域升级机制

### 7.1 升级条件

作用域升级完全由 **scopeScore** 决定，与 **importance** 独立：

```
session (作用域评分 0)
    ↓ scopeScore ≥ 0.3 且 recallCount ≥ 2
agent (作用域评分 0.3-0.6)
    ↓ scopeScore ≥ 0.6 且 usedByAgents.length ≥ 2
global (作用域评分 ≥ 0.6)
```

### 7.2 升级判断逻辑

```typescript
shouldPromoteToAgent(memory: Memory): boolean {
  const hasMultipleRecalls = memory.recallCount >= 2;
  return memory.scopeScore >= 0.3 && hasMultipleRecalls && memory.scope === "session";
}

shouldPromoteToGlobal(memory: Memory): boolean {
  const hasMultipleAgents = memory.usedByAgents.length >= 2;
  return memory.scopeScore >= 0.6 && hasMultipleAgents && memory.scope === "agent";
}
```

### 7.3 跨Agent使用追踪

每次召回记忆时：

1. **增加召回计数**
   ```typescript
   memory.recallCount++;
   memory.recallByAgents[agentId] = (memory.recallByAgents[agentId] || 0) + 1;
   ```

2. **增加作用域评分**
   ```typescript
   memory.scopeScore = Math.min(memory.scopeScore + 0.15, 1.0);
   ```

3. **检查是否有效使用**
   ```typescript
   if (isEffectiveUse && !memory.usedByAgents.includes(agentId)) {
     memory.usedByAgents.push(agentId);
     memory.scopeScore += 0.2;  // 新Agent使用
     memory.scopeScore += 0.1;  // 有效使用
   }
   ```

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

### 8.4 向量搜索流程

```
用户查询
    │
    ▼
生成查询向量 (embedding)
    │
    ▼
调用 persistence.vectorSearch(queryVector, limit * 2)
    │
    ▼
LanceDB 执行向量相似度搜索
    │
    ▼
返回 { id, score } 列表（向量相似度分数）
    │
    ▼
遍历 IN_MEMORY_STORE 中的所有记忆
    │
    ├── 尝试从向量搜索结果中找到匹配的 id
    │   └── 找到 → 使用向量相似度作为 similarity
    │
    └── 未找到 → 使用文本相似度 fallback（关键词匹配）
    │
    ▼
为每条记忆计算最终召回优先级
    │
    ▼
返回排序后的记忆列表
```

> **说明**：
> - 向量搜索返回的是 ID 和相似度分数，不是完整的记忆对象
> - 完整的记忆数据从 `IN_MEMORY_STORE`（内存缓存）中获取
> - 如果向量搜索失败或结果不足，会自动使用文本相似度作为 fallback
> - 最终优先级 = 向量相似度 + 作用域权重 + scopeScore 加成

### 8.5 生命周期

```
插件启动
    │
    ▼
连接 LanceDB (~/.openclaw/omms-data/)
    │
    ▼
加载所有记忆到 IN_MEMORY_STORE（内存缓存）
    │
    ▼
运行时操作：
    ├── 存储新记忆 → 同时写入 IN_MEMORY_STORE 和 LanceDB
    ├── 更新记忆   → 同时更新 IN_MEMORY_STORE 和 LanceDB
    └── 删除记忆   → 同时从 IN_MEMORY_STORE 和 LanceDB 移除
    │
    ▼
插件重启
    │
    ▼
重复第 1-3 步，数据自动恢复
```

### 8.6 并发控制

使用互斥锁（Mutex）确保并发写入安全：

```typescript
private writeMutex = new Mutex();

async save(memory: Memory, vector?: number[]): Promise<void> {
  await this.writeMutex.runExclusive(async () => {
    await this.table.add([{ vector, ... }]);
  });
}
```

> **注意**：`IN_MEMORY_STORE` 的读写操作不需要锁保护，因为 JavaScript/TypeScript 是单线程的。

### 8.7 架构优势

| 特性 | 说明 |
|------|------|
| **完全持久化** | 向量和元数据都存储在 LanceDB |
| **重启不丢失** | 重启后自动加载已有数据 |
| **内存加速** | 热数据在 IN_MEMORY_STORE，读取无需磁盘 IO |
| **原生向量索引** | LanceDB 内置 IVF_PQ 索引 |
| **高效搜索** | 向量搜索由 LanceDB 优化 |
| **并发安全** | 互斥锁防止写入冲突 |

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
| `/api/saveConfig` | POST | `{ llm?, embedding?, features? }` | `{ success, data: { message, config } }` |

#### 请求参数详情

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索查询（用于向量搜索） |
| `type` | string | 记忆类型过滤：`fact`, `preference`, `decision`, `error`, `learning`, `relationship` |
| `scope` | string | 作用域过滤：`session`, `agent`, `global` |
| `level` | string | 日志级别过滤：`debug`, `info`, `warn`, `error` |
| `limit` | number | 返回数量限制，默认 100 |
| `id` | string | 记忆 ID |

#### 响应格式

所有 API 响应都遵循统一格式：

```typescript
interface ApiResponse<T> {
  success: boolean;  // 请求是否成功
  data?: T;          // 成功时的数据
  error?: string;    // 失败时的错误信息
}
```

---

## 十、配置选项

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
  }```
}
```

---

## 十一、Dreaming 机制

### 11.1 概述

Dreaming 是一个实验性的智能记忆巩固系统，模拟人类睡眠时的记忆整合过程。它与 OMMS 的双评分系统深度集成，实现自动化记忆管理。

### 11.2 三阶段记忆巩固

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

**功能：**
- 整理短期记忆材料
- 暂存和组织碎片信息
- 为深度处理做准备

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

**加权信号：**
- **召回频率** (25%)
- **检索相关性** (20%)
- **查询多样性** (15%)
- **时间新近度** (15%)
- **跨天整合** (15%)
- **概念丰富度** (10%)

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

**功能：**
- 提取主题和模式
- 生成人类可读的反思报告
- 写入 `DREAMS.md` 文件

### 11.3 触发机制

#### 自动触发
```typescript
interface DreamingTrigger {
  // 时间触发
  schedule: {
    enabled: boolean;
    time: string;        // "02:00" - 每天凌晨2点
    timezone: string;    // "Asia/Shanghai"
  };
  
  // 数量触发
  memoryThreshold: {
    enabled: boolean;
    minMemories: number;  // 50条记忆时触发
    maxAgeHours: number; // 24小时内
  };
  
  // 会话触发
  sessionTrigger: {
    enabled: boolean;
    afterSessions: number; // 10个会话后触发
  };
}
```

#### 手动触发
```bash
# CLI 命令
omms dreaming start
omms dreaming status
omms dreaming stop

# Web UI 按钮
[开始 Dreaming] [查看状态] [停止]
```

### 11.4 日志系统

Dreaming 机制集成了详细的日志记录系统，每个阶段都有完整的日志输出。

#### 11.4.1 阶段日志

```typescript
// Light 阶段日志
logger.info("[DREAMING] ====== LIGHT PHASE START ======");
logger.info("[DREAMING] Retrieved memories", {
  count: recentMemories.length
});
logger.debug("[DREAMING] Top candidates", {
  top10: sortedMem.slice(0, 10).map(m => ({
    id: m.memory.id,
    importance: m.importanceScore.toFixed(2),
    scope: m.scopeScore.toFixed(2),
    combined: m.combinedScore.toFixed(2)
  }))
});

// Deep 阶段日志
logger.info("[DREAMING] ====== DEEP PHASE START ======");
logger.debug("[DREAMING] Evaluating promotion signals", {
  memoryId,
  signals: {
    recallFrequency,
    relevance,
    diversity,
    recency,
    consolidation,
    conceptualRichness
  }
});
logger.info("[DREAMING] Memory promoted", {
  id: candidate.id,
  from: candidate.scope,
  to: targetScope,
  score: promotionScore.toFixed(3)
});

// REM 阶段日志
logger.info("[DREAMING] ====== REM PHASE START ======");
logger.info("[DREAMING] Extracted themes", {
  count: themes.length,
  themes: themes.slice(0, 5).map(t => t.name)
});
logger.debug("[DREAMING] Generated reflections", {
  count: reflections.length
});
```

#### 11.4.2 日志输出

```typescript
// 输出格式
interface DreamingLog {
  timestamp: string;
  phase: 'LIGHT' | 'DEEP' | 'REM' | 'COMPLETE';
  level: 'info' | 'debug' | 'warning' | 'error';
  message: string;
  data: {
    // 阶段相关数据
    memoryCount?: number;
    themesExtracted?: number;
    reflectionsGenerated?: number;
    promotedCount?: number;
    skippedCount?: number;
    
    // 性能数据
    duration?: number;
    memoryAccessTime?: number;
    llmResponseTime?: number;
  };
}
```

#### 11.4.3 日志位置

- **控制台输出**：OpenClaw Gateway 日志
- **文件输出**：`~/.openclaw/omms-dreaming.log`
- **Web UI**：活动日志页面

### 11.5 配置参数

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "config": {
          "dreaming": {
            "enabled": false,
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
            },
            "output": {
              "path": "~/.openclaw/memory/DREAMS.md",
              "maxReflections": 5,
              "maxThemes": 10
            },
            "logging": {
              "level": "info",
              "consoleOutput": true,
              "fileOutput": true,
              "outputPath": "~/.openclaw/omms-dreaming.log",
              "maxFileSize": "10MB",
              "maxFiles": 5
            }
          }
        }
      }
    }
  }
}
```

---

## 十二、知识图谱引擎

### 11.1 功能概述

知识图谱引擎（Knowledge Graph Engine）是一个可选功能，通过实体识别和关系抽取来追踪记忆之间的关联。

**启用方式：**
```json
{
  "enableGraphEngine": true
}
```

### 11.2 核心功能

| 功能 | 说明 |
|------|------|
| **实体提取** | 从记忆内容中自动提取实体（项目、人、技术栈等） |
| **关系抽取** | 识别实体间的关系（uses, depends_on, part_of 等） |
| **图查询** | 搜索相关实体和路径 |
| **子图提取** | 获取某个实体周围的关联子图 |

### 11.3 关系类型

| 关系类型 | 模式示例 | 说明 |
|---------|---------|------|
| `uses` | X uses Y | X 使用 Y |
| `depends_on` | X depends on Y | X 依赖 Y |
| `part_of` | X is part of Y | X 是 Y 的一部分 |
| `causes` | X causes Y | X 导致 Y |
| `precedes` | X precedes Y | X 在 Y 之前 |
| `resolves` | X resolves Y | X 解决 Y |

### 11.4 工作流程

#### agent_end Hook（记忆捕获阶段）

```
agent_end Hook 触发
    │
    ▼
提取对话中的关键内容（extractFromMessages）
    │
    ▼
存储为记忆（store）
    │
    ▼
[enableGraphEngine = true]
    │
    ├── 是 → 调用 graphEngine.process() 处理记忆内容
    │         └── 提取实体和关系，更新知识图谱
    │
    └── 否 → 跳过知识图谱处理
```

#### before_prompt_build Hook（记忆召回阶段）

```
before_prompt_build Hook 触发
    │
    ▼
召回相关记忆（recall）
    │
    ▼
构建用户 Profile
    │
    ▼
[enableGraphEngine = true]
    │
    ├── 是 → 调用 graphEngine.search() 查询相关实体
    │         │
    │         ├── 找到相关实体 → 注入知识图谱上下文
    │         │
    │         └── 未找到 → 不注入
    │
    └── 否 → 跳过知识图谱处理
    │
    ▼
将所有上下文（Profile + 记忆 + 知识图谱）注入 prependContext
    │
    ▼
增强 Agent 的上下文理解
```

> **注入顺序**：
> 1. 用户 Profile 信息
> 2. 相关记忆列表
> 3. 知识图谱实体和关系（如果启用且有结果）

### 11.5 API 接口

#### GraphEngine 类

```typescript
class GraphEngine {
  // 处理内容，提取实体和关系
  async process(content: string): Promise<void>

  // 搜索相关实体和路径
  async search(query: string): Promise<{
    nodes: GraphNode[];
    paths: GraphEdge[][];
  }>

  // 获取某个实体周围的子图
  getSubgraph(centerId: string, depth: number = 2): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  }
}
```

#### 数据结构

```typescript
interface GraphNode {
  id: string;
  name: string;
  type: "entity" | "concept";
  aliases: string[];
  mentionCount: number;
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  weight: number;
  evidence: string[];
  createdAt: string;
}
```

### 11.6 图上下文格式

当知识图谱查询到相关实体时，会生成以下格式的上下文：

```
[Knowledge Graph Context]
Entities: 实体1, 实体2, 实体3

Relations:
实体1 --[uses]--> 实体2
实体2 --[depends_on]--> 实体3
```

### 11.7 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableGraphEngine` | boolean | `false` | 是否启用知识图谱引擎 |

### 11.8 使用示例

**自动处理流程：**
```
Agent 与用户对话结束
    ↓
自动提取关键内容并存储为记忆
    ↓
自动调用 graphEngine.process() 处理记忆
    ↓
例如记忆内容："用户使用 TypeScript 开发 React 项目"
    ↓
提取实体：
  - "TypeScript"
  - "React"
  - "项目"
    ↓
提取关系：
  - "TypeScript" --[uses]--> "项目"
  - "React" --[uses]--> "TypeScript"
    ↓
下次召回时，查询"React 相关知识"
    ↓
找到相关实体并注入上下文
    ↓
Agent 理解到用户使用 TypeScript 开发 React 项目
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

## 十三、核心概念总结

### 13.1 双评分系统优势

1. **评分解耦**
   - importance 评估记忆价值
   - scopeScore 评估共享程度
   - 两者独立计算、独立升级

2. **渐进式扩展**
   - 记忆首先属于创建者
   - 通过使用逐渐扩展作用域
   - scopeScore 累积，不是一次性跳跃

3. **灵活召回**
   - 所有者有最高优先级
   - 跨Agent使用促进升级
   - 综合评分考虑多个因素

### 13.2 关键公式

**重要性评分：**
```
importance = 0.2 + 类型权重 + 置信度×0.15 + 显式×0.25 + 相关记忆×0.02 + 会话长度×0.05 + 轮次×0.05
```

**作用域评分：**
```
scopeScore = 0 + 召回次数×0.15 + 新Agent×0.2 + 有效使用×0.1
```

**召回优先级：**
```
priority = similarity × importance × scopeWeight + scopeScore × 0.2
```

### 13.3 升级路径

```
创建者召回 → scopeScore ↑ → session → agent → global
                              ↑          ↑
                          2次召回    2个Agent使用
```

---

**文档版本**: 2.9.0
**更新日期**: 2026-04-12
**状态**: 生产就绪

---

## 十四、Dreaming 机制（实验性）

### 14.1 概述

Dreaming 是一个实验性的后台记忆整合系统，模拟人类睡眠时的记忆巩固过程。它通过三个协作阶段来处理记忆，并与 OMMS 的双评分系统深度集成。

### 14.2 设计理念

**核心理念**：
- 将 Dreaming 与 OMMS 的双评分系统深度集成
- 使用现有的 importance 和 scopeScore 作为基础
- 添加多维度信号进行综合评估
- 利用现有的升级机制进行作用域提升

**与 OpenClaw Dreaming 的区别**：
| 特性 | OpenClaw Dreaming | OMMS Dreaming |
|------|------------------|--------------|
| **存储** | 文件系统 | LanceDB + 文件 |
| **评分** | 单一信号 | 双评分 + 多信号 |
| **向量搜索** | ❌ | ✅ |
| **实时性** | ❌ | ✅ |
| **Web UI** | ❌ | ✅ |
| **配置灵活** | ⚠️ 有限 | ✅ 高度可配置 |

### 14.3 触发机制

#### 自动触发

```typescript
interface DreamingTrigger {
  // 时间触发
  schedule: {
    enabled: boolean;
    time: string;        // "02:00" - 每天凌晨2点
    timezone: string;    // "Asia/Shanghai"
  };
  
  //数量触发
  memoryThreshold: {
    enabled: boolean;
    minMemories: number;  // 50条记忆时触发
    maxAgeHours: number; // 24小时内
  };
  
  // 会话触发
  sessionTrigger: {
    enabled: boolean;
    afterSessions: number; // 10个会话后触发
  };
}
```

#### 手动触发

```bash
# CLI 命令
omms dreaming start
omms dreaming status
omms dreaming stop

# Web UI 按钮
[开始 Dreaming] [查看状态] [停止]
```

### 14.4 三阶段处理流程

#### 阶段 1：Light 阶段（整理）

```typescript
async function lightPhase(): Promise<LightPhaseResult> {
  const logger = getLogger();
  
  logger.info("[DREAMING] ====== LIGHT PHASE START ======");
  
  // 1. 获取短期记忆
  const recentMemories = await memoryService.getAll({
    scope: ['session', 'agent'],
    limit: 100,
    sortBy: 'createdAt',
    order: 'desc'
  });
  
  logger.info("[DREAMING] Retrieved memories", {
    count: recentMemories.length
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
  
  // 3. 按综合评分排序
  const sortedMemories = scoredMemories.sort((a, b) => 
    b.combinedScore - a.combinedScore
  );
  
  logger.info("[DREAMING] Sorted memories", {
    top10: sortedMemories.slice(0, 10).map(m => ({
      id: m.memory.id,
      score: m.combinedScore.toFixed(3)
    }))
  });
  
  return {
    sortedMemories: sortedMemories,
    candidates: sortedMemories.slice(0, 50) // 取前50个候选
  };
}

// 计算时间新近度分数
function calculateRecencyScore(createdAt: string): number {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const hoursSinceCreation = (now - created) / (1000 * 60 * 60);
  
  // 24小时内创建的记忆得分更高
  if (hoursSinceCreation < 24) {
    return 1.0 - (hoursSinceCreation / 24) * 0.5;
  } else if (hoursSinceCreation < 168) { // 7天内
    {
      return 0.5 - ((hoursSinceCreation - 24) / 144) * 0.5;
    }
  }
  
  return 0;
}
```

#### 阶段 2：Deep 阶段（提升）

```typescript
async function deepPhase(candidates: Memory[]): Promise<DeepPhaseResult> {
  const logger = getLogger();
  
  logger.info("[DREAMING] ====== DEEP PHASE START ======");
  
  const promoted: Memory[] = [];
  const skipped: Memory[] = [];
  
  // 1. 使用多维度信号评估
  for (const candidate of candidates) {
    const signals = await evaluatePromotionSignals(candidate);
    
    logger.debug("[DREAMING] Evaluating candidate", {
      id: candidate.id,
      signals: {
        recallFrequency: signals.recallFrequency,
        relevance: signals.relevance,
        diversity: signals.diversity,
        recency: signals.recency,
        consolidation: signals.consolidation,
        conceptualRichness: signals.conceptualRichness
      }
    });
    
    // 2. 计算综合提升分数
    const promotionScore = calculatePromotionScore(signals);
    
    // 3. 决定是否提升
    if (promotionScore > 0.7) { // 阈值可配置
      // 使用现有的升级机制
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
        
        logger.info("[DREAMING] Memory promoted", {
          id: candidate.id,
          from: candidate.scope,
          to: targetScope,
          score: promotionScore.toFixed(3)
        });
      } else {
        skipped.push(candidate);
      }
    } else {
      skipped.push(candidate);
    }
  }
  
  logger.info("[DREAMING] Deep phase complete", {
    promoted: promoted.length,
    skipped: skipped.length
  });
  
  return { promoted, skipped };
}

// 多维度信号评估
async function evaluatePromotionSignals(memory: Memory): Promise<PromotionSignals> {
  // 1. 召回频率信号
  const recallFrequency = Math.min(
    memory.recallCount / 10, // 归一化到0-1
    1.0
  );
  
  // 2. 检索相关性信号
  const relevance = await checkSearchRelevance(memory);
  
  // 3. 查询多样性信号
  const diversity = await checkQueryDiversity(memory);
  
  // 4. 时间新近度信号
  const recency = calculateRecencyScore(memory.createdAt);
  
  // 5. 跨天整合信号
  const consolidation = await checkCrossDayConsolidation(memory);
  
  // 6. 概念丰富度信号
  const conceptualRichness = await checkConceptualRichness(memory);
  
  return {
    recallFrequency,
    relevance,
    diversity,
    recency,
    consolidation,
    conceptualRichness
  };
}

// 综合提升分数计算
function calculatePromotionScore(signals: PromotionSignals): number {
  const weights = {
    recallFrequency: 0.25,
    relevance: 0.20,
    diversity: 0.15,
    recency: 0.15,
    consolidation: 0.15,
    conceptualRichness: 0.10
  };
  
  return Object.entries(signals).reduce((sum, [key, value]) => 
    sum + (value * weights[key as keyof PromotionSignals]), 
    0
  );
}

// 检索相关性信号
async function checkSearchRelevance(memory: Memory): Promise<number> {
  // 检查该记忆在最近搜索中被召回的频率
  const recentSearches = await memoryService.getLogger().getLogs({
    method: 'recall',
    limit: 100
  });
  
  const memorySearches = recentSearches.filter(log => 
    log.data?.memoryId === memory.id
  );
  
  return Math.min(memorySearches.length / 10, 1.0);
}

// 查询多样性信号
async function checkQueryDiversity(memory: Memory): Promise<number> {
  // 检查该记忆关联的不同查询数量
  const relatedLogs = await memoryService.getLogger().getLogs({
    memoryId: memory.id,
    limit: 50
  });
  
  const uniqueQueries = new Set();
  for (const log of relatedLogs) {
    if (log.params?.query) {
      uniqueQueries.add(log.params.query);
    }
  }
  
  return Math.min(uniqueQueries.size / 10, 1.0);
}

// 跨天整合信号
async function checkCrossDayConsolidation(memory: Memory): Promise<number> {
  // 检查该记忆是否在不同日期被使用
  const relatedLogs = await memoryService.getLogger().getLogs({
    memoryId: memory.id,
    limit: 100
  });
  
  const uniqueDays = new Set();
  for (const log of relatedLogs) {
    if (log.timestamp) {
      const day = new Date(log.timestamp).toDateString();
      uniqueDays.add(day);
    }
  }
  
  return Math.min(uniqueDays.size / 7, 1.0);
}

// 概念丰富度信号
async function checkConceptualRichness(memory: Memory): Promise<number> {
  // 检查记忆的标签数量和类型多样性
  const tagScore = Math.min(memory.tags.length / 5, 1.0);
  const typeScore = memory.type === 'decision' ? 1.0 : 0.5;
  
  return (tagScore + typeScore) / 2;
}

// 决定目标作用域
function determineTargetScope(memory: Memory, score: number): string | null {
  const currentScopeIndex = SCOPE_ORDER.indexOf(memory.scope);
  
  if (score > 0.9 && currentScopeIndex < 2) {
    return SCOPE_ORDER[currentScopeIndex + 1]; // 提升一级
  } else if (score > 0.8 && memory.scope !== 'global') {
    return 'global'; // 直接提升到全局
  }
  
  return null;
}
```

#### 阶段 3：REM 阶段（反思）

```typescript
async function remPhase(memories: Memory[]): Promise<RemPhaseResult> {
  const logger = getLogger();
  
  logger.info("[DREAMING] ====== REM PHASE START ======");
  
  // 1. 提取主题和模式
  const themes = await extractThemes(memories);
  
  logger.info("[DREAMING] Extracted themes", {
    count: themes.length,
    themes: themes.slice(0, 5).map(t => t.name)
  });
  
  // 2. 生成反思报告
  const reflections = await generateReflections(memories, themes);
  
  // 3. 写入 DREAMS.md
  const dreamLog = await writeDreamLog({
    timestamp: new Date().toISOString(),
    phase: 'REM',
    themes,
    reflections,
    memoryCount: memories.length
  });
  
  logger.info("[DREAMING] REM phase complete", {
    themesExtracted: themes.length,
    reflectionsGenerated: reflections.length
  });
  
  return { themes, reflections, dreamLog };
}

// 主题提取
async function extractThemes(memories: Memory[]): Promise<Theme[]> {
  if (!config.enableLLMExtraction) {
    return [];
  }
  
  const llmService = getLLMService();
  const content = memories
    .map(m => `[${m.type}] ${m.content}`)
    .join('\n');
  
  const prompt = `
分析以下记忆内容，提取主要主题和模式：

${content}

请以JSON格式返回主题列表：
{
  "themes": [
    {
      "name": "主题名称",
      "description": "主题描述",
      "relatedMemories": ["memory_id1", "memory_id2"],
      "confidence": 0.9
    }
  ]
}
`;
  
  const response = await llmService.complete(prompt);
  const result = JSON.parse(response);
  
  return result.themes || [];
}

// 生成反思
async function generateReflections(memories: Memory[], themes:: Theme[]): Promise<string[]> {
  const llmService = getLLMService();
  
  const prompt = `
基于以下记忆和主题，生成反思和洞察：

记忆数量：${memories.length}
主题：${themes.map(t => t.name).join(', ')}

请生成3-5条有价值的反思，每条反思应该：
1. 识别模式或趋势
2. 提供洞察或建议
3. 关联相关记忆

以JSON格式返回：
{
  "reflections": [
    {
      "content": "反思内容",
      "relatedThemes": ["theme1", "theme2"],
      "confidence": 0.8
    }
  ]
}
`;
  
  const response = await llmService.complete(prompt);
  const result = JSON.parse(response);
  
  return result.reflections || [];
}

// 写入 Dream 日志
async function writeDreamLog(data: DreamLogData): Promise<void> {
  const logPath = `${process.env.HOME}/.openclaw/memory/DREAMS.md`;
  const logEntry = `
## ${new Date(data.timestamp).toLocaleString()}

### Phase: ${data.phase}

#### Themes (${data.themes.length})
${data.themes.map(t => `- **${t.name}**: ${t.description} (${t.confidence.toFixed(2)})`).join('\n')}

#### Reflections (${data.reflections.length})
${data.reflections.map(r => `- ${r.content} (${r.confidence.toFixed(2)})`).join('\n')}

#### Memory Count: ${data.memoryCount}

---
`;
  
  await fs.appendFile(logPath, logEntry);
}
```

### 14.5 完整的 Dreaming 流程

```typescript
class DreamingService {
  private config: DreamingConfig;
  private isRunning: boolean = false;
  private scheduler: NodeJS.Timeout | null = null;
  
  constructor(config: DreamingConfig) {
    this.config = config;
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Dreaming is already running');
    }
    
    this.isRunning = true;
    const logger = getLogger();
    
    try {
      logger.info("[DREAMING] ====== DREAMING START ======");
      
      // 阶段 1：Light
      const lightResult = await this.lightPhase();
      
      // 阶段 2：Deep
      const deepResult = await this.deepPhase(lightResult.candidates);
      
      // 阶段 3：REM
      const remResult = await this.remPhase(lightResult.sortedMemories);
      
      // 生成总结报告
      await this.generateSummary({
        light: lightResult,
        deep: deepResult,
        rem: remResult
      });
      
      logger.info("[DREAMING] ====== DREAMING COMPLETE ======");
      
    } catch (error) {
      logger.error("[DREAMING] Dreaming failed", error as Error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  stop(): void {
    if (this.scheduler) {
      clearTimeout(this.scheduler);
      this.scheduler = null;
    }
    this.isRunning = false;
  }
  
  schedule(): void {
    if (this.config.schedule.enabled) {
      const [hours, minutes] = this.config.schedule.time.split(':').map(Number);
      
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(hours, minutes);
      scheduled.setMinutes(minutes);
      
      if (scheduled <= now) {
        scheduled.setHours(scheduled.getHours() + 24); // 明天
      }
      
      const delay = scheduled.getTime() - now.getTime();
      
      this.scheduler = setTimeout(async () => {
        await this.start();
        this.schedule(); // 重新调度
      }, delay);
      
      getLogger().info("[DREAMING] Scheduled", {
        nextRun: scheduled.toLocaleString(),
        delay: `${Math.floor(delay / 1000 / 60)} minutes`
      });
    }
  }
  
  getStatus(): DreamingStatus {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRunTime,
      nextRun: this.nextRunTime,
      config: this.config
    };
  }
  
  private async generateSummary(results: DreamingResults): Promise<void> {
    const logger = getLogger();
    const summaryPath = `${process.env.HOME}/.openclaw/memory/dreaming-summary.md`;
    
    const summary = `
# Dreaming Summary
**Date**: ${new Date().toLocaleString()}
**Light Phase**: ${results.light.sortedMemories.length} memories processed
**Deep Phase**: ${results.deep.promoted.length} promoted, ${results.deep.skipped.length} skipped
**REM Phase**: ${results.rem.themes.length} themes, ${results.rem.reflections.length} reflections

## Promotion Details
${results.deep.promoted.map(m => `- ${m.id}: ${m.scope} → ${m.metadata?.promotedTo}`).join('\n')}

## Top Themes
${results.rem.themes.slice(0, 5).map(t => `- ${t.name}: ${t.description}`).join('\n')}
`;
    
    await fs.writeFile(summaryPath, summary);
    logger.info("[DREAMING] Summary written", { path: summaryPath });
  }
}
```

### 14.6 配置集成

```typescript
// 在 OMMS 配置中添加 Dreaming 配置
interface OMMSConfig {
  // ... 现有配置
  
  dreaming: {
    enabled: boolean;
    schedule: {
      enabled: boolean;
      time: string;
      timezone: string;
    };
    memoryThreshold: {
      enabled: boolean;
      minMemories: number;
      maxAgeHours: number;
    };
    sessionTrigger: {
      enabled: boolean;
      afterSessions: number;
    };
    promotion: {
      minScore: number;        // 0.7
      weights: {
        recallFrequency: number;  // 0.25
        relevance: number;        // 0.20
        diversity: number;         // 0.15
        recency: number;          // 0.15
        consolidation: number;     // 0.15
        conceptualRichness: number; // 0.10
      };
    };
    output: {
      path: string;              // ~/.openclaw/memory/DREAMS.md
      maxReflections: number;     // 5
      maxThemes: number;          // 10
    };
  };
}
```

### 14.7 Web UI 集成

```typescript
// 在 Web UI 中添加 Dreaming 页面
function DreamingPage() {
  const [status, setStatus] = useState<DreamingStatus | null>(null);
  const [logs, setLogs] = useState<DreamLog[]>([]);
  
  return (
    <div className="space-y-6">
      {/* 状态卡片 */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Dreaming 状态</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatusCard 
            label="运行状态" 
            value={status?.isRunning ? '运行中' : '已停止'}
            color={status?.isRunning ? 'green' : 'gray'}
          />
          <StatusCard 
            label="上次运行" 
            value={status?.lastRun || '从未运行'}
            color="blue"
          />
          <StatusCard 
            label="下次运行" 
            value={status?.nextRun || '未调度'}
            color="purple"
          />
        </div>
      </div>
      
      {/* 控制按钮 */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4">控制</h3>
        <div className="flex gap-4">
          <button
            onClick={() => startDreaming()}
            disabled={status?.isRunning}
            className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50"
          >
            开始 Dreaming
          </button>
          <button
            onClick={() => stopDreaming()}
            disabled={!status?.isRunning}
            className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50"
          >
            停止 Dreaming
          </button>
          <button
            onClick={() => viewLogs()}
            className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600"
          >
            查看日志
          </button>
        </div>
      </div>
      
      {/* Dreaming 日志 */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Dreaming 日志</h3>
        {logs.map(log => (
          <DreamLogEntry key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}
```

### 14.8 实现优势

1. **深度集成双系统**
   - 使用现有的 importance 和 scopeScore
   - 利用现有的升级机制
   - 无需重复实现

2. **多维度评估**
   - 召回频率
   - 检索相关性
   - 查询多样性
   - 时间新近度
   - 跨天整合
   - 概念丰富度

3. **灵活触发**
   - 定时调度
   - 数量阈值
   - 会话触发
   - 手动控制

4. **可视化管理**
   - Web UI 状态监控
   - 实时日志查看
   - 配置界面

5. **人类可读输出**
   - DREAMS.md 日志
   - 主题和反思
   - 便于审查和编辑

### 14.9 与 OpenClaw Dreaming 的对比

| 特性 | OpenClaw Dreaming | OMMS Dreaming |
|------|------------------|--------------|
| **存储** | 文件系统 | LanceDB + 文件 |
| **评分** | 单一信号 | 双评分 + 多信号 |
| **向量搜索** | ❌ | ✅ |
| **实时性** | ❌ | ✅ |
| **Web UI** | ❌ | ✅ |
| **配置灵活** | ⚠️ 有限 | ✅ 高度可配置 |

### 14.10 建议的实现步骤

1. **创建 Dreaming 服务**
   - `src/services/dreaming.ts`
   - 实现三阶段处理
   - 集成双评分系统

2. **添加 CLI 命令**
   - `src/cli/dreaming.ts`
   - start/status/stop 命令

3. **扩展配置系统**
   - 在 `OMMSConfig` 中添加 dreaming 配置
   - 更新配置验证

4. **Web UI 集成**
   - 添加 Dreaming 页面
   - 添加状态监控
   - 添加日志查看

5. **测试和优化**
   - 单元测试各阶段
   - 集成测试
   - 性能优化

---

## 十五、日志管理系统

### 15.1 概述

日志管理系统提供结构化的日志记录、查询和分析功能，支持多级别日志、自动轮转、性能监控和日志导出。

### 15.2 设计理念

**核心理念**：
- 结构化日志记录，便于查询和分析
- 多级别日志支持（debug/info/warn/error）
- 自动日志轮转，防止日志文件过大
- 性能监控，追踪关键指标操作时间
- 日志导出，便于问题诊断和审计

### 15.3 日志级别

| 级别 | 用途 | 输出目标 |
|------|------|---------|
| `debug` | 详细调试信息 | 开发环境 |
| `info` | 一般信息 | 生产环境 |
| `warn` | 警告信息 | 生产环境 |
| `error` | 错误信息 | 所有环境 |

### 15.4 日志结构

```typescript
interface LogEntry {
  id: string;                    // 唯一标识
  timestamp: string;              // 时间戳
  level: LogLevel;               // 日志级别
  message: string;                // 日志消息
  method?: string;               // 方法名
  params?: Record<string, unknown>; // 方法参数
  returns?: unknown;              // 方法返回值
  agentId?: string;              // Agent ID
  sessionId?: string;            // 会话 ID
  memoryId?: string;             // 记忆 ID
  error?: string;                // 错误信息
  data?: Record<string, unknown>; // 附加数据
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

### 15.5 日志服务

```typescript
class LoggerService {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private logLevel: LogLevel = 'info';
  private logFile?: string;
  
  constructor(config?: LoggerConfig) {
    this.logLevel = config?.level || 'info';
    this.maxLogs = config?.maxLogs || 1000;
    this.logFile = config?.file;
  }
  
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
  
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }
  
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }
  
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }
  
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }
    
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    };
    
    this.logs.push(entry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    this.writeToFile(entry);
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }
  
  getLogs(filter?: LogFilter): LogEntry[] {
    let filtered = this.logs;
    
    if (filter?.level) {
      filtered = filtered.filter(l => l.level === filter.level);
    }
    
    if (filter?.method) {
      filtered = filtered.filter(l => l.method === filter.method);
    }
    
    if (filter?.agentId) {
      filtered = filtered.filter(l => l.agentId === filter.agentId);
    }
    
    if (filter?.sessionId) {
      filtered = filtered.filter(l => l.sessionId === filter.sessionId);
    }
    
    if (filter?.memoryId) {
      filtered = filtered.filter(l => l.memoryId === filter.memoryId);
    }
    
    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(l => 
        l.message.toLowerCase().includes(searchLower) ||
        (l.method && l.method.toLowerCase().includes(searchLower))
      );
    }
    
    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }
  
  getStats(): LogStats {
    const total = this.logs.length;
    const byLevel = {
      debug: this.logs.filter(l => l.level === 'debug').length,
      info: this.logs.filter(l => l.level === 'info').length,
      warn: this.logs.filter(l => l.level === 'warn').length,
      error: this.logs.filter(l => l.level === 'error').length
    };
    
    const byMethod = new Map<string, number>();
    for (const log of this.logs) {
      if (log.method) {
        byMethod.set(log.method, (byMethod.get(log.method) || 0) + 1);
      }
    }
    
    return {
      total,
      byLevel,
      byMethod: Object.fromEntries(byMethod),
      oldestLog: this.logs[0]?.timestamp,
      newestLog: this.logs[this.logs.length - 1]?.timestamp
    };
  }
  
  clear(): void {
    this.logs = [];
  }
  
  export(format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2);
    } else if (format === 'csv') {
      const headers = ['id', 'timestamp', 'level', 'message', 'method', 'agentId', 'sessionId', 'memoryId'];
      const rows = this.logs.map(log => 
        headers.map(h => JSON.stringify(log[h as keyof LogEntry] || '')).join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }
    return '';
  }
  
  private writeToFile(entry: LogEntry): void {
    if (!this.logFile) {
      return;
    }
    
    const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
    
    if (entry.method) {
      logLine += ` [${entry.method}]`;
    }
    
    if (entry.agentId) {
      logLine += ` [agent:${entry.agentId}]`;
    }
    
    if (entry.sessionId) {
      logLine += ` [session:${entry.sessionId}]`;
    }
    
    if (entry.memoryId) {
      logLine += ` [memory:${entry.memoryId}]`;
    }
    
    fs.appendFileSync(this.logFile, logLine + '\n');
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 15.6 性能监控

```typescript
class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  
  start(operation: string): void {
    this.metrics.set(operation, {
      name: operation,
      startTime: Date.now(),
      endTime: null,
      duration: null
    });
  }
  
  end(operation: string): void {
    const metric = this.metrics.get(operation);
    if (!metric) {
      return;
    }
    
    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    
    const logger = getLogger();
    logger.debug(`[PERF] ${operation} completed`, {
      method: operation,
      data: {
        duration: metric.duration,
        startTime: metric.startTime,
        endTime: metric.endTime
      }
    });
  }
  
  getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }
  
  clear(): void {
    this.metrics.clear();
  }
}

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
}
```

### 15.7 日志轮转

```typescript
class LogRotator {
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private checkInterval: number = 60 * 1000; // 1分钟
  private timer: NodeJS.Timeout | null = null;
  
  constructor(private logFile: string) {
    this.start();
  }
  
  start(): void {
    this.timer = setInterval(() => {
      this.checkAndRotate();
    }, this.checkInterval);
  }
  
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  private checkAndRotate(): void {
    try {
      const stats = fs.statSync(this.logFile);
      
      if (stats.size > this.maxFileSize) {
        this.rotate();
      }
    } catch (error) {
      // 文件不存在，忽略错误
    }
  }
  
  private rotate(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${this.logFile}.${timestamp}`;
    
    fs.renameSync(this.logFile, backupFile);
    
    const logger = getLogger();
    logger.info(`Log rotated`, {
      method: 'rotate',
      data: {
        original: this.logFile,
        backup: backupFile
      }
    });
  }
}
```

### 15.8 日志查询 API

```typescript
interface LogFilter {
  level?: LogLevel;
  method?: string;
  agentId?: string;
  sessionId?: string;
  memoryId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface LogStats {
  total: number;
  byLevel: {
    debug: number;
    info: number;
    warn: number;
    error: number;
  };
  byMethod: Record<string, number>;
  oldestLog?: string;
  newestLog?: string;
}
```

### 15.9 Web UI 集成

```typescript
// 日志页面组件
function LogsPage() {
  const [filter, setFilter] = useState<LogFilter>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  
  return (
    <div className="space-y-6">
      {/* 日志统计 */}
      <LogStatsCard stats={stats} />
      
      {/* 过滤器 */}
      <LogFilterBar filter={filter} onChange={setFilter} />
      
      {/* 日志列表 */}
      <LogList 
        logs={logs} 
        expandedLogs={expandedLogs}
        onToggle={id => {
          const newExpanded = new Set(expandedLogs);
          if (newExpanded.has(id)) {
            newExpanded.delete(id);
          } else {
            newExpanded.add(id);
          }
          setExpandedLogs(newExpanded);
        }}
      />
 />
      
      {/* 导出按钮 */}
      <LogExportButton logs={logs} />
    </div>
  );
}
```

### 15.10 配置选项

```typescript
interface LoggerConfig {
  level: LogLevel;              // 默认日志级别
  maxLogs: number;              // 内存中最大日志数
  file?: string;                // 日志文件路径
  enableConsole: boolean;         // 是否输出到控制台
  enableFile: boolean;            // 是否写入文件
  enableRotation: boolean;         // 是否启用日志轮转
  rotationSize: number;           // 轮转文件大小限制（字节）
  rotationInterval: number;        // 轮转检查间隔（毫秒）
}
```

### 15.11 使用示例

```typescript
// 基础日志记录
const logger = getLogger();

logger.info('Memory stored', {
  method: 'store',
  params: { content: 'User prefers dark mode' },
  returns: { id: 'mem-123', importance: 0.8 }
});

logger.warn('Memory not found', {
  method: 'recall',
  params: { query: 'old settings' },
  error: 'No matching memories found'
});

logger.error('Vector search failed', {
  method: 'vectorSearch',
  error: 'Embedding service unavailable'
});

// 性能监控
const perf = getPerformanceMonitor();

perf.start('memory_recall');
const results = await memoryService.recall(query);
perf.end('memory_recall');

// 日志查询
const recentLogs = logger.getLogs({
  level: 'error',
  limit: 50
});

const stats = logger.getStats();
console.log(`Total logs: ${stats.total}`);
console.log(`Errors: ${stats.byLevel.error}`);

// 日志导出
const jsonLogs = logger.export('json');
fs.writeFileSync('logs.json', jsonLogs);
```

### 15.12 实现优势

1. **结构化日志**
   - 统一的日志格式
   - 便于查询和分析
   - 支持多维度过滤

2. **性能监控**
   - 自动追踪操作时间
   - 识别性能瓶颈
   - 优化关键路径

3. **日志轮转**
   - 自动管理日志文件大小
   - 防止磁盘空间耗尽
   - 保留历史日志

4. **灵活查询**
   - 多条件过滤
   - 分页支持
   - 实时搜索

5. **Web UI 集成**
   - 可视化日志查看
   - 实时统计
   - 日志导出功能

### 15.13 与现有系统的集成

```typescript
// 在 MemoryService 中集成日志
class MemoryService {
  private logger: LoggerService;
  
  async store(params): Promise<Memory> {
    const perf = getPerformanceMonitor();
    perf.start('memory_store');
    
    try {
      const memory = await this.createMemory(params);
      
      this.logger.info('Memory stored', {
        method: 'store',
        params: { content: params.content },
        returns: { id: memory.id }
      });
      
      return memory;
    } catch (error) {
      this.logger.error('Memory storage failed', {
        method: 'store',
        params: { content: params.content },
        error: String(error)
      });
      throw error;
    } finally {
      perf.end('memory_store');
    }
  }
  
  async recall(query, options): Promise<RecallResult> {
    const perf = getPerformanceMonitor();
    perf.start('memory_recall');
    
    try {
      const results = await this.performRecall(query, options);
      
      this.logger.info('Memory recalled', {
        method: 'recall',
        params: { query, limit: options?.limit },
        returns: { count: results.memories.length }
      });
      
      return results;
    } catch (error) {
      this.logger.error('Memory recall failed', {
        method: 'recall',
        params: { query },
        error: String(error)
      });
      throw error;
    } finally {
      perf.end('memory_recall');
    }
  }
}
```

### 15.14 日志文件管理

```
~/.openclaw/omms-logs/
├── omms.log                    # 当前日志文件
├── omms.log.2026-04-09-120000  # 轮转的日志文件
├── omms.log.2026-04-08-060000  # 轮转的日志文件
└── omms.log.2026-04-07-180000  # 轮转的日志文件
```

**轮转策略**：
- 当日志文件超过 10MB 时自动轮转
- 保留最近 7 天的日志文件
- 自动清理超过 30 天的旧日志文件

### 15.15 最佳实践

1. **日志级别选择**
   - 开发环境：使用 `debug` 级别
   - 生产环境：使用 `info` 级别
   - 关键操作：始终记录

2. **上下文信息**
   - 包含方法名、参数、返回值
   - 关联 Agent ID、会话 ID、记忆 ID
   - 便于追踪问题根源

3. **性能监控**
   - 对关键操作使用性能监控
   - 记录操作开始和结束时间
   - 识别慢操作

4. **日志查询**
   - 使用过滤器查询特定日志
   - 限制返回数量避免性能问题
   - 使用分页处理大量日志

5. **日志导出**
   - 定期导出日志用于分析
   - 使用 JSON 格式便于处理
   - 保留日志用于审计
