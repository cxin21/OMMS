# OMMS 插件设计文档

**版本**: 2.5.0
**日期**: 2026-04-11
**状态**: 生产就绪

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
  }
}
```

---

## 十一、知识图谱引擎

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

**文档版本**: 2.2.0
**更新日期**: 2026-04-09
**状态**: 生产就绪
