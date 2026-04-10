# OMMS 配置项说明

**版本**: 3.5.0

---

## 1. 基础配置

### 1.1 功能开关

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableAutoCapture` | boolean | `true` | 是否在对话结束时自动提取关键内容 |
| `enableAutoRecall` | boolean | `true` | 是否在对话开始时自动召回相关记忆 |
| `enableLLMExtraction` | boolean | `true` | 是否使用 LLM 进行内容提取 |
| `enableVectorSearch` | boolean | `true` | 是否启用向量搜索 |
| `enableProfile` | boolean | `true` | 是否生成用户画像 |
| `enableGraphEngine` | boolean | `false` | 是否启用知识图谱引擎 |

### 1.2 功能限制

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `maxMemoriesPerSession` | number | `50` | 每个会话的最大记忆数量 |
| `maxExtractionResults` | number | `50` | 每次对话的最大记忆提取数量 |
| `webUiPort` | number | `3456` | Web UI 访问端口 |

---

## 2. LLM 配置

### 2.1 必需配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `llm.provider` | string | 提供商（如 openai-compatible） |
| `llm.model` | string | 模型名称 |
| `llm.baseURL` | string | API 基础地址 |
| `llm.apiKey` | string | API 密钥 |

### 2.2 配置示例

```json
{
  "llm": {
    "provider": "openai-compatible",
    "model": "gpt-3.5-turbo",
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

---

## 3. Embedding 配置

### 3.1 必需配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `embedding.model` | string | 嵌入模型名称 |
| `embedding.dimensions` | number | 向量维度 |
| `embedding.baseURL` | string | API 基础地址 |
| `embedding.apiKey` | string | API 密钥 |

### 3.2 常用模型配置

#### BAAI/bge-m3（推荐中文场景）

```json
{
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimensions": 1024,
    "baseURL": "https://api.siliconflow.cn/v1",
    "apiKey": "${SILICONFLOW_API_KEY}"
  }
}
```

#### OpenAI text-embedding-ada-002

```json
{
  "embedding": {
    "model": "text-embedding-ada-002",
    "dimensions": 1536,
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

---

## 4. 搜索配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `search.vectorWeight` | number | `0.7` | 向量搜索权重（0-1） |
| `search.keywordWeight` | number | `0.3` | 关键词搜索权重（0-1） |
| `search.limit` | number | `10` | 默认搜索结果限制 |
| `search.minSimilarity` | number | `0.3` | 最小相似度阈值（0-1） |

---

## 5. 召回配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `recall.autoRecallLimit` | number | `5` | 自动召回时返回的记忆数量 |
| `recall.manualRecallLimit` | number | `10` | 手动召回时返回的记忆数量 |
| `recall.minSimilarity` | number | `0.3` | 最小相似度阈值（0-1） |
| `recall.boostOnRecall` | boolean | `true` | 召回时是否提升重要性 |
| `recall.boostScopeScoreOnRecall` | boolean | `true` | 召回时是否提升作用域评分 |

---

## 6. 作用域升级配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `scopeUpgrade.agentThreshold` | number | `0.3` | 升级到 agent 的 scopeScore 阈值 |
| `scopeUpgrade.globalThreshold` | number | `0.6` | 升级到 global 的 scopeScore 阈值 |
| `scopeUpgrade.minRecallCount` | number | `2` | 升级到 agent 的最小召回次数 |
| `scopeUpgrade.minAgentCount` | number | `2` | 升级到 global 的最小 Agent 数量 |

---

## 7. 遗忘策略配置

### 7.1 归档配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `forgetPolicy.archiveThreshold` | number | `0.2` | 归档的重要性评分阈值 |
| `forgetPolicy.archiveDays` | number | `30` | 归档前的未访问天数 |
| `forgetPolicy.archiveUpdateDays` | number | `14` | 归档前的未更新天数 |

### 7.2 删除配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `forgetPolicy.deleteThreshold` | number | `0.1` | 删除的重要性评分阈值 |
| `forgetPolicy.deleteDays` | number | `180` | 删除前的未更新天数 |

---

## 8. 强化策略配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `boostPolicy.boostEnabled` | boolean | `true` | 是否启用强化机制 |
| `boostPolicy.lowBoost` | number | `0.1` | 低评分记忆的强化增量（< 0.3） |
| `boostPolicy.mediumBoost` | number | `0.08` | 中评分记忆的强化增量（0.3-0.5） |
| `boostPolicy.highBoost` | number | `0.05` | 高评分记忆的强化增量（0.5-0.8） |
| `boostPolicy.maxImportance` | number | `1.0` | 重要性评分上限 |

---

## 9. Dreaming 配置

### 9.1 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dreaming.enabled` | boolean | `false` | 是否启用 Dreaming 机制 |

### 9.2 定时调度

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dreaming.schedule.enabled` | boolean | `true` | 是否启用定时调度 |
| `dreaming.schedule.time` | string | `"02:00"` | 触发时间（HH:MM） |
| `dreaming.schedule.timezone` | string | `"Asia/Shanghai"` | 时区 |

### 9.3 记忆阈值

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dreaming.memoryThreshold.enabled` | boolean | `true` | 是否启用记忆阈值触发 |
| `dreaming.memoryThreshold.minMemories` | number | `50` | 触发所需最小记忆数量 |
| `dreaming.memoryThreshold.maxAgeHours` | number | `24` | 记忆的最大年龄（小时） |

### 9.4 会话触发

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dreaming.sessionTrigger.enabled` | boolean | `true` | 是否启用会话触发 |
| `dreaming.sessionTrigger.afterSessions` | number | `10` | 触发所需的会话数量 |

### 9.5 提升配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dreaming.promotion.minScore` | number | `0.7` | 记忆提升的最低分数阈值 |
| `dreaming.promotion.weights.recallFrequency` | number | `0.25` | 召回频率权重 |
| `dreaming.promotion.weights.relevance` | number | `0.20` | 相关性权重 |
| `dreaming.promotion.weights.diversity` | number | `0.15` | 多样性权重 |
| `dreaming.promotion.weights.recency` | number | `0.15` | 时效性权重 |
| `dreaming.promotion.weights.consolidation` | number | `0.15` | 整合性权重 |
| `dreaming.promotion.weights.conceptualRichness` | number | `0.10` | 概念丰富度权重 |

---

## 10. 日志配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `logging.level` | string | `info` | 日志级别 |
| `logging.output` | string | `console` | 日志输出位置 |
| `logging.filePath` | string | `~/.openclaw/omms-logs` | 日志文件路径 |

---

## 11. 完整配置示例

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
          "enableVectorSearch": true,
          "enableProfile": true,
          "enableGraphEngine": false,
          "maxMemoriesPerSession": 50,
          "maxExtractionResults": 50,
          "webUiPort": 3456,
          "llm": {
            "provider": "openai-compatible",
            "model": "gpt-3.5-turbo",
            "baseURL": "https://api.openai.com/v1",
            "apiKey": "${OPENAI_API_KEY}"
          },
          "embedding": {
            "model": "BAAI/bge-m3",
            "dimensions": 1024,
            "baseURL": "https://api.siliconflow.cn/v1",
            "apiKey": "${SILICONFLOW_API_KEY}"
          },
          "search": {
            "vectorWeight": 0.7,
            "keywordWeight": 0.3,
            "limit": 10,
            "minSimilarity": 0.3
          },
          "recall": {
            "autoRecallLimit": 5,
            "manualRecallLimit": 10,
            "minSimilarity": 0.3,
            "boostOnRecall": true,
            "boostScopeScoreOnRecall": true
          },
          "scopeUpgrade": {
            "agentThreshold": 0.3,
            "globalThreshold": 0.6,
            "minRecallCount": 2,
            "minAgentCount": 2
          },
          "forgetPolicy": {
            "archiveThreshold": 0.2,
            "archiveDays": 30,
            "archiveUpdateDays": 14,
            "deleteThreshold": 0.1,
            "deleteDays": 180
          },
          "boostPolicy": {
            "boostEnabled": true,
            "lowBoost": 0.1,
            "mediumBoost": 0.08,
            "highBoost": 0.05,
            "maxImportance": 1.0
          },
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
            }
          },
          "logging": {
            "level": "info",
            "output": "console",
            "filePath": "~/.openclaw/omms-logs"
          }
        }
      }
    }
  }
}
```

---

## 12. 环境变量

| 变量 | 说明 |
|------|------|
| `HOME` | 用户主目录（用于确定数据存储路径） |
| `USERPROFILE` | Windows 用户目录（备用） |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `SILICONFLOW_API_KEY` | SiliconFlow API 密钥 |

---

## 13. 数据存储路径

| 数据 | 路径 |
|------|------|
| LanceDB 数据 | `~/.openclaw/omms-data/` |
| 知识图谱 | `~/.openclaw/omms-graph.json` |
| 日志文件 | `~/.openclaw/omms-logs/` |
| Dreaming 日志 | `~/.openclaw/omms-dreaming.log` |
| Dream 报告 | `~/.openclaw/memory/DREAMS.md` |
