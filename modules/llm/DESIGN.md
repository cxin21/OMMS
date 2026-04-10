# LLM Module Design

## 1. 模块概述

LLM 模块提供大语言模型调用和智能内容提取功能。

### 1.1 主要功能

- **LLM 调用**：调用外部 LLM API
- **内容提取**：从对话中提取关键信息
- **Prompt 管理**：内置提取 Prompt

## 2. 核心组件

### 2.1 LLMService

```typescript
class LLMService {
  configure(config: LLMConfig): void
  isAvailable(): boolean
  async complete(prompt: string): Promise<string>
  async extract(messages): Promise<ExtractedFact[]>
}
```

### 2.2 LLMConfig

```typescript
interface LLMConfig {
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
}
```

## 3. 提取 Prompt

```
你是一个记忆提取专家。从对话中提取值得记住的信息。

提取类型（选择一个最合适的）：
- fact: 客观事实
- preference: 用户偏好
- decision: 做出的决定
- error: 错误或失败
- learning: 学到的知识
- relationship: 关系信息

返回JSON数组：
[
  {"content": "提取的内容", "type": "类型", "confidence": 0.0-1.0}
]
```

## 4. 支持的模型

- OpenAI GPT 系列
- Claude 系列
- 其他 OpenAI 兼容 API

## 5. 集成方式

```typescript
import { getLLMService } from '@omms/llm';

const llmService = getLLMService(config);
llmService.configure({
  provider: 'openai-compatible',
  model: 'gpt-3.5-turbo',
  baseURL: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY
});

if (llmService.isAvailable()) {
  const facts = await llmService.extract(messages);
}
```
