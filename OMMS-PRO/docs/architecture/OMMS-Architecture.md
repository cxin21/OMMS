# OMMS-PRO 架构文档

**版本**: v2.1.0
**更新日期**: 2026-04-13

---

## 目录

1. [系统概述](#1-系统概述)
2. [存储架构](#2-存储架构)
3. [Palace 存储结构](#3-palace-存储结构)
4. [数据类型定义](#4-数据类型定义)
5. [记忆捕获 (Memory Capture)](#5-记忆捕获-memory-capture)
6. [记忆召回 (Memory Recall)](#6-记忆召回-memory-recall)
7. [作用域升级/降级](#7-作用域升级降级)
8. [遗忘机制 (Forgetting)](#8-遗忘机制-forgetting)
9. [图谱管理 (Graph)](#9-图谱管理-graph)
10. [模块依赖关系](#10-模块依赖关系)

---

## 1. 系统概述

### 1.1 OMMS-PRO 定位

OMMS-PRO (Omniscient Memory Management System - Professional) 是一个融合记忆宫殿架构的 AI 记忆管理系统，旨在为 AI Agent 提供持久化、层级化、可检索的记忆能力。

### 1.2 核心设计原则

1. **五层存储**: Cache → Vector → SQLite → Palace → Graph
2. **UID 不变性**: 记忆的 UID 终身不变，版本链追踪变更历史
3. **Palace 层级化**: 记忆按 wing/hall/room/closet 层级组织
4. **双重评分**: Importance Score + Scope Score
5. **遗忘算法**: 基于双评分的动态遗忘机制

### 1.3 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          OMMS                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌──────────────────────────────────┐  │
│  │   ConfigManager  │     │        MemoryService             │  │
│  │   (配置管理)      │     │  ┌────────────────────────────┐ │  │
│  └─────────────────┘     │  │ StorageMemoryService       │ │  │
│                           │  │                            │ │  │
│  ┌─────────────────┐     │  │ ┌──────────────────────┐  │ │  │
│  │ ProfileManager   │     │  │ │  MemoryStoreManager  │  │ │  │
│  │   (用户画像)      │     │  │ └──────────────────────┘  │ │  │
│  └─────────────────┘     │  │ ┌──────────────────────┐  │ │  │
│                           │  │ │ MemoryRecallManager  │  │ │  │
│  ┌─────────────────┐     │  │ └──────────────────────┘  │ │  │
│  │ DreamingEngine   │     │  │ ┌──────────────────────┐  │ │  │
│  │   (记忆整理)      │     │  │ │ MemoryDegradation   │  │ │  │
│  │   ⚠️ 待重构       │     │  │ │     Manager          │  │ │  │
│  └─────────────────┘     │  │ └──────────────────────┘  │ │  │
│                           │  └────────────────────────────┘ │  │
│                           └──────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    五层存储 (Storage)                       │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌─────┐ │  │
│  │  │ Cache  │→ │Vector  │→ │SQLite  │→ │Palace │→ │Graph│ │  │
│  │  │ Manager│  │ Store  │  │MetaStore│ │ Store │  │Store│ │  │
│  │  │(热数据)│  │(相似度)│  │(元数据)│  │(内容) │  │(图谱)│ │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └─────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 存储架构

### 2.1 五层存储模型

| 层级 | 存储类型 | 用途 | 数据特征 |
|------|----------|------|----------|
| L1 | CacheManager | 热数据缓存 | 热点记忆，LRU 淘汰 |
| L2 | VectorStore | 向量相似度搜索 | embedding + metadata |
| L3 | SQLiteMetaStore | 元数据管理 | 结构化索引 |
| L4 | PalaceStore | 完整内容存储 | 原始记忆内容 |
| L5 | GraphStore | 知识图谱 | 实体-关系网络 |

### 2.2 存储关系图

```
┌──────────────────────────────────────────────────────────────────┐
│                         Memory (完整对象)                         │
│  uid, type, scope, importance, palace: {wingId, hallId...}     │
└──────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   VectorStore     │  │ SQLiteMetaStore  │  │  PalaceStore     │
│                   │  │                  │  │                  │
│ palaceRef ────────┼──│ currentPalaceRef │──│ palaceRef        │
│                   │  │ palace.wingId    │  │ (层级路径)        │
│ metadata:         │  │ palace.hallId    │  │                  │
│   type ───────────┼──│ type             │  │                  │
│   scope ──────────┼──│ scope            │  │                  │
│   importance ─────┼──│ importanceScore  │  │                  │
│   scopeScore ─────┼──│ scopeScore       │  │                  │
│   agentId ────────┼──│ agentId          │  │                  │
│   sessionId ──────┼──│ sessionId        │  │                  │
│   tags ───────────┼──│ tags             │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
           │
           ▼
┌──────────────────┐
│   GraphStore      │
│                   │
│ // 跨 Palace     │
│ // 的关系网络     │
└──────────────────┘
```

### 2.3 各存储层职责

#### CacheManager
- 热点记忆缓存
- LRU/LFU 淘汰策略
- TTL 过期机制

#### VectorStore
- 向量存储 (LanceDB)
- 相似度搜索
- fallback 内存模式

#### SQLiteMetaStore
- 记忆元数据持久化
- 版本链管理
- 查询索引

#### PalaceStore
- 完整记忆内容存储
- 层级化文件组织
- 版本隔离

#### GraphStore
- 实体-关系存储
- 关系强度管理
- 跨记忆关联

---

## 3. Palace 存储结构

### 3.1 层级定义

```
Palace (宫殿)
├── Wings (翼)
│   ├── SESSION Wing    → scope = SESSION
│   ├── AGENT Wings     → scope = AGENT (每个 Agent 一个)
│   └── GLOBAL Wing     → scope = GLOBAL
│
├── Hall (大厅) - 每个 Wing 下固定 6 个
│   ├── FACTS Hall      → MemoryType.FACT
│   ├── EVENTS Hall     → MemoryType.EVENT
│   ├── DECISIONS Hall  → MemoryType.DECISION
│   ├── ERRORS Hall     → MemoryType.ERROR
│   ├── LEARNINGS Hall  → MemoryType.LEARNING
│   └── RELATIONS Hall  → MemoryType.RELATION
│
├── Room (房间) - 每个 Hall 下按主题分组
│   └── Topic-based grouping
│
└── Closet (柜子) - 记忆的最终位置
    └── closet_{uid}_v{version}.json
```

### 3.2 路径格式

```
data/palace/
├── wing_session_{sessionId}/
│   ├── hall_facts/
│   │   └── room_default/
│   │       └── closet_{uid}_v1.json
│   ├── hall_events/
│   │   └── room_default/
│   └── ...
│
├── wing_agent_{agentId}/
│   ├── hall_facts/
│   ├── hall_events/
│   └── ...
│
└── wing_global/
    ├── hall_facts/
    └── ...
```

### 3.3 palaceRef 格式

```
{palaceRoot}/{wingId}/{hallId}/{roomId}/closet_{uid}_v{version}

示例:
data/palace/wing_agent_abc/hall_events/room_meeting/closet_mem123_v1
```

---

## 4. 数据类型定义

### 4.1 核心枚举

```typescript
// 记忆类型
enum MemoryType {
  FACT = 'fact',           // 客观事实
  EVENT = 'event',         // 事件记录
  DECISION = 'decision',   // 决策记录
  ERROR = 'error',         // 错误记录
  LEARNING = 'learning',   // 学习心得
  RELATION = 'relation',   // 关系信息
}

// 记忆作用域
enum MemoryScope {
  SESSION = 'session',  // 当前会话有效
  AGENT = 'agent',      // Agent 级别有效
  GLOBAL = 'global',    // 全局有效
}

// 记忆区块
enum MemoryBlock {
  WORKING = 'working',    // 工作区
  SESSION = 'session',   // 会话区
  CORE = 'core',          // 核心区
  ARCHIVED = 'archived',   // 归档区
  DELETED = 'deleted',    // 删除区
}

// Wing 类型 (对应 MemoryScope)
enum WingType {
  SESSION = 'session',
  AGENT = 'agent',
  GLOBAL = 'global',
}

// Hall 类型 (对应 MemoryType)
enum HallType {
  FACTS = 'facts',
  EVENTS = 'events',
  DECISIONS = 'decisions',
  ERRORS = 'errors',
  LEARNINGS = 'learnings',
  RELATIONS = 'relations',
}
```

### 4.2 Palace 位置

```typescript
// Palace 位置
interface PalaceLocation {
  wingId: string;    // "session_xxx", "agent_xxx", "global"
  hallId: string;    // "facts", "events", ...
  roomId: string;    // "room_xxx" 或 "room_default"
  closetId: string;  // "closet_xxx"
}

// 版本信息
interface VersionInfo {
  version: number;        // 版本号
  palaceRef: string;       // palace_{uid}_v{version}
  createdAt: number;       // 创建时间
  summary: string;        // 版本摘要
  contentLength: number;   // 内容长度
}
```

### 4.3 SQLiteMetaStore 记录

```typescript
interface MemoryMetaRecord {
  // 唯一标识
  uid: string;
  version: number;

  // 类型与来源
  agentId: string;
  sessionId?: string;
  type: MemoryType;

  // 评分
  importanceScore: number;  // 0-10
  scopeScore: number;       // 0-10
  scope: MemoryScope;

  // Palace 位置 (新增)
  palace: PalaceLocation;

  // 版本管理
  versionChain: VersionInfo[];
  isLatestVersion: boolean;
  versionGroupId: string;

  // 其他
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastRecalledAt?: number;

  // 指向当前版本内容
  currentPalaceRef: string;
}
```

### 4.4 VectorStore 元数据

```typescript
interface VectorMetadata {
  uid: string;
  type: MemoryType;
  scope: MemoryScope;
  importanceScore: number;
  scopeScore: number;
  agentId: string;
  sessionId?: string;
  tags: string[];
  createdAt: number;
  palaceRef: string;
  version: number;
  isLatestVersion: boolean;
  versionGroupId: string;
}
```

### 4.5 PalaceStore 记录

```typescript
interface PalaceRecord {
  palaceRef: string;      // palace_{uid}_v{version}
  content: string;        // 完整原始内容
  metadata: PalaceMetadata;
}

interface PalaceMetadata {
  uid: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  originalSize: number;
  compressed: boolean;
  encrypted: boolean;
}
```

### 4.6 Hall-MemoryType 映射

```typescript
const HALL_TO_MEMORY_TYPE_MAP: Record<HallType, MemoryType> = {
  [HallType.FACTS]: MemoryType.FACT,
  [HallType.EVENTS]: MemoryType.EVENT,
  [HallType.DECISIONS]: MemoryType.DECISION,
  [HallType.ERRORS]: MemoryType.ERROR,
  [HallType.LEARNINGS]: MemoryType.LEARNING,
  [HallType.RELATIONS]: MemoryType.RELATION,
};

const MEMORY_TO_HALL_TYPE_MAP: Record<MemoryType, HallType> = {
  [MemoryType.FACT]: HallType.FACTS,
  [MemoryType.EVENT]: HallType.EVENTS,
  [MemoryType.DECISION]: HallType.DECISIONS,
  [MemoryType.ERROR]: HallType.ERRORS,
  [MemoryType.LEARNING]: HallType.LEARNINGS,
  [MemoryType.RELATION]: HallType.RELATIONS,
};
```

---

## 5. 记忆捕获 (Memory Capture)

### 5.1 流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Memory Capture                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. 输入验证                                                       │
│    - content: string (必填)                                     │
│    - type: MemoryType (必填)                                    │
│    - agentId: string (必填)                                    │
│    - sessionId?: string                                         │
│    - metadata?: {...}                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. 生成 UID                                                      │
│    - IDGenerator.generate('mem') → "mem_xxx"                   │
│    - UID 终身不变                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. 计算 Palace 位置                                               │
│    - calculatePalaceLocation(type, scope, agentId, sessionId)   │
│    - wingId: scope → "session_xxx" | "agent_xxx" | "global"   │
│    - hallId: type → "facts" | "events" | ...                   │
│    - roomId: tags[0] || "room_default"                          │
│    - closetId: generate()                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. 生成 palaceRef                                                │
│    - palaceRef = {wingId}/{hallId}/{roomId}/closet_{uid}_v{ver}│
│    - 示例: "wing_agent_abc/hall_events/room_meeting/closet_..."│
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   VectorStore     │ │ SQLiteMetaStore   │ │  PalaceStore     │
│                   │ │                   │ │                   │
│ store({           │ │ insert({          │ │ store(palaceRef, │
│   id: uid,        │ │   uid,            │ │   content,       │
│   vector,         │ │   type,           │ │   metadata)      │
│   text: summary,  │ │   scope,         │ │                   │
│   metadata: {...} │ │   palace: {...},  │ │                   │
│ })                │ │   currentPalaceRef│ │                   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. 返回 Memory 对象                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 palaceRef 生成算法

```typescript
function calculatePalaceLocation(params: {
  type: MemoryType;
  scope: MemoryScope;
  agentId: string;
  sessionId?: string;
  tags?: string[];
}): PalaceLocation {
  // Wing: 基于 scope
  const wingId = params.scope === MemoryScope.SESSION
    ? `session_${params.sessionId || 'default'}`
    : params.scope === MemoryScope.GLOBAL
      ? 'global'
      : `agent_${params.agentId}`;

  // Hall: 必须和 MemoryType 对应
  const hallId = params.type.toLowerCase();

  // Room: 基于标签或默认
  const roomId = params.tags?.length
    ? `room_${params.tags[0].replace(/[^a-zA-Z0-9]/g, '_')}`
    : 'room_default';

  // Closet: 基于 UID
  const closetId = `closet_${params.uid || generateUID()}`;

  return { wingId, hallId, roomId, closetId };
}
```

### 5.3 版本管理

```typescript
interface Memory {
  uid: string;           // 终身不变
  version: number;       // 当前版本号
  
  // Palace 位置
  palace: PalaceLocation;
  
  // 版本链
  versionChain: VersionInfo[];  // 完整版本历史
  isLatestVersion: boolean;
  versionGroupId: string;       // 首次创建的 UID
}
```

---

## 6. 记忆召回 (Memory Recall)

### 6.1 流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Memory Recall                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. 构建查询选项                                                   │
│    - query: string                                             │
│    - type/scope/agentId 过滤                                   │
│    - limit/minScore 限制                                        │
│    - enableVectorSearch/enableKeywordSearch                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. 向量搜索 (VectorStore)                                        │
│    - search({ query, limit, filters })                          │
│    - 返回: VectorSearchResult[]                                 │
│      - id: uid                                                 │
│      - score: 相似度                                            │
│      - metadata: VectorMetadata                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. 关键词搜索 (可选)                                              │
│    - keyword matching in SQLiteMetaStore                        │
│    - 与向量结果合并                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. 获取元数据 (SQLiteMetaStore)                                  │
│    - getByIds(uids) → MemoryMetaRecord[]                       │
│    - 包含 palace 位置信息                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. 获取内容 (PalaceStore)                                        │
│    - retrieveMany(palaceRefs) → Map<palaceRef, content>        │
│    - palaceRef 格式: {wingId}/{hallId}/{roomId}/closet_...    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. 图谱扩展 (可选)                                               │
│    - findRelated(uid) → RelatedMemoryResult[]                   │
│    - 获取关联记忆                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. 组装结果                                                      │
│    - RecallResult: { memories, total, scores, ... }             │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 召回选项

```typescript
interface RecallOptions {
  query?: string;
  agentId?: string;
  wingId?: string;
  hallId?: string;
  roomId?: string;
  type?: MemoryType;
  types?: MemoryType[];
  scope?: MemoryScope;
  limit?: number;
  minImportance?: number;
  minScore?: number;
  timeRange?: { from: number; to: number };
  enableVectorSearch?: boolean;
  enableKeywordSearch?: boolean;
  includeRelated?: boolean;
}
```

---

## 7. 作用域升级/降级

### 7.1 升级规则

| 当前作用域 | 目标作用域 | 升级条件 |
|-----------|-----------|----------|
| SESSION | AGENT | recallCount >= 3 **且** importanceScore >= 5 |
| AGENT | GLOBAL | recallCount >= 5 **且** scopeScore >= 6 **且** usedByAgents.length >= 2 |

### 7.2 升级流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Scope Upgrade                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. 检查升级条件                                                   │
│    - shouldUpgrade(memory) → boolean                            │
│    - 根据当前 scope 判断                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. 计算新的 Palace 位置                                           │
│    - calculatePalaceLocation({                                  │
│        type: memory.type,                                        │
│        scope: newScope,                                         │
│        agentId: memory.agentId,                                 │
│        sessionId: memory.sessionId                               │
│      })                                                         │
│    - 生成新的 palaceRef                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. 迁移 PalaceStore 文件                                          │
│    - content = await palaceStore.retrieve(oldPalaceRef)         │
│    - await palaceStore.store(newPalaceRef, content, ...)        │
│    - await palaceStore.delete(oldPalaceRef)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ SQLiteMetaStore   │ │  VectorStore     │ │   GraphStore     │
│                   │ │                  │ │                  │
│ update({          │ │ updateMetadata({ │ │ (关系保持不变)    │
│   scope: newScope,│ │   scope: newScope│ │                  │
│   palace: newLoc, │ │ })               │ │                  │
│   currentPalaceRef│ │                  │ │                  │
│ })                │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 7.3 降级规则

| 当前作用域 | 目标作用域 | 降级条件 |
|-----------|-----------|----------|
| GLOBAL | AGENT | scopeScore < 4 |
| AGENT | SESSION | scopeScore < 3 |

### 7.4 降级流程

降级流程与升级类似，但：
- 方向相反
- 条件为遗忘/降级触发
- 可能涉及内容迁移

---

## 8. 遗忘机制 (Forgetting)

### 8.1 遗忘算法

```typescript
// 遗忘分数计算
const forgetScore = effectiveImportance * 0.7 + effectiveScope * 0.3;

// 衰减公式
const effectiveImportance = Math.max(importanceScore - daysSinceRecalled * decayRate, 0);
const effectiveScope = Math.max(scopeScore - daysSinceRecalled * decayRate, 0);

// 遗忘阈值
const ARCHIVE_THRESHOLD = 3;  // forgetScore < 3 → 归档
const DELETE_THRESHOLD = 1;  // forgetScore < 1 → 删除
```

### 8.2 遗忘流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Forgetting Cycle                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. 扫描记忆                                                       │
│    - query({ isLatestVersion: true })                           │
│    - 按 updatedAt 排序                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. 对每条记忆计算遗忘分数                                          │
│    - daysSinceRecalled = now - lastRecalledAt                   │
│    - effectiveImportance = max(importance - days * decayRate, 0)│
│    - effectiveScope = max(scopeScore - days * decayRate, 0)     │
│    - forgetScore = effectiveImportance * 0.7 + effectiveScope*0.3│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. 判断操作                                                       │
│    - forgetScore < 1 → 永久删除                                  │
│    - forgetScore < 3 → 归档 (block = ARCHIVED)                 │
│    - 否则 → 保持不变                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│      归档 (ARCHIVED)      │     │       删除 (DELETED)     │
│                          │     │                          │
│ 1. 更新 block 字段        │     │ 1. 更新 block = DELETED  │
│ 2. 保持 PalaceStore 文件 │     │ 2. 删除 PalaceStore 文件  │
│ 3. 保持 GraphStore 关系   │     │ 3. 删除 GraphStore 关系   │
│ 4. 更新 VectorStore      │     │ 4. 删除 VectorStore      │
│                          │     │ 5. 删除 SQLiteMetaStore  │
└─────────────────────────┘     └─────────────────────────┘
```

### 8.3 强化机制

```typescript
// 强化幅度 (根据当前 importance)
function calculateBoost(currentImportance: number): number {
  if (currentImportance < 3) return 0.5;
  if (currentImportance < 6) return 0.3;
  if (currentImportance < 7) return 0.1;
  return 0.2;  // >= 7
}
```

---

## 9. 图谱管理 (Graph)

### 9.1 图谱结构

```typescript
interface GraphNodeRecord {
  id: string;           // UID
  entity: string;       // 实体名称
  type: 'agent' | 'concept' | 'event' | 'entity';
  uid: string;          // 关联的记忆 UID
  memoryIds: string[];  // 关联的记忆 UID 列表
  properties: Record<string, unknown>;
}

interface GraphEdgeRecord {
  id: string;
  sourceId: string;     // UID
  targetId: string;     // UID
  relation: string;     // 关系类型
  weight: number;      // 0-1
  temporal?: {
    start: number;
    end: number;
  };
}
```

### 9.2 关系类型

```typescript
type RelationshipType =
  | 'knows'
  | 'part_of'
  | 'related_to'
  | 'causes'
  | 'belongs_to'
  | 'depends_on'
  | 'similar_to'
  | 'temporal_before'
  | 'temporal_after'
  | 'same_session'
  | 'same_agent';
```

### 9.3 图谱操作

- `addMemory(uid, entities, edges)` - 添加记忆关联
- `findRelated(uid, limit)` - 查找关联记忆
- `queryByEntity(entity)` - 按实体查询
- `addRelation(sourceId, targetId, relation, weight)` - 添加关系
- `removeRelation(sourceId, targetId, relation)` - 移除关系

---

## 10. 模块依赖关系

### 10.1 依赖图

```
┌─────────────────────────────────────────────────────────────────┐
│                           index.ts                               │
│                    (导出所有公共 API)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Config     │     │   Storage    │     │   Memory     │
│   Manager    │     │              │     │   Service    │
└──────────────┘     └──────────────┘     └──────────────┘
                              │                     │
        ┌─────────────────────┼─────────────────────┤
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  CacheManager │     │ VectorStore  │     │   Storage    │
└──────────────┘     └──────────────┘     │   Memory     │
                              │            │   Service    │
┌──────────────┐              │            └──────────────┘
│SQLiteMetaStore│            │                     │
└──────────────┘              │                     │
        │                     ▼                     │
        │            ┌──────────────┐              │
        │            │PalaceStore   │              │
        │            └──────────────┘              │
        │                     │                     │
        └──────────┬──────────┼───────────────────┘
                   │          │
                   ▼          ▼
            ┌──────────────┐
            │ GraphStore   │
            └──────────────┘
```

### 10.2 初始化顺序

```typescript
// 1. ConfigManager (单例)
const configManager = ConfigManager.getInstance();

// 2. 存储层初始化
await vectorStore.initialize();
await metaStore.initialize();
await palaceStore.initialize();
await graphStore.initialize();

// 3. MemoryService 初始化
const memoryService = new StorageMemoryService(
  { cache, vectorStore, metaStore, palaceStore, graphStore },
  embedder
);

// 4. 其他管理器
const profileManager = new ProfileManager();
```

---

## 附录 A: 文件结构

```
src/
├── index.ts                    # 主入口
├── config/                     # 配置管理
│   └── config-manager.ts
├── storage/                    # 五层存储
│   ├── index.ts
│   ├── types.ts               # 存储层类型
│   ├── cache-manager.ts        # L1 缓存
│   ├── vector-store.ts        # L2 向量
│   ├── sqlite-meta-store.ts   # L3 元数据
│   ├── palace-store.ts        # L4 内容
│   └── graph-store.ts         # L5 图谱
├── memory-service/             # 记忆服务
│   ├── index.ts
│   ├── types.ts
│   ├── storage-memory-service.ts
│   ├── memory-store-manager.ts    # 存储管理
│   ├── memory-recall-manager.ts   # 召回管理
│   ├── memory-degradation-manager.ts  # 遗忘管理
│   ├── memory-version-manager.ts     # 版本管理
│   ├── memory-capture-service.ts      # 捕获服务
│   └── llm-extractor.ts              # LLM 提取
├── profile-manager/            # 用户画像
├── presentation/               # API/MCP
├── api/                       # REST API
├── dreaming-engine/           # ⚠️ 待重构
└── types/                    # 共享类型
    ├── memory.ts
    ├── graph.ts
    └── config.ts
```

---

## 附录 B: 接口一览

### StorageMemoryService

```typescript
class StorageMemoryService {
  // 基础操作
  store(input: MemoryInput, scores?: {...}): Promise<Memory>;
  recall(options: RecallOptions): Promise<RecallResult>;
  get(memoryId: string): Promise<Memory | null>;
  update(memoryId: string, update: MemoryUpdate): Promise<Memory | null>;
  delete(memoryId: string): Promise<void>;

  // 强化
  reinforce(memoryId: string, boostAmount?: number): Promise<Memory | null>;
  reinforceBatch(memoryIds: string[]): Promise<void>;

  // 遗忘
  startDegradationTimer(): void;
  stopDegradationTimer(): void;
  runForgettingCycle(): Promise<ForgetReport>;
  runScopeDegradationCycle(): Promise<ScopeDegradationReport>;
}
```

---

## 附录 C: 默认配置

```typescript
const DEFAULT_CONFIG = {
  // 遗忘配置
  forget: {
    archiveThreshold: 3,
    deleteThreshold: 1,
    maxInactiveDays: 90,
    decayRate: 0.05,  // 每天衰减
    importanceWeight: 0.7,
    scopeWeight: 0.3,
  },

  // 强化配置
  reinforce: {
    upgradeThreshold: 7,
    thresholds: {
      highImportance: 7,   // >= 7 → +0.2
      mediumImportance: 6, // >= 6 → +0.1
      lowImportance: 3,    // >= 3 → +0.3
      veryLowImportance: 0,// < 3 → +0.5
    },
  },

  // 升级规则
  scopeUpgrade: {
    sessionToAgent: { recallCount: 3, importanceScore: 5 },
    agentToGlobal: { recallCount: 5, scopeScore: 6, usedByAgents: 2 },
  },

  // 降级规则
  scopeDowngrade: {
    globalToAgent: { scopeScore: 4 },
    agentToSession: { scopeScore: 3 },
  },
};
```

---

**文档版本**: v2.1.0
**最后更新**: 2026-04-13
