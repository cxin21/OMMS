# OMMS 使用指南

**版本**: 3.6.0  
**日期**: 2026-04-12  
**状态**: 融合 MemPalace 架构优化

---

## 一、概述

OMMS (OpenClaw Memory Management System) 是一个智能记忆管理系统，为 AI Agent 提供长期记忆能力。在 3.6.0 版本中，我们吸收了 MemPalace 项目的核心优势，包括记忆宫殿结构、4 层记忆栈、原始内容存储、时间感知知识图谱等功能，同时保持了 OMMS 的原有架构优势和模块独立性。

### 1.1 功能特点

- **自动记忆**: 对话结束自动提取关键内容
- **智能召回**: 对话前自动注入相关记忆  
- **双评分系统**: 独立计算重要性评分和作用域评分
- **分级管理**: session → agent → global 三级作用域
- **遗忘机制**: 低价值记忆自动归档/删除
- **强化机制**: 被召回的记忆自动提升重要性
- **跨Agent追踪**: 追踪记忆被不同Agent的使用情况
- **持久化**: 重启后记忆不丢失
- **Web UI**: 可视化管理面板（React + ReactFlow 实现）
- **知识图谱**: 使用 ReactFlow 实现图可视化
- **统一配置**: 完整的配置管理系统，支持环境变量配置
- **测试覆盖**: 46个测试用例全部通过，测试覆盖率高

### 1.2 核心设计理念

**记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

### 1.3 架构融合策略

**MemPalace 优势 → OMMS 架构融合**

| MemPalace 优势 | OMMS 融合方案 |
|---------------|---------------|
| **记忆宫殿结构** | 与现有作用域系统对应：Wings（全局/agent）→ Rooms（主题）→ Closets（摘要）→ Drawers（原始内容）|
| **4层记忆栈** | 与现有检索系统集成：L0（身份）→ L1（关键事实）→ L2（房间召回）→ L3（深度搜索）|
| **原始内容存储** | 作为可选功能，与现有提取机制并行，支持完整内容存储与提取内容的关联 |
| **AAAK 压缩技术** | 作为独立压缩模块，与向量存储和检索系统集成 |
| **时间感知知识图谱** | 增强现有图谱引擎，支持 temporal queries 和关系时间有效性 |

---

## 二、工作原理

### 2.1 记忆生命周期

```
用户对话
    │
    ▼
agent_end Hook 触发
    │
    ▼
提取关键内容 (中文关键词 + LLM)
    │
    ▼
存储记忆 (store)
    │
    ▼
计算重要性评分 (Importance)
    │
    ▼
**新增：自动识别Wings和Rooms**
    │
    ▼
**新增：创建Drawer存储完整内容**
    │
    ▼
整理记忆 (consolidate)
    │
    ▼
agent_start Hook 触发
    │
    ▼
**新增：4层记忆栈加载**
    │
    ├─ L0: 身份信息
    ├─ L1: 关键事实
    ├─ L2: 房间召回
    └─ L3: 深度搜索
    │
    ▼
智能召回相关记忆 (recall)
    │
    ▼
注入到上下文中
    │
    ▼
用户继续对话
```

### 2.2 记忆存储流程

```typescript
// 记忆创建过程
async store(params) {
  // 1. 初始化记忆对象
  const memory = createMemoryObject(params);
  
  // 2. 计算重要性评分
  memory.importance = calculateImportance(params);
  
  // 3. 设置默认作用域
  memory.scope = 'session';
  
  // 4. 生成向量表示
  memory.vector = await generateEmbedding(memory.content);
  
  // 5. **新增：自动识别Wings和Rooms**
  if (this.config.palace.enabled) {
    const palace = getPalaceService();
    const { wing, room } = await palace.identifyWingRoom(memory.content);
    memory.wingId = wing?.id;
    memory.roomId = room?.id;
    
    // 创建Closet和Drawer
    const drawer = await palace.createDrawer({
      content: params.originalContent,
      memoryId: memory.id
    });
    memory.drawerId = drawer.id;
    
    if (memory.roomId) {
      const closet = await palace.createCloset({
        roomId: memory.roomId,
        memoryId: memory.id
      });
      memory.closetId = closet.id;
    }
  }
  
  // 6. 存储到LanceDB
  await persistence.save(memory);
  
  return memory;
}
```

### 2.3 记忆召回流程

```typescript
// 记忆召回过程
async recall(query, options) {
  // 1. **新增：4层记忆栈加载**
  if (this.config.memoryStack.enabled) {
    const stack = getMemoryStackService();
    const stackContext = await stack.loadStack(query, options.wingId, options.roomId);
    
    // 构建上下文
    const context = {
      l0: stackContext.l0,
      l1: stackContext.l1,
      l2: stackContext.l2,
      l3: stackContext.l3
    };
    
    // 优先从记忆栈中召回
    if (stackContext.l2.length > 0) {
      return stackContext.l2;
    }
  }
  
  // 2. 混合搜索
  const vectorResults = await vectorStore.search(query);
  const keywordResults = await keywordSearch(query);
  
  // 3. **新增：记忆宫殿过滤**
  let filteredResults = mergeResults(vectorResults, keywordResults);
  if (options.wingId || options.roomId) {
    filteredResults = await filterByPalace(filteredResults, options.wingId, options.roomId);
  }
  
  // 4. 合并结果
  const mergedResults = applyScoring(filteredResults);
  
  // 5. 过滤和排序
  const filteredResults = filterAndSort(mergedResults, options);
  
  return filteredResults;
}
```

---

## 三、使用场景

### 3.1 基础使用

#### 3.1.1 记忆存储

```typescript
// 使用记忆存储功能
const result = await memoryService.store({
  content: "用户偏好使用深色主题",
  type: "preference",
  agentId: "agent-123",
  subject: "用户偏好",
  // 新增：原始内容存储
  originalContent: "用户说：我更喜欢深色主题，这样眼睛会舒服一些"
});

console.log('记忆存储成功:', result.id);
```

#### 3.1.2 记忆召回

```typescript
// 使用记忆召回功能
const results = await memoryService.recall({
  query: "用户偏好",
  agentId: "agent-123",
  limit: 5,
  // 新增：记忆宫殿过滤
  wingId: "wing_driftwood",
  roomId: "room_user_preferences"
});

console.log('召回结果:', results);
```

### 3.2 高级使用

#### 3.2.1 手动控制Dreaming

```typescript
// 手动触发Dreaming过程
const dreamingResult = await dreamingService.start();
console.log('Dreaming结果:', dreamingResult);

// 检查Dreaming状态
const status = await dreamingService.getStatus();
console.log('Dreaming状态:', status);
```

#### 3.2.2 记忆管理

```typescript
// 提升记忆重要性
await memoryService.promote(memoryId);

// 删除记忆
await memoryService.delete(memoryId);

// 查看记忆统计
const stats = await memoryService.getStats();
console.log('记忆统计:', stats);
```

### 3.3 记忆宫殿管理

```typescript
// 创建Wing
const wing = await palaceService.createWing({
  name: "driftwood",
  type: "project",
  keywords: ["driftwood", "analytics", "saas"]
});

// 创建Room
const room = await palaceService.createRoom({
  name: "auth-migration",
  wingId: wing.id,
  hall: "events",
  tags: ["auth", "migration"]
});

// 添加记忆到Room
await palaceService.addToRoom(memoryId, room.id);

// 连接Rooms（创建隧道）
await palaceService.connectRooms(room1.id, room2.id);
```

### 3.4 知识图谱查询

```typescript
// 查询实体关系
const relationships = await knowledgeGraph.queryEntity("Kai");
console.log('Kai的关系:', relationships);

// 查询特定时间的关系
const historicalRelationships = await knowledgeGraph.queryEntity("Kai", "2026-01-01");
console.log('Kai在2026年1月的关系:', historicalRelationships);

// 添加新关系
await knowledgeGraph.addTriple("Kai", "works_on", "Orion", "2026-01-15");

// 失效关系
await knowledgeGraph.invalidate("Kai", "works_on", "Orion", "2026-03-01");
```

---

## 四、Web UI 使用

### 4.1 访问地址

```
http://127.0.0.1:3456
```

### 4.2 页面功能

#### 4.2.1 概览页面

- **统计卡片**: 显示记忆总数、类型分布、作用域分布
- **图表**: 记忆类型饼图、作用域分布图
- **最近活动**: 显示最近的记忆操作记录
- **系统状态**: Dreaming运行状态、API状态检查

#### 4.2.2 记忆列表

- **搜索功能**: 支持关键词和向量搜索
- **筛选功能**: 按类型、作用域、重要性评分、wing、room筛选
- **操作功能**: 提升重要性、删除记忆、查看详细信息
- **分页**: 支持分页显示，每页10条记录

#### 4.2.3 记忆宫殿页面

- **Wings导航**: 展示所有Wings，支持分类筛选（人物/项目）
- **Rooms导航**: 展示Wing下的Rooms，支持Hall类型筛选
- **Closets展示**: 显示Room下的Closets和相关记忆
- **Drawers访问**: 支持查看原始内容
- **Tunnels可视化**: 显示Room之间的连接

#### 4.2.4 知识图谱页面

- **实体关系图**: 使用ReactFlow可视化知识图谱
- **时间线查询**: 支持按时间查询实体关系
- **事实检查**: 对输入内容进行事实验证
- **属性面板**: 显示实体详细属性和关系信息

#### 4.2.5 活动日志

- **日志列表**: 显示所有系统日志
- **过滤**: 按级别、方法、AgentID、会话ID筛选
- **搜索**: 支持关键词搜索日志内容
- **统计**: 显示日志级别分布、操作类型统计

#### 4.2.6 设置页面

- **功能开关**: 启用/禁用自动捕获、自动召回、LLM提取、向量搜索等功能
- **配置管理**: LLM和Embedding模型配置
- **阈值设置**: 遗忘策略、强化策略、作用域升级策略配置
- **路径配置**: 数据存储位置、日志文件位置配置
- **记忆宫殿配置**: Wings/ Rooms识别、Closets创建策略
- **记忆栈配置**: L0/L1/L2/L3层级配置、压缩策略
- **知识图谱配置**: 实体识别、关系抽取策略

### 4.3 操作示例

#### 4.3.1 查看和管理记忆

1. 访问概览页面查看记忆统计
2. 点击"记忆列表"查看所有记忆
3. 使用搜索框查找特定记忆
4. 使用筛选器按类型或作用域筛选
5. 点击操作按钮提升重要性或删除记忆

#### 4.3.2 配置系统

1. 访问设置页面
2. 修改功能开关
3. 配置LLM和Embedding模型
4. 调整策略参数
5. 保存配置并重启插件

#### 4.3.3 记忆宫殿操作

1. 访问记忆宫殿页面
2. 点击Wing查看Rooms
3. 点击Room查看Closets和记忆
4. 支持创建、编辑、删除Wings/Rooms
5. 支持连接Rooms创建Tunnels

---

## 五、API 文档

### 5.1 基础API

#### 5.1.1 记忆存储

```http
POST /api/memories
Content-Type: application/json

{
  "content": "记忆内容",
  "type": "fact|preference|decision|error|learning|relationship",
  "agentId": "agent-123",
  "subject": "主题",
  "tags": ["标签1", "标签2"],
  "originalContent": "完整原始对话内容"
}
```

#### 5.1.2 记忆召回

```http
GET /api/memories?query=关键词&type=fact&scope=session&limit=10&wing=driftwood&room=auth-migration
```

#### 5.1.3 记忆删除

```http
DELETE /api/memories/:id
```

#### 5.1.4 记忆提升

```http
POST /api/memories/:id/promote
```

### 5.2 系统API

#### 5.2.1 获取统计

```http
GET /api/stats
```

#### 5.2.2 获取日志

```http
GET /api/logs?level=info&method=store&limit=100
```

#### 5.2.3 获取配置

```http
GET /api/config
```

#### 5.2.4 保存配置

```http
POST /api/config
Content-Type: application/json

{
  "llm": {
    "provider": "openai-compatible",
    "model": "abab6.5s-chat",
    "baseURL": "https://api.minimax.chat/v1",
    "apiKey": "your-api-key"
  },
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimensions": 1024,
    "baseURL": "https://api.siliconflow.cn/v1",
    "apiKey": "your-api-key"
  },
  "palace": {
    "enabled": true,
    "autoIdentifyWings": true,
    "autoIdentifyRooms": true
  },
  "memoryStack": {
    "enabled": true,
    "l0Path": "~/.openclaw/omms-l0.txt"
  }
}
```

### 5.3 记忆宫殿API

#### 5.3.1 获取Wings

```http
GET /api/wings?type=project&limit=10
```

#### 5.3.2 创建Wing

```http
POST /api/wings
Content-Type: application/json

{
  "name": "driftwood",
  "type": "project",
  "keywords": ["driftwood", "analytics", "saas"]
}
```

#### 5.3.3 获取Rooms

```http
GET /api/rooms?wingId=wing-driftwood&hall=events&limit=10
```

#### 5.3.4 创建Room

```http
POST /api/rooms
Content-Type: application/json

{
  "name": "auth-migration",
  "wingId": "wing-driftwood",
  "hall": "events",
  "tags": ["auth", "migration"]
}
```

#### 5.3.5 获取Closets

```http
GET /api/closets?roomId=room-auth-migration&limit=10
```

#### 5.3.6 获取Drawers

```http
GET /api/drawers?closetId=closet-123&limit=10
```

### 5.4 知识图谱API

#### 5.4.1 查询实体

```http
GET /api/kg/entity?subject=Kai&asOf=2026-01-01
```

#### 5.4.2 添加关系

```http
POST /api/kg/relations
Content-Type: application/json

{
  "subject": "Kai",
  "predicate": "works_on",
  "object": "Orion",
  "validFrom": "2026-01-15",
  "validTo": "2026-03-01"
}
```

#### 5.4.3 查询关系

```http
GET /api/kg/relations?subject=Kai&predicate=works_on&asOf=2026-02-01
```

#### 5.4.4 失效关系

```http
DELETE /api/kg/relations
Content-Type: application/json

{
  "subject": "Kai",
  "predicate": "works_on",
  "object": "Orion",
  "validTo": "2026-03-01"
}
```

#### 5.4.5 事实检查

```http
POST /api/kg/check
Content-Type: application/json

{
  "input": "Kai在Orion项目工作"
}
```

---

## 六、配置管理

### 6.1 配置优先级

1. **环境变量配置** (最高优先级)
2. **配置文件配置**
3. **默认配置** (最低优先级)

### 6.2 环境变量列表

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OMMS_WEB_UI_PORT` | Web UI端口 | 3456 |
| `OMMS_CONFIG_DIR` | 配置文件目录 | `~/.openclaw` |
| `OMMS_DATA_DIR` | 数据存储目录 | `omms-data` |
| `OMMS_LOGS_DIR` | 日志存储目录 | `omms-logs` |
| `OMMS_LLM_MODEL` | LLM模型 | `abab6.5s-chat` |
| `OMMS_LLM_BASE_URL` | LLM API地址 | `https://api.minimax.chat/v1` |
| `OMMS_LLM_API_KEY` | LLM API Key | 空 |
| `OMMS_EMBEDDING_MODEL` | Embedding模型 | `BAAI/bge-m3` |
| `OMMS_EMBEDDING_DIMENSIONS` | Emb