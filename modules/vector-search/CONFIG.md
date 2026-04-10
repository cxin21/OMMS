# Vector Search Module 配置项说明

## 1. 基础配置

### 1.1 必需配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `model` | string | 嵌入模型名称 |
| `dimensions` | number | 向量维度 |
| `baseURL` | string | API 基础地址 |
| `apiKey` | string | API 密钥 |

### 1.2 模型示例

#### BAAI/bge-m3（推荐中文场景）

```json
{
  "model": "BAAI/bge-m3",
  "dimensions": 1024,
  "baseURL": "https://api.siliconflow.cn/v1",
  "apiKey": "${SILICONFLOW_API_KEY}"
}
```

#### OpenAI text-embedding-ada-002

```json
{
  "model": "text-embedding-ada-002",
  "dimensions": 1536,
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "${OPENAI_API_KEY}"
}
```

## 2. 常用模型配置

| 模型 | 维度 | baseURL 示例 |
|------|------|-------------|
| BAAI/bge-m3 | 1024 | https://api.siliconflow.cn/v1 |
| text-embedding-ada-002 | 1536 | https://api.openai.com/v1 |
| text2vec-base-chinese | 768 | https://api.siliconflow.cn/v1 |

## 3. 环境变量

| 变量 | 说明 |
|------|------|
| `SILICONFLOW_API_KEY` | SiliconFlow API 密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |

## 4. 完整配置示例

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

## 5. 向量维度对照表

| 模型 | 维度 | 说明 |
|------|------|------|
| BAAI/bge-m3 | 1024 | 多语言支持，中文优化 |
| BAAI/bge-large-zh | 1024 | 中文专用 |
| text-embedding-ada-002 | 1536 | OpenAI 默认模型 |
| text-embedding-3-small | 1536 | OpenAI 新模型 |
| text-embedding-3-large | 3072 | OpenAI 高精度模型 |

## 6. API 调用限制

不同的嵌入 API 有不同的调用限制：

| 服务商 | 请求限制 | 建议 |
|--------|---------|------|
| OpenAI | 3000 RPM | 批量处理 |
| SiliconFlow | 500 RPM | 批量处理 |
| 自托管 | 取决于硬件 | 优化缓存 |
