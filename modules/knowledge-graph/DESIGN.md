# Knowledge Graph Module Design

## 1. 模块概述

知识图谱引擎通过实体识别和关系抽取来追踪记忆之间的关联。

### 1.1 主要功能

- **实体提取**：从记忆内容中提取实体
- **关系抽取**：识别实体间的关系
- **图查询**：搜索相关实体和路径
- **子图提取**：获取某个实体周围的关联子图

## 2. 关系类型

| 关系类型 | 说明 |
|---------|------|
| `uses` | X 使用 Y |
| `depends_on` | X 依赖 Y |
| `part_of` | X 是 Y 的一部分 |
| `causes` | X 导致 Y |
| `precedes` | X 在 Y 之前 |
| `resolves` | X 解决 Y |

## 3. 数据结构

### 3.1 GraphNode

```typescript
interface GraphNode {
  id: string;
  name: string;
  type: "entity" | "concept";
  aliases: string[];
  mentionCount: number;
  metadata: Record<string, unknown>;
}
```

### 3.2 GraphEdge

```typescript
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  weight: number;
  evidence: string[];
  createdAt: string;
}
```

## 4. 使用方式

```typescript
import { getGraphEngine } from '@omms/knowledge-graph';

const graphEngine = getGraphEngine();
await graphEngine.initialize();

// 处理记忆
await graphEngine.process(memory);

// 搜索相关实体
const result = await graphEngine.search("React");
console.log(result.nodes);
console.log(result.paths);

// 获取子图
const subgraph = graphEngine.getSubgraph("entity-123", 2);
```

## 5. 图上下文格式

当知识图谱查询到相关实体时，生成以下上下文：

```
[Knowledge Graph Context]
Entities: 实体1, 实体2, 实体3

Relations:
实体1 --[uses]--> 实体2
实体2 --[depends_on]--> 实体3
```

## 6. 持久化

图数据存储在 `~/.openclaw/omms-graph.json`
