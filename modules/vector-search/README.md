# Vector Search Module 使用指南

## 1. 基本使用

### 1.1 初始化

```typescript
import { getEmbeddingService } from '@omms/vector-search';

const embeddingService = getEmbeddingService({
  model: 'BAAI/bge-m3',
  dimensions: 1024,
  baseURL: 'https://api.siliconflow.cn/v1',
  apiKey: process.env.SILICONFLOW_API_KEY
});

await embeddingService.initialize();
```

### 1.2 生成向量

```typescript
// 单条文本
const vector = await embeddingService.embedOne("用户喜欢深色主题");

// 批量文本
const vectors = await embeddingService.embed([
  "用户喜欢深色主题",
  "用户使用 VSCode 编辑器",
  "用户偏好 React 框架"
]);
```

### 1.3 获取向量维度

```typescript
const dimensions = embeddingService.getDimensions();
console.log(`向量维度: ${dimensions}`);
```

## 2. 在记忆系统中的使用

```typescript
import { getEmbeddingService } from '@omms/vector-search';
import { memoryService } from '@omms/core-memory';

// 1. 初始化
const embeddingService = getEmbeddingService(config);
await embeddingService.initialize();

// 2. 存储记忆时自动生成向量
const memory = await memoryService.store({
  content: "用户偏好深色主题",
  type: "preference",
  importance: 0.8
});

// 3. 召回时使用向量搜索
const result = await memoryService.recall("用户的界面偏好");
```

## 3. 缓存机制

```typescript
// 相同文本的向量会被缓存
const v1 = await embeddingService.embedOne("深色主题");
const v2 = await embeddingService.embedOne("深色主题"); // 使用缓存

// 强制重新获取
// 当前实现不支持强制刷新，可通过清理缓存实现
```

## 4. 错误处理

```typescript
try {
  const vector = await embeddingService.embedOne(text);
} catch (error) {
  if (error.message.includes('401')) {
    console.error('API 密钥无效');
  } else if (error.message.includes('429')) {
    console.error('API 调用频率超限');
  } else {
    console.error('嵌入失败:', error);
  }
}
```

## 5. 最佳实践

### 5.1 选择合适的模型

- **高性能**：BAAI/bge-m3 (1024 维)
- **快速**：text-embedding-ada-002 (1536 维)
- **中文优化**：text2vec-base-chinese

### 5.2 维度匹配

确保配置中的维度与实际模型输出一致：

```typescript
const config = {
  model: 'BAAI/bge-m3',
  dimensions: 1024, // 必须与模型输出一致
  // ...
};

// EmbeddingService 会自动验证并调整
```

### 5.3 性能优化

- 批量调用优于多次单条调用
- 合理使用缓存减少 API 调用
- 设置合理的超时时间
