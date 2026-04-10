# Logging Module Design

## 1. 模块概述

日志模块提供结构化的日志记录、查询和分析功能。

### 1.1 主要功能

- **多级别日志**：debug/info/warn/error
- **结构化日志**：包含上下文信息
- **日志查询**：多条件过滤
- **日志统计**：按级别、方法统计
- **日志导出**：JSON/CSV 格式

## 2. 日志级别

| 级别 | 用途 |
|------|------|
| `debug` | 详细调试信息 |
| `info` | 一般信息 |
| `warn` | 警告信息 |
| `error` | 错误信息 |

## 3. 日志结构

```typescript
interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  method?: string;
  params?: Record<string, unknown>;
  returns?: unknown;
  agentId?: string;
  sessionId?: string;
  memoryId?: string;
  error?: string;
  data?: Record<string, unknown>;
}
```

## 4. 使用方式

```typescript
import { getLogger } from '@omms/logging';

const logger = getLogger();

// 记录日志
logger.info('Memory stored', {
  method: 'store',
  params: { id: 'mem-123' },
  agentId: 'agent-1'
});

logger.error('Failed to save', {
  method: 'save',
  error: 'Network error'
});

// 查询日志
const logs = logger.getLogs({
  level: 'error',
  method: 'store',
  limit: 50
});

// 获取统计
const stats = logger.getStats();
console.log(`总日志数: ${stats.total}`);
console.log(`错误数: ${stats.byLevel.error}`);

// 导出
const jsonLogs = logger.export('json');
```

## 5. 日志过滤

```typescript
interface LogFilter {
  level?: LogLevel;
  method?: string;
  agentId?: string;
  sessionId?: string;
  memoryId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
```
