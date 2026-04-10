# Core Memory Module 使用指南

## 1. 快速开始

### 1.1 基本使用

```typescript
import { MemoryService, getMemoryService } from '@omms/core-memory';

// 初始化服务
const memoryService = getMemoryService();
await memoryService.initialize();

// 存储记忆
const memory = await memoryService.store({
  content: "用户喜欢深色主题",
  type: "preference",
  importance: 0.8,
  agentId: "agent-1",
  sessionId: "session-1"
});

// 召回记忆
const result = await memoryService.recall("用户的主题偏好", {
  agentId: "agent-1",
  limit: 10
});

console.log(result.memories);
console.log(result.profile);
```

## 2. 核心功能

### 2.1 自动记忆提取

```typescript
// 从对话消息中提取记忆
const messages = [
  { role: "user", content: "我决定使用 TypeScript 开发这个项目" },
  { role: "assistant", content: "好的，TypeScript 是很好的选择" }
];

const extractedFacts = await memoryService.extractFromMessages(messages);

for (const fact of extractedFacts) {
  await memoryService.store({
    content: fact.content,
    type: fact.type,
    importance: fact.importance,
    agentId: "agent-1",
    sessionId: "session-1"
  });
}
```

### 2.2 智能召回

```typescript
// 自动召回（Agent 启动时调用）
const autoRecallResult = await memoryService.recall("用户偏好", {
  agentId: "agent-1",
  sessionId: "session-1",
  isAutoRecall: true  // 自动召回模式，使用较小的 limit
});

// 手动召回（用户主动查询）
const manualRecallResult = await memoryService.recall("关于项目的决策", {
  agentId: "agent-1",
  limit: 20,
  boostOnRecall: true  // 召回时提升重要性
});
```

### 2.3 记忆管理

```typescript
// 获取所有记忆
const allMemories = memoryService.getAll({
  agentId: "agent-1",
  scope: "all",
  limit: 100
});

// 获取统计信息
const stats = await memoryService.getStats("agent-1");
console.log(`总记忆数: ${stats.total}`);
console.log(`会话级: ${stats.session}`);
console.log(`Agent级: ${stats.agent}`);
console.log(`全局级: ${stats.global}`);
console.log(`平均重要性: ${stats.avgImportance}`);
console.log(`平均作用域评分: ${stats.avgScopeScore}`);

// 删除记忆
await memoryService.delete("mem_123456");

// 清理所有记忆
await memoryService.clear();
```

### 2.4 记忆强化

```typescript
// 手动强化重要性
await memoryService.boost("mem_123456", 0.1);

// 强化作用域评分
await memoryService.boostScopeScore("mem_123456", "agent-2", true);
```

### 2.5 记忆整合

```typescript
// 执行遗忘和升级策略
const consolidationResult = await memoryService.consolidate({
  agentId: "agent-1",
  scope: "all"
});

console.log(`归档: ${consolidationResult.archived}`);
console.log(`删除: ${consolidationResult.deleted}`);
console.log(`升级: ${consolidationResult.promoted}`);
```

## 3. 记忆类型

支持六种记忆类型：

| 类型 | 说明 | 权重 |
|------|------|------|
| `decision` | 做出的决定 | 0.25 |
| `error` | 错误或失败 | 0.20 |
| `preference` | 用户偏好 | 0.15 |
| `fact` | 客观事实 | 0.10 |
| `learning` | 学到的知识 | 0.10 |
| `relationship` | 关系信息 | 0.08 |

## 4. 作用域级别

| 级别 | 说明 | 升级条件 |
|------|------|---------|
| `session` | 会话级记忆 | 默认级别 |
| `agent` | Agent级记忆 | scopeScore ≥ 0.3 且 recallCount ≥ 2 |
| `global` | 全局记忆 | scopeScore ≥ 0.6 且 usedByAgents.length ≥ 2 |

## 5. 存储块

| 块 | 说明 | 条件 |
|----|------|------|
| `working` | 工作记忆 | importance < 0.5 |
| `session` | 会话记忆 | importance ≥ 0.5 |
| `core` | 核心记忆 | importance ≥ 0.8 |
| `archived` | 归档记忆 | 遗忘策略触发 |
| `deleted` | 已删除 | 遗忘策略触发 |

## 6. 完整示例

```typescript
import { MemoryService, getMemoryService } from '@omms/core-memory';

async function example() {
  // 1. 初始化
  const memoryService = getMemoryService();
  await memoryService.initialize();

  // 2. 模拟对话并提取记忆
  const messages = [
    { role: "user", content: "我决定使用 React 开发前端项目" },
    { role: "assistant", content: "好的，React 是很好的选择" },
    { role: "user", content: "我喜欢使用 VSCode 编辑器" }
  ];

  const extractedFacts = await memoryService.extractFromMessages(messages);
  
  for (const fact of extractedFacts) {
    await memoryService.store({
      content: fact.content,
      type: fact.type,
      importance: fact.importance,
      agentId: "frontend-dev",
      sessionId: "session-123"
    });
  }

  // 3. 召回相关记忆
  const recallResult = await memoryService.recall("项目技术栈", {
    agentId: "frontend-dev",
    sessionId: "session-123",
    limit: 5
  });

  console.log("召回的记忆：");
  recallResult.memories.forEach(m => {
    console.log(`- [${m.type}] ${m.content} (重要性: ${m.importance.toFixed(2)})`);
  });

  // 4. 获取统计
  const stats = await memoryService.getStats("frontend-dev");
  console.log(`\n统计信息:`);
  console.log(`总记忆数: ${stats.total}`);
  console.log(`按类型分布:`, stats.byType);
}

example();
```

## 7. 最佳实践

### 7.1 记忆提取时机

- **会话结束时**：自动提取关键内容
- **重要决策后**：显式存储决策
- **用户明确请求时**：使用 `memory_store` 工具

### 7.2 记忆召回策略

- **Agent 启动时**：使用自动召回
- **用户主动查询**：使用手动召回
- **任务相关查询**：使用向量搜索

### 7.3 评分调整

- **高价值记忆**：显式设置高 importance (≥ 0.8)
- **共享记忆**：使用作用域提升
- **低价值记忆**：依赖遗忘机制自动处理

### 7.4 性能优化

- **批量提取**：一次性提取多条记忆
- **限制召回**：合理设置 limit 参数
- **缓存结果**：使用 IN_MEMORY_STORE 加速访问
