# Vector Search Module Design

## 1. 模块概述

向量搜索模块提供语义向量嵌入和相似度搜索功能，为记忆的智能召回提供支持。

### 1.1 主要功能

- **文本向量化**：将文本转换为高维向量
- **向量缓存**：避免重复计算
- **维度验证**：确保向量维度匹配
- **API 调用**：调用外部嵌入服务

## 2. 核心组件

### 2.1 EmbeddingService

```typescript
class EmbeddingService {
  async initialize(): Promise<void>
  async embed(texts: string[]): Promise<number[][]>
  async embedOne(text: string): Promise<number[]>
  getDimensions(): number
  isAvailable(): boolean
}
```

## 3. 配置项

| 配置项 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `model` | string | 是 | 嵌入模型名称 |
| `dimensions` | number | 是 | 向量维度 |
| `baseURL` | string | 是 | API 基础地址 |
| `apiKey` | string | 是 | API 密钥 |

## 4. 使用流程

```
文本输入
  ↓
检查缓存
  ↓
未命中 → 调用 API
  ↓
返回向量
  ↓
存入缓存
```

## 5. 缓存策略

- 使用 Map 作为缓存容器
- Key: 文本内容
- Value: 向量数组
- 无过期策略（按需清理）

## 6. 集成方式

```typescript
import { getEmbeddingService } from '@omms/vector-search';

const embeddingService = getEmbeddingService(config);
await embeddingService.initialize();

const [vector] = await embeddingService.embedOne("用户偏好深色主题");
```

## 7. 支持的模型

- OpenAI text-embedding-ada-002
- BAAI/bge-m3
- 其他 OpenAI 兼容 API
