# OMMS 配置说明

本文档详细说明 OMMS 项目的所有配置项及其作用。

## 配置文件位置

配置文件位于项目根目录下的 `config.json`。

## 环境变量支持

所有配置项都可以通过环境变量设置，格式为 `OMMS_配置项名`。例如：
- `OMMS_AGENTID` - 对应 `agentId`
- `OMMS_EMBEDDING_APIKEY` - 对应 `embedding.apiKey`

## 配置项说明

### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `agentId` | string | `"default-agent"` | 代理唯一标识符 |

### capture - 记忆捕获配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `confidenceThreshold` | number | `0.5` | 置信度阈值 |
| `maxVersions` | number | `5` | 最大版本数 |
| `enableAutoExtraction` | boolean | `false` | 是否启用自动提取 |
| `extractionTimeout` | number | `30000` | 提取超时（毫秒） |

### llmExtraction - LLM 提取配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `provider` | string | `"mock"` | LLM 提供商 (openai/anthropic/ollama/mock/openai-compatible) |
| `model` | string | `"gpt-4o-mini"` | 模型名称 |
| `apiKey` | string | `""` | API 密钥 |
| `baseURL` | string | `""` | 基础 URL |
| `temperature` | number | `0.7` | 温度参数 |
| `maxTokens` | number | `2000` | 最大 Token 数 |
| `timeout` | number | `30000` | 超时（毫秒） |

### api - API 服务配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用 API 服务 |
| `port` | number | `3000` | 服务端口 |
| `host` | string | `"0.0.0.0"` | 服务主机 |
| `server.timeout` | number | `30000` | 服务器超时（毫秒） |
| `cors.enabled` | boolean | `true` | 是否启用 CORS |
| `cors.origin` | string | `"*"` | CORS 允许的来源 |
| `logging.level` | string | `"info"` | API 日志级别 |
| `logging.enableRequestLogging` | boolean | `true` | 是否记录请求 |
| `logging.enableResponseLogging` | boolean | `false` | 是否记录响应 |
| `logging.enableFileLogging` | boolean | `false` | 是否启用文件日志 |
| `logging.logFilePath` | string | `"./logs/api.log"` | 日志文件路径 |
| `auth.enabled` | boolean | `false` | 是否启用认证 |
| `auth.apiKeys` | string[] | `[]` | 有效的 API 密钥列表 |
| `security.enableAuth` | boolean | `false` | 是否启用安全认证 |
| `security.rateLimit.enabled` | boolean | `false` | 是否启用限流 |
| `security.rateLimit.requestsPerMinute` | number | `60` | 每分钟请求数 |
| `security.rateLimit.windowMs` | number | `60000` | 时间窗口（毫秒） |
| `security.rateLimit.maxRequests` | number | `100` | 窗口内最大请求数 |
| `performance.enableCompression` | boolean | `true` | 是否启用压缩 |
| `performance.maxRequestBodySize` | string | `"10mb"` | 最大请求体大小 |

### mcp - MCP 服务器配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `server.transport` | string | `"stdio"` | 传输方式 (stdio/sse/websocket) |
| `server.port` | number | - | 服务端口 |
| `server.host` | string | - | 服务主机 |
| `tools.enableLogging` | boolean | `true` | 是否启用工具日志 |
| `tools.timeout` | number | `30000` | 工具超时（毫秒） |
| `tools.maxResults` | number | `100` | 最大结果数 |
| `logging.level` | string | `"info"` | 日志级别 |
| `logging.enableToolLogging` | boolean | `true` | 是否记录工具调用 |
| `logging.enableResourceLogging` | boolean | `false` | 是否记录资源访问 |
| `performance.enableCache` | boolean | `true` | 是否启用缓存 |
| `performance.cacheTTL` | number | `300000` | 缓存 TTL（毫秒） |
| `performance.maxConcurrentTools` | number | `10` | 最大并发工具数 |

### logging - 日志配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `level` | string | `"info"` | 日志级别 (debug/info/warn/error) |
| `output` | string | `"file"` | 输出方式 (console/file/both) |
| `filePath` | string | `"./logs/omms.log"` | 日志文件路径 |
| `maxSize` | number | `10485760` | 单日志文件最大大小（字节） |
| `maxFiles` | number | `5` | 保留日志文件最大数量 |

### memoryService - 记忆服务配置

#### store - 存储

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `autoExtract` | boolean | `false` | 是否自动提取 |
| `autoChunk` | boolean | `true` | 是否自动分块 |
| `autoEnrich` | boolean | `true` | 是否自动丰富 |
| `chunkThreshold` | number | `500` | 分块阈值 |
| `defaultType` | string | `"event"` | 默认记忆类型 |

#### recall - 召回

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `defaultLimit` | number | `20` | 默认返回数量 |
| `maxLimit` | number | `100` | 最大返回数量 |
| `minScore` | number | `0.5` | 最小分数 |
| `enableVectorSearch` | boolean | `true` | 是否启用向量搜索 |
| `enableKeywordSearch` | boolean | `true` | 是否启用关键词搜索 |
| `vectorWeight` | number | `0.7` | 向量搜索权重 |
| `keywordWeight` | number | `0.3` | 关键词搜索权重 |

#### forget - 遗忘

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用遗忘 |
| `checkInterval` | number | `86400000` | 检查间隔（毫秒） |
| `archiveThreshold` | number | `3` | 归档阈值 |
| `deleteThreshold` | number | `1` | 删除阈值 |
| `maxInactiveDays` | number | `90` | 最大非活动天数 |
| `scoringWeights.importanceWeight` | number | `0.5` | 重要性权重 |
| `scoringWeights.accessCountWeight` | number | `0.3` | 访问次数权重 |
| `scoringWeights.recencyWeight` | number | `0.2` | 时效性权重 |
| `scoringWeights.accessCountNormalizer` | number | `10` | 访问次数归一化值 |

#### reinforce - 强化

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用强化 |
| `accessWeight` | number | `0.6` | 访问权重 |
| `recencyWeight` | number | `0.4` | 时效性权重 |
| `upgradeThreshold` | number | `7` | 升级阈值 |
| `scoringConfig.accessCountNormalizer` | number | `10` | 访问次数归一化值 |
| `scoringConfig.recencyNormalizer` | number | `86400000` | 时效性归一化值（毫秒） |
| `scoringConfig.maxBoostScore` | number | `2` | 最大加分 |
| `scopeUpgrade.globalImportanceThreshold` | number | `8` | 全局重要性阈值 |
| `scopeUpgrade.agentImportanceThreshold` | number | `5` | 代理重要性阈值 |

#### cache - 缓存

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用缓存 |
| `maxSize` | number | `1000` | 最大缓存项数 |
| `ttl` | number | `3600000` | 缓存 TTL（毫秒） |

#### logging - 日志

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用日志 |
| `level` | string | `"info"` | 日志级别 |

### embedding - 嵌入配置（统一向量存储和嵌入服务配置）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `model` | string | `"text-embedding-3-small"` | 嵌入模型名称 |
| `dimensions` | number | `1536` | 嵌入维度（向量存储会自动使用此配置） |
| `baseURL` | string | `""` | API 基础 URL |
| `apiKey` | string | `""` | API 密钥 |
| `batchSize` | number | `32` | 批量大小 |
| `timeout` | number | `30000` | 超时（毫秒） |

**注意**：embedding 配置的 `dimensions` 参数同时控制向量存储的维度，确保不会出现维度不一致的问题。

### dreamingEngine - 梦境引擎配置

#### scheduler - 调度器

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `autoOrganize` | boolean | `true` | 是否自动整理 |
| `organizeInterval` | number | `21600000` | 整理间隔（毫秒） |
| `memoryThreshold` | number | `1000` | 记忆数量阈值 |
| `fragmentationThreshold` | number | `0.3` | 碎片化阈值 |
| `stalenessDays` | number | `30` | 陈旧天数阈值 |
| `maxMemoriesPerCycle` | number | `100` | 每周期最大处理记忆数 |
| `maxRelationsPerCycle` | number | `50` | 每周期最大处理关系数 |

#### consolidation - 合并

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `similarityThreshold` | number | `0.85` | 相似度阈值 |
| `maxGroupSize` | number | `5` | 最大分组大小 |
| `preserveNewest` | boolean | `true` | 是否保留最新版本 |
| `createNewVersion` | boolean | `true` | 是否创建新版本 |

#### reorganization - 图谱重构

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `minEdgeWeight` | number | `0.3` | 最小边权重 |
| `densityTarget` | number | `0.5` | 密度目标 |
| `orphanThreshold` | number | `0.2` | 孤立节点阈值 |
| `maxNewRelationsPerCycle` | number | `30` | 每周期最大新建关系数 |

#### archival - 归档

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `importanceThreshold` | number | `2` | 重要性阈值 |
| `stalenessDays` | number | `30` | 陈旧天数 |
| `archiveBlock` | string | `"archived"` | 归档区块名称 |
| `retentionDays` | number | `90` | 保留天数 |

#### defragmentation - 碎片整理

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `fragmentationThreshold` | number | `0.3` | 碎片化阈值 |
| `enableCompression` | boolean | `true` | 是否启用压缩 |

#### themeExtraction - 主题提取

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `minThemeStrength` | number | `0.3` | 最小主题强度 |
| `maxThemes` | number | `5` | 最大主题数 |
| `useLLMEnhancement` | boolean | `true` | 是否使用 LLM 增强 |

## 安全建议

1. **不要在 config.json 中保存真实的 API 密钥**，使用环境变量配置
2. 将 config.json 添加到 .gitignore 中，避免提交敏感配置
3. 生产环境中启用 API 认证和限流
4. 定期轮换 API 密钥

## 示例配置

基本使用示例：

```json
{
  "llmExtraction": {
    "provider": "openai-compatible",
    "model": "gpt-4o-mini",
    "apiKey": "your-api-key-here",
    "baseURL": "https://api.openai.com/v1"
  },
  "embedding": {
    "model": "text-embedding-3-small",
    "dimensions": 1536,
    "apiKey": "your-api-key-here",
    "baseURL": "https://api.openai.com/v1"
  }
}
```

