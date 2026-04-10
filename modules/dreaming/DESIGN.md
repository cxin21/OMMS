# Dreaming Module Design

## 1. 模块概述

Dreaming 是一个实验性的智能记忆巩固系统，模拟人类睡眠时的记忆整合过程。

### 1.1 三阶段记忆巩固

- **Light 阶段**：整理短期记忆
- **Deep 阶段**：评估并提升记忆
- **REM 阶段**：提取主题和反思

## 2. 触发机制

### 2.1 定时调度

```typescript
schedule: {
  enabled: true,
  time: "02:00",        // 每天凌晨2点
  timezone: "Asia/Shanghai"
}
```

### 2.2 记忆阈值

```typescript
memoryThreshold: {
  enabled: true,
  minMemories: 50,      // 至少50条记忆
  maxAgeHours: 24       // 最老记忆不超过24小时
}
```

### 2.3 会话触发

```typescript
sessionTrigger: {
  enabled: true,
  afterSessions: 10     // 10个会话后触发
}
```

## 3. 提升信号

| 信号 | 权重 | 说明 |
|------|------|------|
| recallFrequency | 0.25 | 召回频率 |
| relevance | 0.20 | 检索相关性 |
| diversity | 0.15 | 查询多样性 |
| recency | 0.15 | 时间新近度 |
| consolidation | 0.15 | 跨天整合 |
| conceptualRichness | 0.10 | 概念丰富度 |

## 4. 使用方式

```typescript
import { getDreamingService } from '@omms/dreaming';

const dreaming = getDreamingService(config);

// 检查状态
const status = dreaming.getStatus();

// 手动启动
const result = await dreaming.start();

// 停止
dreaming.stop();
```

## 5. 输出格式

```typescript
interface DreamingResult {
  success: boolean;
  phase: 'LIGHT' | 'DEEP' | 'REM' | 'COMPLETE' | 'SKIPPED';
  startTime: string;
  endTime: string;
  duration: number;
  data: {
    light?: { sortedMem, candidates };
    deep?: { promoted, skipped };
    rem?: { themes, reflections };
  };
  logs: DreamingLog[];
  error?: string;
}
```
