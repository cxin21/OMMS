# Profile Module Design

## 1. 模块概述

用户画像模块构建和维护用户/Agent 的画像信息。

### 1.1 主要功能

- **静态事实提取**：识别并存储重要的客观事实
- **偏好收集**：收集和管理用户偏好
- **决策追踪**：记录最近的决策
- **项目上下文**：维护项目相关信息

## 2. 数据结构

### 2.1 UserProfile

```typescript
interface UserProfile {
  id: string;
  agentId: string;
  staticFacts: Map<string, StaticFact>;
  preferences: Map<string, PreferenceValue>;
  recentDecisions: string[];
  projects: Map<string, ProjectContext>;
  updatedAt: string;
}
```

## 3. 使用方式

```typescript
import { profileEngine } from '@omms/profile';

// 构建画像
const profile = profileEngine.build(memories, agentId);

// 生成摘要
const summary = profileEngine.summarize(profile);
console.log(summary);
```

## 4. 摘要格式

```
Core Facts: 事实1; 事实2; 事实3
Preferences: 偏好1 (weight: 0.8), 偏好2 (weight: 0.6)
Recent Decisions: 决策1, 决策2, 决策3
Active Projects: 项目1, 项目2
```
