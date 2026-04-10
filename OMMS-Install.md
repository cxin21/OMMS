# OMMS 安装配置文档

**版本**: 3.5.0
**日期**: 2026-04-12

---

## 一、快速开始

### 1.1 环境要求

- Node.js >= 22.0.0
- npm 或 pnpm
- OpenClaw >= 2026.3.24
- LLM API (可选，用于智能提取)
- Embedding API (可选，用于向量搜索)

### 1.2 安装步骤

```bash
# 1. 进入插件目录
cd /home/hechen/OMMS/omms-plugin

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 复制 Web UI
mkdir -p dist/ui
cp -r ../omms-ui/dist/* dist/ui/

# 5. 在 OpenClaw 中安装
openclaw plugins install /home/hechen/OMMS/omms-plugin --force
```

### 1.3 启动

```bash
openclaw gateway start
```

### 1.4 访问

- **Web UI**: http://127.0.0.1:3456
- **API**: http://127.0.0.1:3456/api/stats

---

## 二、配置

### 2.1 最小配置

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

### 2.2 完整配置示例

编辑 `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableAutoCapture": true,
          "enableAutoRecall": true,
          "enableLLMExtraction": true,
          "enableProfile": true,
          "enableVectorSearch": true,
          "enableGraphEngine": false,
          "maxMemoriesPerSession": 50,
          "maxExtractionResults": 50,
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
          "vectorStore": {
            "dbPath": "~/.openclaw/omms-data"
          },
          "forgetPolicy": {
            "archiveThreshold": 0.2,
            "archiveDays": 30,
            "archiveUpdateDays": 14,
            "deleteThreshold": 0.1,
            "deleteDays": 180
          },
          "logging": {
            "level": "info",
            "output": "console"
          }
        }
      }
    }
  },
  "tools": {
    "allow": ["memory_recall", "memory_store", "memory_forget", "omms_stats", "omms_logs", "omms_graph"]
  },
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableAutoCapture": true,
          "enableAutoRecall": true,
          "enableLLMExtraction": true,
          "enableProfile": true,
          "enableVectorSearch": true,
          "enableGraphEngine": false,
          "maxMemoriesPerSession": 50,
          "autoArchiveThreshold": 0.2,
          "maxExtractionResults": 50,
          "webUiPort": 3456,
          "search": {
            "vectorWeight": 0.7,
            "keywordWeight": 0.3,
            "limit": 10
          },
          "recall": {
            "autoRecallLimit": 5,
            "manualRecallLimit": 10,
            "minSimilarity": 0.3,
            "boostOnRecall": true,
            "boostScopeScoreOnRecall": true
          },
          "boostPolicy": {
            "boostEnabled": true,
            "lowBoost": 0.1,
            "mediumBoost": 0.08,
            "highBoost": 0.05,
            "maxImportance": 0.8
          },
          "forgetPolicy": {
            "archiveThreshold": 0.2,
            "archiveDays": 30,
            "archiveUpdateDays": 14,
            "deleteThreshold": 0.1,
            "deleteDays": 180
          },
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
          },
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
          "vectorStore": {
            "dbPath": "~/.openclaw/omms-data"
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

## 三、配置选项详解

### 3.1 功能开关

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableAutoCapture` | boolean | true | 自动记忆捕获 |
| `enableAutoRecall` | boolean | true | 自动记忆召回 |
| `enableLLMExtraction` | boolean | true | LLM 智能提取 |
| `enableVectorSearch` | boolean | true | 向量搜索 |
| `enableProfile` | boolean | true | 用户 Profile |
| `enableSessionSummary` | boolean | true | 会话摘要功能（预留字段） |
| `enableGraphEngine` | boolean | false | 知识图谱引擎 |
| `maxMemoriesPerSession` | number | 50 | 每会话最大记忆数 |
| `autoArchiveThreshold` | number | 0.2 | 自动归档的重要性评分阈值 |
| `maxExtractionResults` | number | 50 | 每次提取最大记忆数 |
| `webUiPort` | number | 3456 | Web UI 端口 |

### 3.2 搜索配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `search.vectorWeight` | number | 0.7 | 向量搜索权重（0-1） |
| `search.keywordWeight` | number | 0.3 | 关键词搜索权重（0-1） |
| `search.limit` | number | 10 | 默认搜索结果限制 |

### 3.3 召回配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `recall.autoRecallLimit` | number | 5 | 自动召回时返回的记忆数量 |
| `recall.manualRecallLimit` | number | 10 | 手动召回时返回的记忆数量 |
| `recall.minSimilarity` | number | 0.3 | 最小相似度阈值（0-1） |
| `recall.boostOnRecall` | boolean | true | 召回时是否提升重要性 |
| `recall.boostScopeScoreOnRecall` | boolean | true | 召回时是否提升作用域评分 |

### 3.4 Dreaming机制配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `dreaming.enabled` | boolean | true | 是否启用Dreaming机制 |
| `dreaming.schedule.enabled` | boolean | true | 是否启用定时调度 |
| `dreaming.schedule.time` | string | "02:00" | 定时触发时间（HH:MM格式） |
| `dreaming.schedule.timezone` | string | "Asia/Shanghai" | 时区设置 |
| `dreaming.memoryThreshold.enabled` | boolean | true | 是否启用内存阈值触发 |
| `dreaming.memoryThreshold.minMemories` | number | 50 | 触发Dreaming的最小记忆数量 |
| `dreaming.memoryThreshold.maxAgeHours` | number | 24 | 记忆的最大年龄（小时） |
| `dreaming.sessionTrigger.enabled` | boolean | true | 是否启用会话计数触发 |
| `dreaming.sessionTrigger.afterSessions` | number | 10 | 触发Dreaming的会话数量 |
| `dreaming.promotion.minScore` | number | 0.7 | 记忆提升的最低分数阈值 |
| `dreaming.promotion.weights.recallFrequency` | number | 0.25 | 召回频率权重 |
| `dreaming.promotion.weights.relevance` | number | 0.20 | 相关性权重 |
| `dreaming.promotion.weights.diversity` | number | 0.15 | 多样性权重 |
| `dreaming.promotion.weights.recency` | number | 0.15 | 时效性权重 |
| `dreaming.promotion.weights.consolidation` | number | 0.15 | 整合性权重 |
| `dreaming.promotion.weights.conceptualRichness` | number | 0.10 | 概念丰富度权重 |
| `dreaming.output.path` | string | "~/.openclaw/memory/DREAMS.md" | Dreaming结果存储路径 |
| `dreaming.output.maxReflections` | number | 5 | 最大反思数量 |
| `dreaming.output.maxThemes` | number | 10 | 最大主题数量 |
| `dreaming.logging.level` | string | "info" | 日志级别 |
| `dreaming.logging.consoleOutput` | boolean | true | 控制台输出 |
| `dreaming.logging.fileOutput` | boolean | true | 文件输出 |
| `dreaming.logging.outputPath` | string | "~/.openclaw/omms-dreaming.log" | 日志文件路径 |
| `dreaming.logging.maxFileSize` | string | "10MB" | 最大文件大小 |
| `dreaming.logging.maxFiles` | number | 5 | 日志文件数量 |

### 3.5 强化策略配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `boostPolicy.boostEnabled` | boolean | true | 是否启用强化机制 |
| `boostPolicy.lowBoost` | number | 0.1 | 低重要性记忆的强化增量（< 0.3） |
| `boostPolicy.mediumBoost` | number | 0.08 | 中等重要性记忆的强化增量（0.3-0.5） |
| `boostPolicy.highBoost` | number | 0.05 | 高重要性记忆的强化增量（0.5-0.8） |
| `boostPolicy.maxImportance` | number | 0.8 | 强化的最高重要性限制 |

### 3.6 作用域升级策略配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `scopeUpgrade.agentThreshold` | number | 0.3 | 从session到agent作用域的scopeScore阈值 |
| `scopeUpgrade.globalThreshold` | number | 0.6 | 从agent到global作用域的scopeScore阈值 |
| `scopeUpgrade.minRecallCount` | number | 2 | 升级到agent作用域的最低召回次数 |
| `scopeUpgrade.minAgentCount` | number | 2 | 升级到global作用域的最低Agent数量 |

### 3.7 遗忘策略配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `forgetPolicy.archiveThreshold` | number | 0.2 | 触发归档检查的重要性阈值 |
| `forgetPolicy.archiveDays` | number | 30 | 触发归档的未访问天数 |
| `forgetPolicy.archiveUpdateDays` | number | 14 | 触发归档的未更新天数 |
| `forgetPolicy.deleteThreshold` | number | 0.1 | 触发删除检查的重要性阈值 |
| `forgetPolicy.deleteDays` | number | 180 | 触发删除的未更新天数 |

### 3.3 LLM 配置

```typescript
llm: {
  provider: string;      // "openai-compatible"
  model: string;           // "abab6.5s-chat"
  baseURL: string;        // API 地址
  apiKey: string;         // API Key
}
```

### 3.4 Embedding 配置

```typescript
embedding: {
  model: string;         // "BAAI/bge-m3"
  dimensions: number;      // 1024
  baseURL: string;         // API 地址
  apiKey: string;         // API Key
}
```

### 3.5 向量存储配置

```typescript
vectorStore: {
  dbPath: string;        // "~/.openclaw/omms-data"
}
```

### 3.6 日志配置

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `logging.level` | string | "info" | 日志级别 (debug/info/warn/error) |
| `logging.output` | string | "console" | 输出方式 (console/file/both) |

---

## 四、API 配置

### 4.1 LLM API 提供商

| 提供商 | Base URL | 模型 | 特点 |
|--------|----------|------|------|
| **MiniMax** | `https://api.minimax.chat/v1` | abab6.5s-chat | 中文支持好 |
| **硅基流动** | `https://api.siliconflow.cn/v1` | 多模型 | 价格低廉 |

获取 MiniMax API Key: https://platform.minimaxi.com

### 4.2 Embedding API 提供商

| 提供商 | Base URL | 模型 | 维度 | 特点 |
|--------|----------|------|------|------|
| **硅基流动** | `https://api.siliconflow.cn/v1` | `BAAI/bge-m3` | 1024 | 低廉 |
| **火山引擎** | `https://ark.cn-beijing.volces.com/api/v1` | `doubao-embedding-text-2412` | 1024 | 低廉 |
| **DeepSeek** | `https://api.deepseek.com/v1` | `text-embedding-v2` | 1536 | 低廉 |
| **OpenAI** | `https://api.openai.com/v1` | `text-embedding-3-small` | 1536 | 按量计费 |

获取 API Key: https://platform.siliconflow.cn

### 4.3 常用配置模板

#### MiniMax + 硅基流动 (推荐)

```json
{
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
  }
}
```

---

## 五、持久化存储

### 5.1 存储位置

使用 LanceDB 嵌入式向量数据库：

```
~/.openclaw/omms-data/
├── .manifest files...
└── memories (LanceDB 表)
```

### 5.2 数据格式

LanceDB 表包含以下字段：

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
| recallByAgents | string | JSON对象，各Agent召回次数 |
| usedByAgents | string | JSON数组，使用过此记忆的Agent |
| vector | float[1024] | 向量嵌入 |

---

## 六、Web UI

### 6.1 访问地址

```
http://127.0.0.1:3456
```

### 6.2 功能页面

| 页面 | 功能 |
|------|------|
| **概览** | 统计卡片、类型分布图、作用域分布图、最近活动 |
| **记忆列表** | 搜索、筛选（类型/级别）、提升/删除 |
| **活动日志** | 日志统计、完整日志 |
| **设置** | LLM/Embedding 配置、功能开关 |

### 6.3 API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/stats` | GET | 获取统计 |
| `/api/memories` | GET | 获取记忆列表 |
| `/api/logs` | GET | 获取日志 |
| `/api/config` | GET | 获取配置 |
| `/api/delete` | POST | 删除记忆 |
| `/api/promote` | POST | 提升记忆 |

---

## 七、CLI 工具

### 7.1 命令

```bash
# 查看统计
npx omms-cli stats

# 列出记忆
npx omms-cli list --scope session --limit 20

# 搜索记忆
npx omms-cli search "TypeScript"

# 清理记忆
npx omms-cli clear
```

---

## 八、常见问题

### 8.1 Q: 插件启动失败？

```bash
# 检查 Node.js 版本
node --version  # 需要 >= 22

# 检查日志
openclaw gateway logs | grep omms
```

### 8.2 Q: 记忆不持久化？

检查存储目录权限：

```bash
ls -la ~/.openclaw/omms-data/
```

### 8.3 Q: Web UI 无法访问？

```bash
# 检查端口占用
lsof -i :3456

# 重启插件
openclaw gateway restart
```

### 8.4 Q: 如何调整遗忘策略？

编辑配置文件：

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

---

## 九、获取帮助

- GitHub Issues: https://github.com/cxin21/openclaw-omms/issues
- 设计文档: 查看 OMMS-Design.md
- 使用指南: 查看 OMMS-UserGuide.md
