# OMMS 插件设计文档

**版本**: 1.3.0
**日期**: 2026-04-08
**状态**: 生产就绪

---

## 一、概述

OMMS (OpenClaw Memory Management System) 是一个为 OpenClaw 设计的智能记忆管理系统，提供：

- **语义向量搜索**：基于 Embedding 的相似度检索
- **用户画像**：自动构建和维护用户特征
- **记忆分类**：fact / preference / decision / error / learning / relationship
- **重要性评分**：自动评估记忆的重要程度
- **遗忘机制**：自动归档和删除低价值记忆
- **日志管理**：完整的日志记录和调试支持

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       OpenClaw Runtime                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    OMMS Plugin                           │   │
│   │                                                           │   │
│   │   ┌─────────────────────────────────────────────────┐ │   │
│   │   │                  Tools Layer                      │ │   │
│   │   │   omms_recall | omms_write | omms_stats | omms_logs│ │   │
│   │   └─────────────────────────────────────────────────┘ │   │
│   │                          │                              │   │
│   │   ┌─────────────────────────────────────────────────┐ │   │
│   │   │              Service Layer                       │ │   │
│   │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │ │   │
│   │   │  │Memory  │ │Embedding│ │ Profile│ │Logger │ │ │   │
│   │   │  │Service │ │ Service │ │ Engine│ │        │ │ │   │
│   │   │  └─────────┘ └─────────┘ └─────────┘ └───────┘ │ │   │
│   │   └─────────────────────────────────────────────────┘ │   │
│   │                          │                              │   │
│   │   ┌─────────────────────────────────────────────────┐ │   │
│   │   │             Storage Layer                       │ │   │
│   │   │  ┌─────────────────┐  ┌─────────────────────┐     │ │   │
│   │   │  │ Vector Store   │  │ In-Memory Store   │     │ │   │
│   │   │  │ (Embedding API)│  │ (Memory Map)     │     │ │   │
│   │   │  └─────────────────┘  └─────────────────────┘     │ │   │
│   │   └─────────────────────────────────────────────────┘ │   │
│   │                          │                              │   │
│   └──────────────────────────┼──────────────────────────────┘   │
│                              │                                 │
│   ┌──────────────────────────┼──────────────────────────────┐   │
│   │             External Services                        │   │
│   │  ┌───────────────┐  ┌───────────────┐               │   │
│   │  │ Embedding API│  │ OpenClaw API │               │   │
│   │  │ (硅基/火山)  │  │ (memory)     │               │   │
│   │  └───────────────┘  └───────────────┘               │   │
│   └──────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户消息
    │
    ▼
┌─────────────────────────────────────────────────────┐
│             agent_end Hook                          │
│  ┌─────────────────────────────────────────────┐ │
│  │  1. extractFromMessages()                  │ │
│  │     - 正则匹配提取关键内容                  │ │
│  │     - 类型分类 (decision/preference/error)  │ │
│  │  2. scorer.score()                        │ │
│  │     - 计算重要性分数 (0-1)                 │ │
│  │  3. memoryService.store()                │ │
│  │     - 保存到内存                          │ │
│  │     - 生成向量并存储                     │ │
│  │  4. logger.info()                        │ │
│  │     - 记录操作日志                       │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
    │
    ▼
记忆存储完成 + 日志记录

──────────── 用户查询 ────────────

用户查询
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              omms_recall Tool                      │
│  ┌─────────────────────────────────────────────┐ │
│  │  1. embedding.embedOne(query)             │ │
│  │     - 调用远程 API 生成向量                  │ │
│  │  2. vectorStore.search()                 │ │
│  │     - 余弦相似度计算                       │ │
│  │     - RRF 融合排序                        │ │
│  │  3. profileEngine.build()                 │ │
│  │     - 构建用户画像                        │ │
│  │  4. logger.debug()                       │ │
│  │     - 记录搜索详情                        │ │
│  │  5. 返回 profile + memories              │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 三、核心模块

### 3.1 Memory Service

负责记忆的存储、检索和管理。

```typescript
// 存储记忆
await memoryService.store({
  content: "用户偏好使用TypeScript",
  type: "preference",
  importance: 0.8,
  agentId: "agent-001",
});

// 语义检索
const result = await memoryService.recall("用户的技术栈偏好", {
  limit: 10,
});

// 统计分析
const stats = await memoryService.getStats();
```

### 3.2 Embedding Service

封装远程 Embedding API 调用。

```typescript
interface EmbeddingConfig {
  model: string;      // 模型名称
  dimensions: number;   // 向量维度
  baseURL: string;    // API 地址
  apiKey: string;      // API Key
}
```

**支持的 API 格式**：OpenAI-compatible (任何符合规范的 API)

### 3.3 Vector Store

向量存储和相似度搜索。

```typescript
// 添加向量
await vectorStore.add(memory, content);

// 搜索相似记忆
const results = await vectorStore.search(query, limit);
```

**搜索算法**：
1. 生成查询向量
2. 计算余弦相似度
3. RRF (Reciprocal Rank Fusion) 融合

### 3.4 Profile Engine

构建用户画像。

```typescript
// 记忆类型
type MemoryType = "fact" | "preference" | "decision" | "error" | "learning" | "relationship";

// 构建画像
const profile = profileEngine.build(memories, agentId);

// 生成摘要
const summary = profileEngine.summarize(profile);
```

### 3.5 Scorer

评估记忆重要性。

```typescript
interface ScoreInput {
  content: string;
  type: MemoryType;
  confidence: number;
  explicit: boolean;      // 是否显式要求记住
  relatedCount: number;    // 相关记忆数量
  sessionLength: number;
  turnCount: number;
}

// 评分结果
scorer.score(input);           // 0-1 的重要性分数
scorer.decideScope(importance); // "long-term" | "session"
scorer.decideBlock(importance); // "core" | "session" | "working"
```

### 3.6 Logger

日志管理服务。

```typescript
const logger = getLogger();

logger.debug("Searching memories", { query, limit });
logger.info("Memory stored", { id: memory.id, scope: memory.scope });
logger.warn("Vector search failed", { error });
logger.error("Embedding API error", { status: response.status });
```

**特性**：
- 可配置日志级别（debug/info/warn/error）
- 支持控制台和文件双输出
- 内存缓冲（最多1000条）
- 运行时可查看日志统计

---

## 四、记忆类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `fact` | 客观事实 | "用户在开发一个React项目" |
| `preference` | 用户偏好 | "用户喜欢用VSCode" |
| `decision` | 决策选择 | "决定使用PostgreSQL数据库" |
| `error` | 错误失败 | "之前遇到过CORS问题" |
| `learning` | 学到的知识 | "学会了用Docker部署" |
| `relationship` | 实体关系 | "React依赖Node.js" |

---

## 五、重要性评分算法

### 5.1 评分因素

```
基础分数 = 0.2
     │
     ├── + 类型权重 (0.08-0.25)
     │      decision > error > preference > fact/learning > relationship
     │
     ├── + 置信度 × 0.15
     │
     ├── + 显式请求 × 0.25
     │      (用户说"记住"、"note that")
     │
     ├── + 相关记忆数 × 0.02 (上限0.10)
     │
     ├── + 会话长度 > 10 × 0.05
     │
     └── + 轮次 > 5 × 0.05
```

### 5.2 分级召回机制

召回时按优先级排序：

| 优先级 | 作用域 | 权重 |
|--------|--------|------|
| 1 | 当前会话 | 1.0 |
| 2 | 当前Agent | 0.8 |
| 3 | 全局 | 0.6 |
| 4 | 其他会话 | 0.4 |
| 5 | 其他Agent | 0.2 |

**综合评分公式**：
```
最终分数 = 相似度 × 作用域权重 + 重要性 × 0.3
```

### 5.3 记忆强化机制

被召回时自动强化：

| 当前评分 | 强化增量 |
|---------|---------|
| < 0.3 | +0.1 |
| 0.3 - 0.5 | +0.08 |
| 0.5 - 0.8 | +0.05 |
| >= 0.8 | 0 |

**效果**：
- 低分记忆被多次召回后评分快速提升
- 评分提升触发作用域升级：session → agent → global
- 高分记忆获得更高召回优先级

### 5.4 遗忘策略

| 条件 | 操作 |
|------|------|
| importance < 0.2 且 30天未访问 | 归档 |
| importance < 0.1 且 180天无更新 | 删除 |
| 评分高 + 多次召回 | 升级作用域 |

### 5.5 作用域升级

```
session (会话级)
    ↓ 评分 > 0.5 + 多次召回
agent (Agent级)
    ↓ 评分 > 0.8 + 多次召回
global (全局级)
```

---

## 六、搜索算法

### 6.1 混合搜索

```
查询
  │
  ├──> 向量搜索 (余弦相似度)
  │       weight: 0.7
  │
  └──> 关键词搜索 (BM25)
          weight: 0.3
  │
  ▼
RRF 融合
  │
  ▼
排序结果
```

### 6.2 RRF 融合公式

```
RRF_score = Σ (1 / (60 + rank))
```

---

## 七、OpenClaw 集成

### 7.1 工具注册

```typescript
api.registerTool({
  name: "omms_recall",
  label: "Recall Memory",
  description: "Search and retrieve memories",
  parameters: Type.Object({...}),
  async execute(_id, params) { ... }
}, { optional: true });
```

### 7.2 Hooks

```typescript
// agent_end: 自动提取记忆
api.registerHook("agent_end", async (event) => {
  const facts = await memoryService.extractFromMessages(event.messages);
  for (const fact of facts) {
    await memoryService.store(fact);
  }
});
```

---

## 八、日志管理

### 8.1 日志架构

```
┌─────────────────────────────────────────────────────┐
│                 Logger Service                      │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │           Log Level Filter               │   │
│  │  debug < info < warn < error            │   │
│  └─────────────────────────────────────────┘   │
│                      │                           │
│                      ▼                           │
│  ┌─────────────────────────────────────────┐   │
│  │            Log Entry                     │   │
│  │  { timestamp, level, message, data }     │   │
│  └─────────────────────────────────────────┘   │
│                      │                           │
│         ┌────────────┼────────────┐              │
│         ▼            ▼            ▼              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│   │ Console  │  │  File   │  │ Memory  │        │
│   │  Output  │  │  Append │  │ Buffer  │        │
│   └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────┘
```

### 8.2 日志级别

| 级别 | 值 | 说明 |
|------|-----|------|
| `debug` | 0 | 详细日志（包含所有操作） |
| `info` | 1 | 一般信息（**默认**） |
| `warn` | 2 | 仅警告和错误 |
| `error` | 3 | 仅错误 |

### 8.3 日志输出

| 输出 | 说明 |
|------|------|
| `console` | 仅控制台输出（**默认**） |
| `file` | 仅文件输出 |
| `both` | 同时输出到控制台和文件 |

### 8.4 日志示例

```
2026-04-08T10:30:45.123Z [INFO] [OMMS] Initializing OMMS plugin
2026-04-08T10:30:45.234Z [INFO] [OMMS] Embedding service initialized { model: "BAAI/bge-m3", dimensions: 1024 }
2026-04-08T10:30:45.456Z [INFO] [OMMS] Memory service configured
2026-04-08T10:31:00.000Z [DEBUG] [OMMS] Searching memories { query: "用户偏好", limit: 10 }
2026-04-08T10:31:00.500Z [INFO] [OMMS] Recall complete { query: "用户偏好", memoriesFound: 3, hasProfile: true }
2026-04-08T10:31:30.000Z [INFO] [OMMS] Memory stored { id: "mem_1712567890_abc123", scope: "long-term" }
2026-04-08T10:32:00.000Z [WARN] [OMMS] Embedding API error { status: 401 }
2026-04-08T10:32:01.000Z [ERROR] [OMMS] Embedding failed { error: "Unauthorized" }
```

### 8.5 日志 API

```typescript
import { getLogger } from "./services/logger.js";

const logger = getLogger();

// 记录不同级别的日志
logger.debug("详细调试信息", { key: "value" });
logger.info("一般信息");
logger.warn("警告信息");
logger.error("错误信息", error);

// 获取日志统计
const stats = logger.getStats();
// { total: 100, byLevel: { debug: 50, info: 30, warn: 15, error: 5 } }

// 查看最近日志
const logs = logger.getLogs({ limit: 50 });

// 清空日志
logger.clear();
```

---

## 九、项目结构

```
omms-plugin/
├── package.json
├── tsconfig.json
├── openclaw.plugin.json
│
├── src/
│   ├── index.ts              # 插件入口
│   │
│   ├── types/
│   │   └── index.ts          # 类型定义
│   │
│   ├── services/
│   │   ├── memory.ts         # 记忆服务
│   │   ├── embedding.ts       # Embedding API
│   │   ├── vector-store.ts   # 向量存储
│   │   ├── profile.ts        # 用户画像
│   │   ├── scorer.ts         # 重要性评分
│   │   ├── graph.ts          # 关系图谱
│   │   ├── logger.ts         # 日志管理
│   │   └── index.ts          # 导出
│   │
│   └── tools/
│       ├── recall.ts         # 检索工具
│       ├── write.ts          # 写入工具
│       ├── stats.ts          # 统计工具
│       ├── logs.ts           # 日志工具
│       └── index.ts          # 导出
│
└── dist/                     # 编译输出
```

---

## 十、技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 语言 | TypeScript | OpenClaw 官方支持 |
| 向量 | 远程 API | 灵活切换提供商 |
| 存储 | 内存 Map | 简单可靠，可升级 |
| 搜索 | 余弦相似度 + RRF | 平衡准确性和性能 |
| 日志 | 内存缓冲 + 文件 | 可调试 + 可追溯 |

---

## 十一、扩展方向

| 功能 | 优先级 | 说明 |
|------|--------|------|
| LanceDB 持久化 | P2 | 支持大规模记忆 |
| Cross-Encoder 重排 | P2 | 提升搜索准确性 |
| 多 Agent 共享 | P2 | 记忆跨 Agent 传递 |
| 增量 Embedding | P3 | 减少 API 调用 |
| 图数据库集成 | P3 | 复杂关系查询 |
| 日志轮转 | P3 | 自动管理日志文件大小 |
