# OMMS 系统设计文档

**版本**: 3.5.0
**日期**: 2026-04-12

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
| **Web UI** | 可视化管理面板（React + ReactFlow） |
| **知识图谱** | 知识图谱可视化（使用 ReactFlow） |
| **统一配置** | 完整的配置管理系统，支持环境变量配置 |
| **Dreaming 机制** | 智能记忆巩固系统，支持多种触发方式 |

### 1.2 设计理念

**核心理念：记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

---

## 二、系统架构

### 2.1 配置管理架构

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

### 2.2 插件架构

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

## 三、模块架构

### 3.1 模块依赖图

```
┌──────────────┐
│   types     │  (共享类型定义)
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│   logging    │────▶│  core-memory │
└──────────────┘     └──────┬───────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ vector-search│     │      llm     │     │knowledge-graph│
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   dreaming   │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    profile   │
                     └──────────────┘
```

### 3.2 模块职责

| 模块 | 职责 | 核心类 |
|------|------|--------|
| types | 共享类型定义 | - |
| logging | 日志记录 | LoggerService |
| core-memory | 记忆管理 | MemoryService, ScorerService, Persistence |
| vector-search | 向量嵌入 | EmbeddingService |
| llm | LLM 调用 | LLMService, LLMExtractor |
| knowledge-graph | 知识图谱 | GraphEngine |
| profile | 用户画像 | ProfileEngine |
| dreaming | 记忆巩固 | DreamingService |

---

## 四、数据模型

### 4.1 Memory

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
  metadata: Record<string, unknown>; // 元数据
}
```

### 4.2 记忆类型

```typescript
type MemoryType = "fact" | "preference" | "decision" | "error" | "learning" | "relationship";
```

### 4.3 作用域

```typescript
type MemoryScope = "session" | "agent" | "global";
```

### 4.4 存储块

```typescript
type MemoryBlock = "working" | "session" | "core" | "archived" | "deleted";
```

---

## 五、双评分系统

### 5.1 重要性评分（Importance）

评估记忆本身的价值：

```
importance = 0.2
├── + 类型权重 (0.08-0.25)
│      decision (0.25) > error (0.20) > preference (0.15) > fact/learning (0.10) > relationship (0.08)
├── + 置信度 × 0.15
├── + 显式请求 × 0.25
├── + 相关记忆数 × 0.02 (上限0.10)
├── + 会话长度 > 10 × 0.05
└── + 轮次 > 5 × 0.05
```

### 5.2 作用域评分（Scope Score）

评估记忆被多Agent共享的程度：

```
scopeScore = 0
├── + 各Agent召回次数 × 0.15 (每个Agent独立计算，上限0.45)
├── + 新Agent首次有效使用 + 0.2
└── + 新Agent有效使用 + 0.1
```

---

## 六、遗忘策略

### 6.1 遗忘条件

| 优先级 | 条件 | 操作 |
|-------|------|------|
| 1 | importance < 0.1 且 180天未更新 且 updateCount === 0 | **删除** |
| 2 | importance < 0.2 且 30天未访问 且 14天未更新 | **归档** |
| 3 | importance < 0.3 且 60天未访问 且 30天未更新 | **归档** |

### 6.2 遗忘流程

```
每条记忆定期检查
    │
    ▼
检查删除条件 → 满足 → 删除记忆
    │
    │ 不满足
    ▼
检查归档条件 → 满足 → 归档记忆
    │
    │ 不满足
    ▼
检查作用域升级 → 满足 → 升级作用域
```

---

## 七、Dreaming 机制

### 7.1 三阶段处理

#### Light 阶段（整理）
- 获取短期记忆
- 使用双评分系统排序

#### Deep 阶段（提升）
- 多维度信号评估
- 作用域提升决策

#### REM 阶段（反思）
- 主题提取
- 反思生成
- 写入 DREAMS.md

### 7.2 触发机制

- **定时调度**：每天凌晨定时触发
- **记忆阈值**：达到最小记忆数量触发
- **会话触发**：完成一定会话次数触发
- **手动控制**：CLI 命令或 Web UI

---

## 八、知识图谱

### 8.1 关系类型

| 关系类型 | 说明 |
|---------|------|
| `uses` | X 使用 Y |
| `depends_on` | X 依赖 Y |
| `part_of` | X 是 Y 的一部分 |
| `causes` | X 导致 Y |
| `precedes` | X 在 Y 之前 |
| `resolves` | X 解决 Y |

### 8.2 工作流程

```
记忆存储 → 实体提取 → 关系抽取 → 图谱更新
    │
    ▼
记忆召回 → 图谱查询 → 上下文注入
```

---

## 九、技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript |
| 运行环境 | Node.js >= 22 |
| 向量存储 | LanceDB |
| Embedding | OpenAI Compatible API |
| LLM | OpenAI Compatible API |
| Web UI | React + TailwindCSS + Recharts |

---

## 十、核心概念总结

### 10.1 双评分系统优势

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

### 10.2 关键公式

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

### 10.3 升级路径

```
创建者召回 → scopeScore ↑ → session → agent → global
                              ↑          ↑
                          2次召回    2个Agent使用
```
