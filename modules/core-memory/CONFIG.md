# Core Memory Module 配置项说明

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

## 2. 搜索配置

### 2.1 搜索权重

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `search.vectorWeight` | number | `0.7` | 向量搜索权重（0-1） |
| `search.keywordWeight` | number | `0.3` | 关键词搜索权重（0-1） |
| `search.limit` | number | `10` | 默认搜索结果限制 |

### 2.2 相似度配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `search.minSimilarity` | number | `0.3` | 最小相似度阈值（0-1） |

## 3. 召回配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `recall.autoRecallLimit` | number | `5` | 自动召回时返回的记忆数量 |
| `recall.manualRecallLimit` | number | `10` | 手动召回时返回的记忆数量 |
| `recall.minSimilarity` | number | `0.3` | 最小相似度阈值（0-1） |
| `recall.boostOnRecall` | boolean | `true` | 召回时是否提升重要性 |
| `recall.boostScopeScoreOnRecall` | boolean | `true` | 召回时是否提升作用域评分 |

## 4. 作用域升级配置

### 4.1 升级阈值

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `scopeUpgrade.agentThreshold` | number | `0.3` | 升级到 agent 的 scopeScore 阈值 |
| `scopeUpgrade.globalThreshold` | number | `0.6` | 升级到 global 的 scopeScore 阈值 |
| `scopeUpgrade.minRecallCount` | number | `2` | 升级到 agent 的最小召回次数 |
| `scopeUpgrade.minAgentCount` | number | `2` | 升级到 global 的最小 Agent 数量 |

### 4.2 升级条件详解

```
session → agent:
  scopeScore ≥ agentThreshold (0.3) 
  且 recallCount ≥ minRecallCount (2)

agent → global:
  scopeScore ≥ globalThreshold (0.6) 
  且 usedByAgents.length ≥ minAgentCount (2)
```

## 5. 遗忘策略配置

### 5.1 归档配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `forgetPolicy.archiveThreshold` | number | `0.2` | 归档的重要性评分阈值（第二优先级） |
| `forgetPolicy.archiveDays` | number | `30` | 归档前的未访问天数 |
| `forgetPolicy.archiveUpdateDays` | number | `14` | 归档前的未更新天数 |

### 5.2 删除配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `forgetPolicy.deleteThreshold` | number | `0.1` | 删除的重要性评分阈值（最高优先级） |
| `forgetPolicy.deleteDays` | number | `180` | 删除前的未更新天数 |

### 5.3 遗忘条件详解

```
删除条件（最高优先级）:
  importance < deleteThreshold (0.1)
  且 lastUpdate > deleteDays (180) 天
  且 updateCount === 0

归档条件 1（第二优先级）:
  importance < archiveThreshold (0.2)
  且 lastAccess > archiveDays (30) 天
  且 lastUpdate > archiveUpdateDays (14) 天

归档条件 2（第三优先级）:
  importance < 0.3
  且 lastAccess > 60 天
  且 lastUpdate > 30 天
```

## 6. 强化策略配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `boostPolicy.boostEnabled` | boolean | `true` | 是否启用强化机制 |
| `boostPolicy.lowBoost` | number | `0.1` | 低评分记忆的强化增量（< 0.3） |
| `boostPolicy.mediumBoost` | number | `0.08` | 中评分记忆的强化增量（0.3-0.5） |
| `boostPolicy.highBoost` | number | `0.05` | 高评分记忆的强化增量（0.5-0.8） |
| `boostPolicy.maxImportance` | number | `1.0` | 重要性评分上限 |

### 6.1 强化公式

```
当前 importance < 0.3:  boost += 0.1
当前 importance 0.3-0.5:  boost += 0.08
当前 importance 0.5-0.8:  boost += 0.05
当前 importance ≥ 0.8:  boost = 0 (已达上限)
```

## 7. 作用域评分强化配置

### 7.1 评分增量

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `scopeBoost.agentRecall` | number | `0.15` | 每个 Agent 召回的增量 |
| `scopeBoost.maxPerAgent` | number | `0.45` | 每个 Agent 的最大增量 |
| `scopeBoost.firstEffectiveUse` | number | `0.2` | 首次有效使用的增量 |
| `scopeBoost.effectiveUse` | number | `0.1` | 有效使用的增量 |

### 7.2 计算公式

```
每个 Agent 的贡献: min(recallCount, 3) × 0.15
首次有效使用加成: +0.2
后续有效使用加成: +0.1
总 scopeScore 上限: 1.0
```

## 8. 持久化配置

### 8.1 存储路径

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `persistence.path` | string | `~/.openclaw/omms-data` | LanceDB 数据目录 |

### 8.2 向量配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `persistence.vectorDimensions` | number | `1024` | 向量维度 |
| `persistence.indexType` | string | `IVF_PQ` | 索引类型 |
| `persistence.numPartitions` | number | `128` | IVF 索引分区数 |
| `persistence.numSubVectors` | number | `96` | PQ 子向量数 |

## 9. 日志配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `logging.level` | string | `info` | 日志级别 |
| `logging.output` | string | `console` | 日志输出位置 |
| `logging.filePath` | string | `~/.openclaw/omms-logs` | 日志文件路径 |

## 10. 完整配置示例

```json
{
  "enableAutoCapture": true,
  "enableAutoRecall": true,
  "enableLLMExtraction": true,
  "enableVectorSearch": true,
  "enableProfile": true,
  "enableGraphEngine": false,
  "maxMemoriesPerSession": 50,
  "maxExtractionResults": 50,
  "webUiPort": 3456,
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
  "logging": {
    "level": "info",
    "output": "console",
    "filePath": "~/.openclaw/omms-logs"
  }
}
```

## 11. 环境变量

| 变量 | 说明 |
|------|------|
| `HOME` | 用户主目录（用于确定数据存储路径） |
| `USERPROFILE` | Windows 用户目录（备用） |

## 12. 依赖配置

需要在配置中同时提供以下服务的配置：

```json
{
  "llm": {
    "provider": "openai-compatible",
    "model": "gpt-3.5-turbo",
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}"
  },
  "embedding": {
    "model": "text-embedding-ada-002",
    "dimensions": 1536,
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```
