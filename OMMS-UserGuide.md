# OMMS 使用指南

**版本**: 3.5.0
**日期**: 2026-04-12

---

## 一、概述

OMMS (OpenClaw Memory Management System) 为 AI Agent 提供长期记忆能力。

### 1.1 功能特点

- **自动记忆**: 对话结束自动提取关键内容
- **智能召回**: 对话前自动注入相关记忆  
- **双评分系统**: 独立计算重要性评分和作用域评分
- **分级管理**: session → agent → global 三级作用域
- **遗忘机制**: 低价值记忆自动归档/删除
- **强化机制**: 被召回的记忆自动提升重要性
- **跨Agent追踪**: 追踪记忆被不同Agent的使用情况
- **持久化**: 重启后记忆不丢失
- **Web UI**: 可视化管理面板（React + ReactFlow 实现）
- **知识图谱**: 使用 ReactFlow 实现图可视化
- **统一配置**: 完整的配置管理系统，支持环境变量配置


### 1.2 核心设计理念

**记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

---

## 二、工作原理

### 2.1 记忆生命周期

```
用户对话
    │
    ▼
agent_end Hook 触发
    │
    ▼
提取关键内容 (中文关键词 + LLM)
    │
    ▼
存储记忆 (带重要性评分)
    │
    ▼
知识图谱构建 (GraphEngine)
    │
    ▼
向量嵌入存储 (LanceDB)
    │
    ▼
整理记忆 (遗忘/强化/升级)
    │
    ▼
持久化存储
```

### 2.2 召回流程

```
用户发送消息
    │
    ▼
before_prompt_build Hook 触发
    │
    ▼
分级召回 (所有者 > 当前Agent > 其他Agent)
    │
    ▼
计算综合分数 (相似度 × 重要性 × 作用域权重 + scopeScore加成)
    │
    ▼
排序取前5条
    │
    ▼
强化 importance 和 scopeScore
    │
    ▼
构建用户 Profile
    │
    ▼
注入到上下文
```

---

## 三、双评分系统

### 3.1 重要性评分（Importance）

评估记忆本身的价值有多高。

**计算公式：**
```
importance = 0.2
├── + 类型权重 (0.08-0.25)
├── + 置信度 × 0.15
├── + 显式请求 × 0.25
├── + 相关记忆数 × 0.02
├── + 会话长度 > 10 × 0.05
└── + 轮次 > 5 × 0.05
```

**作用：**
- 决定存储位置（core/session/working）
- 影响召回时的基础优先级
- 触发自动强化

### 3.2 作用域评分（Scope Score）

评估记忆被多Agent共享的程度。

**计算公式：**
```
scopeScore = 0
├── + 同一Agent召回次数 × 0.15 (上限0.45)
├── + 不同Agent数量 × 0.2 (每个新Agent)
└── + 被多个Agent有效使用 × 0.1 (每次)
```

**作用：**
- 决定作用域升级
- 影响跨Agent召回优先级

### 3.3 评分解耦优势

```
┌─────────────────────────────────────────────────┐
│  importance = 0.3  (记忆价值低)                  │
│  scopeScore = 0.8  (被广泛使用)                  │
│                                                 │
│  → 存储在 working                              │
│  → 但已升级到 global 作用域                     │
│  → 其他Agent仍可召回                           │
└─────────────────────────────────────────────────┘
```

---

## 四、召回优先级机制

### 4.1 优先级权重表

| 优先级 | 条件 | 权重 | 说明 |
|--------|------|------|------|
| **1** | 所有者召回 | **1.0** | 记忆创建者拥有最高优先级 |
| **2** | 当前Agent | **0.8** | 同会话但非所有者 |
| **3** | global 作用域 | **0.6** | 已扩展到全局的其他Agent |
| **4** | agent 作用域 | **0.4** | 同一Agent组的其他会话 |
| **5** | 其他session | **0.2** | 其他会话的其他Agent |

### 4.2 综合评分公式

```
最终分数 = (相似度 × 重要性) × 作用域权重 + scopeScore × 0.2
```

### 4.3 计算示例

#### 示例1：所有者召回
```
记忆A:
  ownerAgentId = "Agent A" (当前Agent)
  importance = 0.7
  scopeScore = 0.3
  similarity = 0.9

计算:
  priority = 0.9 × 0.7 = 0.63
  scopeWeight = 1.0 (所有者)
  scopeBonus = 0.3 × 0.2 = 0.06

最终分数 = 0.63 × 1.0 + 0.06 = 0.69
```

#### 示例2：其他Agent，global作用域
```
记忆B:
  ownerAgentId = "Agent A"
  currentAgentId = "Agent B"
  importance = 0.8
  scopeScore = 0.6
  scope = "global"
  similarity = 0.9

计算:
  priority = 0.9 × 0.8 = 0.72
  scopeWeight = 0.6 (global)
  scopeBonus = 0.6 × 0.2 = 0.12

最终分数 = 0.72 × 0.6 + 0.12 = 0.552
```

---

## 五、作用域升级机制

### 5.1 升级路径

```
session (作用域评分 0)
    ↓ scopeScore ≥ 0.3 且 recallCount ≥ 2
agent (作用域评分 0.3-0.6)
    ↓ scopeScore ≥ 0.6 且 usedByAgents.length ≥ 2
global (作用域评分 ≥ 0.6)
```

### 5.2 升级判断逻辑

```typescript
// 升级到 Agent
shouldShareToAgent(memory: Memory): boolean {
  const hasMultipleRecalls = memory.recallCount >= 2;
  return memory.scopeScore >= 0.3 && hasMultipleRecalls && memory.scope === "session";
}

// 升级到 Global
shouldShareToGlobal(memory: Memory): boolean {
  const hasMultipleAgents = memory.usedByAgents.length >= 2;
  return memory.scopeScore >= 0.6 && hasMultipleAgents && memory.scope === "agent";
}
```

### 5.3 升级示例

```
Agent A 创建记忆 M:
  ownerAgentId = "Agent A"
  scopeScore = 0
  scope = "session"

Agent A 召回 2次:
  recallByAgents["Agent A"] = 2
  scopeScore += 0.15 × 2 = 0.3
  触发: scopeScore >= 0.3 && recallCount >= 2
  升级: session → agent

Agent B 召回并有效使用:
  recallByAgents["Agent B"] = 1
  usedByAgents.push("Agent B")
  scopeScore += 0.15 + 0.2 + 0.1 = 0.45
  scopeScore = 0.75
  触发: scopeScore >= 0.6 && usedByAgents.length >= 2 (需要再等一次)
  升级: agent → global

最终状态:
  importance = 0.75
  scopeScore = 0.75
  scope = "global"
  ownerAgentId = "Agent A"  (保持不变)
  usedByAgents = ["Agent A", "Agent B"]
```

---

## 六、记忆强化机制

### 6.1 Importance 强化

被召回时自动强化评分：

| 当前评分 | 强化增量 | 触发效果 |
|---------|---------|----------|
| < 0.3 | +0.1 | 快速提升 |
| 0.3 - 0.5 | +0.08 | 中等提升 |
| 0.5 - 0.8 | +0.05 | 缓慢提升 |
| >= 0.8 | 0 | 不再提升 |

### 6.2 Scope Score 强化

每次召回时：

```typescript
// 同一Agent召回
scopeScore += 0.15;

// 新Agent有效使用
if (isEffectiveUse && !usedByAgents.includes(agentId)) {
  scopeScore += 0.2;  // 新Agent使用
  scopeScore += 0.1;  // 有效使用
}
```

---

## 七、遗忘策略

### 7.1 遗忘条件

| 条件 | 自动操作 |
|------|---------|
| importance < 0.2 且 30天未访问 且 14天未更新 | 归档 |
| importance < 0.3 且 60天未访问 且 30天未更新 | 归档 |
| importance < 0.1 且 180天无更新 且 updateCount === 0 | 删除 |

### 7.2 存储块转换

```
working (importance < 0.5)
    ↓ importance ≥ 0.5
session (0.5 ≤ importance < 0.8)
    ↓ importance ≥ 0.8
core (importance ≥ 0.8)
    ↓ 遗忘检查
archived (importance < 0.2 且 30天未访问)
    ↓
deleted (importance < 0.1 且 180天无更新)
```

---

## 八、工具使用

### 8.1 memory_recall - 搜索记忆（符合OpenClaw标准）

```
参数:
  - query: 搜索查询 (必填)
  - limit: 返回数量 (可选，默认5)

示例:
  "用户最近做了哪些决策"
  "关于Python项目的记忆"
```

### 8.2 memory_store - 显式保存记忆（符合OpenClaw标准）

```
参数:
  - content: 要记住的内容 (必填)
  - type: 记忆类型 (可选: fact/preference/decision/error/learning/relationship)
  - importance: 重要性 0-1 (可选，默认0.5)

示例:
  content: "用户偏好使用TypeScript"
  type: "preference"
  importance: 0.8
```

### 8.3 memory_forget - 删除记忆（符合OpenClaw标准）

```
参数:
  - id: 记忆ID (必填)

示例:
  id: "mem_1234567890"
```

### 8.3 omms_stats - 查看统计

```
无参数

返回:
  - 总记忆数
  - 各作用域数量
  - 各类型数量
  - 日志统计
```

### 8.4 omms_logs - 查看日志

```
参数:
  - level: 日志级别 (可选: debug/info/warn/error)
  - limit: 返回数量 (可选，默认50)
```

### 8.5 omms_graph - 知识图谱（可选）

```
参数:
  - query: 关系查询 (必填)

示例:
  "用户和项目的交互关系"
  "某个主题的相关知识"
```

---

## 九、Web UI

### 9.1 访问

启动插件后访问: http://127.0.0.1:3456

### 9.2 功能页面

| 页面 | 功能 |
|------|------|
| **概览** | 统计卡片、类型分布图、作用域分布图、最近活动 |
| **记忆列表** | 搜索、筛选（类型/作用域）、提升/删除 |
| **活动日志** | 日志统计、完整日志 |
| **设置** | 配置 LLM/Embedding、功能开关 |

### 9.3 记忆管理

在记忆列表页面可以：
- 搜索记忆内容
- 按类型筛选（fact/preference/decision/error/learning/relationship）
- 按作用域筛选（session/agent/global）
- 查看记忆详情（ownerAgentId, scopeScore, recallByAgents, usedByAgents）
- 手动提升记忆级别
- 删除记忆

---

## 十、持久化存储

### 10.1 存储位置

使用 **LanceDB** 嵌入式向量数据库：

```
~/.openclaw/omms-data/
├── .manifest files...
└── memories (LanceDB 表)
```

### 10.2 数据字段

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
| recallByAgents | string | JSON，各Agent召回次数 |
| usedByAgents | string | JSON数组，有效使用的Agent |
| vector | float[1024] | 向量嵌入 |

---

## 十一、常见使用场景

### 11.1 记忆用户偏好

```
用户: "我喜欢用 TypeScript，不要用 JavaScript"
Agent: [自动提取为 preference 类型，importance=0.8]
```

### 11.2 记忆项目决策

```
用户: "我们决定用 PostgreSQL 作为数据库"
Agent: [自动提取为 decision 类型，importance=0.9]
```

### 11.3 跨Agent共享知识

```
Agent A: "Python项目使用pytest框架"
  → 存储为 agent 作用域

Agent B: [召回并使用该记忆]
  → scopeScore += 0.45
  → 升级到 global

Agent C: [可以直接召回该记忆]
```

---

## 十二、配置调整

### 12.1 调整召回数量

```json
{
  "recall": {
    "autoRecallLimit": 5,
    "manualRecallLimit": 10,
    "minSimilarity": 0.3
  },
  "search": {
    "vectorWeight": 0.7,
    "keywordWeight": 0.3,
    "limit": 10
  }
}
```

### 12.2 调整遗忘策略

```json
{
  "forgetPolicy": {
    "archiveThreshold": 0.2,
    "archiveDays": 30,
    "deleteThreshold": 0.1,
    "deleteDays": 180
  }
}
```

### 12.3 调整作用域升级阈值

```json
{
  "scopeUpgrade": {
    "agentThreshold": 0.3,
    "globalThreshold": 0.6,
    "minRecallCount": 2,
    "minAgentCount": 2
  },
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
}
```

---

## 十三、获取帮助

- 安装配置: 查看 OMMS-Install.md
- 设计文档: 查看 OMMS-Design.md
- GitHub Issues: https://github.com/cxin21/openclaw-omms/issues
