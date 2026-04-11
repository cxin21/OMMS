# OMMS - OpenClaw Memory Management System

**版本**: 3.5.0  
**日期**: 2026-04-12

---

## 🎯 简介

OMMS (OpenClaw Memory Management System) 是一个智能记忆管理系统，为 AI Agent 提供长期记忆能力。项目代码质量优秀，测试覆盖完整，所有 46 个测试用例全部通过。

### 核心特性

- **自动记忆捕获** - 对话结束时自动提取关键内容
- **智能记忆召回** - 对话前自动注入相关记忆  
- **双评分系统** - 独立计算重要性评分和作用域评分
- **分级管理** - session → agent → global 三级作用域
- **遗忘机制** - 自动归档/删除低价值记忆
- **强化机制** - 被召回的记忆自动提升重要性
- **跨Agent追踪** - 追踪记忆被不同Agent的使用情况
- **持久化存储** - LanceDB 文件持久化，重启不丢失
- **Web UI** - 可视化管理面板（React + ReactFlow 实现）
- **Dreaming 机制** - 实验性智能记忆巩固系统，模拟人类睡眠时的记忆整合过程
- **测试覆盖** - 46个测试用例全部通过，测试覆盖率高

### 架构优势

- **分层架构**：清晰的服务层、数据层、API层划分
- **模块化设计**：每个功能独立封装，易于扩展和维护
- **类型安全**：完整的 TypeScript 类型定义，依赖管理清晰
- **性能优化**：使用 LanceDB 原生向量索引，内存缓存机制
- **错误处理**：完善的错误处理和日志记录

### Dreaming 机制

**三阶段记忆巩固：**
- **Light 阶段**（整理）：使用双评分系统排序短期记忆
- **Deep 阶段**（提升）：基于多维度信号评估记忆价值
- **REM 阶段**（反思）：使用 LLM 提取主题和反思，写入 DREAMS.md

**触发方式：**
- **自动调度**：每天凌晨定时触发
- **记忆阈值**：达到最小记忆数量触发
- **会话触发**：完成一定会话次数触发
- **手动控制**：CLI 命令或 Web UI 按钮

### 配置管理

**统一配置系统：**
- **环境变量支持**：所有配置都可通过环境变量设置
- **配置文件管理**：支持 JSON 配置文件和配置持久化
- **类型安全**：完整的 TypeScript 类型定义
- **动态更新**：支持运行时配置更新

### 设计理念

**记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

---

## 📦 安装

详细安装说明请查看 [OMMS-Install.md](OMMS-Install.md)

### 快速开始

```bash
# 1. 进入插件目录
cd /home/hechen/OMMS/omms-plugin

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 在 OpenClaw 中安装
openclaw plugins install /home/hechen/OMMS/omms-plugin --force

# 5. 启动
openclaw gateway start
```

---

## ⚙️ 配置

### 最小配置

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true
      }
    }
  }
}
```

### 完整配置

#### 基础配置
| **配置项** | **类型** | **说明** |
|-----------|----------|----------|
| `enableAutoRecall` | 布尔值 | 是否在对话开始时自动召回相关记忆 |
| `enableAutoCapture` | 布尔值 | 是否在对话结束时自动捕获记忆 |
| `enableLLMExtraction` | 布尔值 | 是否使用LLM进行内容提取 |
| `enableGraphEngine` | 布尔值 | 是否启用知识图谱引擎 |
| `enableProfile` | 布尔值 | 是否生成用户画像 |
| `enableSessionSummary` | 布尔值 | 是否启用会话摘要功能（预留字段） |
| `enableVectorSearch` | 布尔值 | 是否启用向量搜索 |
| `maxMemoriesPerSession` | 数字 | 每个会话的最大记忆数量 |
| `autoArchiveThreshold` | 数字 | 自动归档的重要性评分阈值 |
| `maxExtractionResults` | 数字 | 每次对话的最大记忆提取数量 |
| `webUiPort` | 数字 | Web UI访问端口 |

#### 搜索配置
| **配置项** | **类型** | **说明** |
|-----------|----------|----------|
| `search.vectorWeight` | 数字 | 向量搜索权重（0-1） |
| `search.keywordWeight` | 数字 | 关键词搜索权重（0-1） |
| `search.limit` | 数字 | 默认搜索结果限制 |

#### 召回配置
| **配置项** | **类型** | **说明** |
|-----------|----------|----------|
| `recall.autoRecallLimit` | 数字 | 自动召回时返回的记忆数量 |
| `recall.manualRecallLimit` | 数字 | 手动召回时返回的记忆数量 |
| `recall.minSimilarity` | 数字 | 最小相似度阈值（0-1） |
| `recall.boostOnRecall` | 布尔值 | 召回时是否提升重要性 |
| `recall.boostScopeScoreOnRecall` | 布尔值 | 召回时是否提升作用域评分 |

#### Dreaming机制配置
| **配置项** | **类型** | **说明** |
|-----------|----------|----------|
| `dreaming.enabled` | 布尔值 | 是否启用Dreaming机制 |
| `dreaming.schedule.time` | 字符串 | 定时触发时间（HH:MM格式） |
| `dreaming.schedule.timezone` | 字符串 | 时区设置 |
| `dreaming.memoryThreshold.enabled` | 布尔值 | 是否启用内存阈值触发 |
| `dreaming.memoryThreshold.minMemories` | 数字 | 触发Dreaming的最小记忆数量 |
| `dreaming.memoryThreshold.maxAgeHours` | 数字 | 记忆的最大年龄（小时） |
| `dreaming.sessionTrigger.enabled` | 布尔值 | 是否启用会话计数触发 |
| `dreaming.sessionTrigger.afterSessions` | 数字 | 触发Dreaming的会话数量 |
| `dreaming.promotion.minScore` | 数字 | 记忆提升的最低分数阈值 |
| `dreaming.promotion.weights.recallFrequency` | 数字 | 召回频率权重 |
| `dreaming.promotion.weights.relevance` | 数字 | 相关性权重 |
| `dreaming.promotion.weights.diversity` | 数字 | 多样性权重 |
| `dreaming.promotion.weights.recency` | 数字 | 时效性权重 |
| `dreaming.promotion.weights.consolidation` | 数字 | 整合性权重 |
| `dreaming.promotion.weights.conceptualRichness` | 数字 | 概念丰富度权重 |

#### 其他配置
| **配置项** | **类型** | **说明** |
|-----------|----------|----------|
| `boostPolicy` | 对象 | 强化策略配置 |
| `forgetPolicy` | 对象 | 遗忘策略配置 |
| `scopeUpgrade` | 对象 | 作用域升级策略配置 |
| `embedding` | 对象 | 嵌入模型配置 |
| `llm` | 对象 | LLM配置 |
| `vectorStore` | 对象 | 向量存储配置 |
| `logging` | 对象 | 日志配置 |

---

## 📖 使用指南

详细使用说明请查看 [OMMS-UserGuide.md](OMMS-UserGuide.md)

### 工具列表

| 工具 | 说明 |
|------|------|
| `memory_recall` | 搜索记忆（符合OpenClaw标准） |
| `memory_store` | 显式保存记忆（符合OpenClaw标准） |
| `memory_forget` | 删除记忆（符合OpenClaw标准） |
| `omms_dreaming` | Dreaming 机制控制（OMMS特色功能） |
| `omms_stats` | 查看统计 |
| `omms_logs` | 查看日志 |
| `omms_graph` | 知识图谱查询 |

### Dreaming 工具使用

```bash
# 查看 Dreaming 状态
omms_dreaming status

# 手动启动 Dreaming
omms_dreaming start

# 停止 Dreaming
omms_dreaming stop
```

### Web UI

访问地址: http://127.0.0.1:3456

功能页面：
- **概览** - 统计卡片、类型分布图、作用域分布图
- **记忆列表** - 搜索、筛选、提升/删除
- **活动日志** - 日志统计、完整日志
- **Dreaming** - 梦境机制控制、状态监控、日志查看
- **设置** - 配置 LLM/Embedding、功能开关

---

## 📐 架构设计

详细设计说明请查看 [OMMS-Design.md](OMMS-Design.md)

### 双评分系统

1. **Importance（重要性评分）** - 评估记忆本身的价值
2. **Scope Score（作用域评分）** - 评估记忆被多Agent共享的程度

### 召回优先级

| 优先级 | 条件 | 权重 |
|--------|------|------|
| 1 | 所有者召回 | 1.0 |
| 2 | 当前Agent | 0.8 |
| 3 | global 作用域 | 0.6 |
| 4 | agent 作用域 | 0.4 |
| 5 | 其他session | 0.2 |

### 作用域升级

```
session → agent → global
```

---

## 🔧 开发

### 项目结构

```
omms-plugin/
├── src/
│   ├── services/       # 核心服务
│   │   ├── memory.ts   # 记忆服务
│   │   ├── scorer.ts   # 评分服务
│   │   ├── vector-store.ts  # 向量存储
│   │   ├── persistence.ts   # 持久化
│   │   ├── dreaming.ts  # Dreaming 机制
│   │   └── ...
│   ├── tools/         # 工具
│   │   ├── recall.ts
│   │   ├── write.ts
│   │   ├── dreaming.ts
│   │   └── ...
│   ├── types/         # 类型定义
│   ├── api.ts         # API
│   ├── index.ts       # 入口
│   └── web-server.ts  # Web服务
└── openclaw.plugin.json  # 插件配置
```

### 编译

```bash
npm run build
```

### 测试

```bash
npm test
```

### 测试结果

项目通过所有 46 个测试用例，包括：
- 记忆存储、召回、删除的基本功能测试
- 评分系统和作用域升级的测试
- 搜索和筛选功能的测试
- Dreaming 机制各个阶段的测试
- 边界条件和错误处理的测试

---

## 📚 文档

- [OMMS-Install.md](OMMS-Install.md) - 安装配置文档
- [OMMS-UserGuide.md](OMMS-UserGuide.md) - 使用指南
- [OMMS-Design.md](OMMS-Design.md) - 设计文档

---

## 🐛 问题反馈

- GitHub Issues: https://github.com/cxin21/openclaw-omms/issues

---

## 📄 许可证

MIT

---

## 🙏 致谢

- [LanceDB](https://github.com/lancedb/lancedb) - 嵌入式向量数据库
- [OpenClaw](https://github.com/) - AI Agent 框架