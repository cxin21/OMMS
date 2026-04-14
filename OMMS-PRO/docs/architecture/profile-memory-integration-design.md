# Profile-Memory Integration Design v2.0

## 1. Module Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Agent / API Layer                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Memory Capture Service                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                          │
│  │ LLM Extractor│  │Version Manager│  │ Store Manager │                         │
│  └──────────────┘  └──────────────┘  └──────────────┘                          │
│           │                │                  │                                  │
│           └────────────────┴──────────────────┘                                  │
│                              │                                                   │
│                    Extract → Score → Version → Store                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Memory Service Layer                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                │
│  │StorageMemoryService│  │MemoryRecallManager│  │MemoryDegradationMgr│              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘                │
│           │                   │                    │                              │
│           ▼                   ▼                    ▼                              │
│  ┌──────────────────────────────────────────────────────────────────┐           │
│  │                    Profile Manager (NEW ROLE)                     │           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐│           │
│  │  │PersonaBuilder│  │PrefInferer │  │InteractionRec│  │  TagManager ││           │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘│           │
│  │                                                                   │           │
│  │  IDENTITY Memory ←──────────────→ ProfileManager                 │           │
│  │  PREFERENCE Memory ←────────────→ (双向同步)                       │           │
│  │  PERSONA Memory ←───────────────→                                  │           │
│  │                                                                   │           │
│  │  ProfileManager 从记忆服务读取 IDENTITY/PREFERENCE/PERSONA       │           │
│  │  ProfileManager 分析后写出新的 IDENTITY/PREFERENCE/PERSONA       │           │
│  └──────────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Dreaming Engine (Background)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │ MemoryMerger   │  │GraphReorganizer│  │StorageOptimizer│  │DreamScheduler│  │
│  │ - 合并相似记忆  │  │ - 重建关联      │  │ - 归档低价值    │  │ - 定时触发   │  │
│  │ - 排除PROFILE类│  │ - 补充缺失关联  │  │ - 碎片整理      │  │             │  │
│  └────────────────┘  └────────────────┘  └────────────────┘  └─────────────┘  │
│           │                  │                  │                               │
│           └──────────────────┴──────────────────┘                               │
│                              │                                                   │
│                    整理类型: Consolidation/Reorganization/Archival              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Storage Layer (基础设施)                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │PalaceStore │  │VectorStore │  │MetaStore   │  │GraphStore  │              │
│  │(内容存储)   │  │(向量索引)   │  │(SQLite)    │  │(图谱)      │              │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Core Memory Types (Extended)

```typescript
enum MemoryType {
  // 原有 6 种
  FACT = 'fact',
  EVENT = 'event',
  DECISION = 'decision',
  ERROR = 'error',
  LEARNING = 'learning',
  RELATION = 'relation',

  // v2.0.0 新增 Profile 相关类型
  IDENTITY = 'identity',     // 身份信息：姓名、职业、位置等
  PREFERENCE = 'preference', // 偏好设置：响应长度、活跃时间、内容偏好等
  PERSONA = 'persona',      // 人格特征：性格、价值观、兴趣等
}
```

## 3. Profile-Memory 双向同步机制

```
┌─────────────────┐                      ┌─────────────────┐
│ ProfileManager  │◄────── 读取 ─────────│ MemoryService   │
│                 │                      │                 │
│ - personaBuilder│      IDENTITY        │ - StorageMemory │
│ - preferenceInf │◄──── PREFERENCE ────│ - RecallManager │
│ - tagManager    │◄──── PERSONA ───────│                 │
│                 │                      │                 │
│                 │────── 写入 ─────────►│                 │
└─────────────────┘    新分析结果         └─────────────────┘
```

### 同步规则

| ProfileManager 模块 | MemoryType | 同步方向 | 触发条件 |
|-------------------|------------|---------|---------|
| PersonaBuilder | PERSONA | Memory → Profile | 读取已有 persona |
| PreferenceInferer | PREFERENCE | Memory → Profile | 需要生成偏好 |
| TagManager | 无直接映射 | Memory → Profile | 标签变化时 |
| - | IDENTITY | Profile → Memory | 用户设置身份 |
| - | PREFERENCE | Profile → Memory | 显式偏好设置 |
| - | PERSONA | Profile → Memory | persona 更新 |

## 4. 3-Round Dialogue Example (完整流程)

### Round 1: 用户建立身份

**对话:**
```
用户: "我叫李明，是一名软件工程师，住在北京。"
```

**模块交互流程:**

```
1. MemoryCaptureService.capture()
   ├── LLM 提取:
   │   - content: "用户姓名是李明"
   │   - type: IDENTITY (通过 typeHint 或默认分类)
   │   - confidence: 0.95
   │   └── keywords: ["李明", "软件工程师", "北京"]
   │
   ├── LLMScorer.generateScores():
   │   ├── importance: 9.5 (身份信息，高重要性)
   │   ├── scope: 8.0 (全局有效)
   │   └── reasoning: "身份信息是核心记忆"
   │
   └── MemoryStoreManager.store():
       ├── palaceLocation: CORE (importance >= 8 → CORE block)
       ├── scope: GLOBAL
       └── 存储完成 → memoryId: "mem_001"

2. DreamingEngine (异步，不阻塞)
   ├── MemoryMerger.findSimilarGroups()
   │   └── 排除 IDENTITY 类型 (不参与合并)
   │
   └── GraphReorganizer.supplementRelations()
       └── 排除 IDENTITY 类型 (不重建关联)

3. ProfileManager (同步更新)
   └── buildPersonaFromConversation()
       ├── 读取 MemoryService 中 IDENTITY 类型记忆
       │   └── Query: { type: IDENTITY, agentId: currentAgent }
       │
       └── 构建 persona:
           ├── name: "李明"
           ├── occupation: "软件工程师"
           └── location: "北京"

4. MemoryService 状态:
   ┌─────────────────────────────────────────────────────────────┐
   │ Memory mem_001                                              │
   │   type: IDENTITY                                            │
   │   content: "用户姓名是李明，是一名软件工程师，住在北京"         │
   │   importance: 9.5, scopeScore: 8.0                          │
   │   block: CORE                                               │
   │   scope: GLOBAL                                             │
   └─────────────────────────────────────────────────────────────┘
```

**存储结果:**

| Field | Value | Reason |
|-------|-------|--------|
| uid | mem_001 | 系统生成 |
| type | IDENTITY | 身份类型 |
| importance | 9.5 | LLM评分，身心核心 |
| scopeScore | 8.0 | 全局有效 |
| block | CORE | importance >= 8 |
| scope | GLOBAL | scopeScore >= 7 |
| palace | CORE/wing_main/hall_user/room_identity/closet_mem_001 | 自动分配 |

---

### Round 2: 用户表达偏好和学习

**对话:**
```
用户: "我喜欢简洁的回答，最好控制在100字以内。另外我最近在学习TypeScript，它很强大。"
```

**模块交互流程:**

```
1. MemoryCaptureService.capture()
   │
   ├── LLM 提取 (2条记忆):
   │
   ├── 记忆1 - PREFERENCE:
   │   ├── content: "用户偏好简洁回答，控制在100字以内"
   │   ├── type: PREFERENCE (通过 typeHint)
   │   ├── importance: 8.0
   │   ├── scope: GLOBAL
   │   └── keywords: ["简洁", "100字", "响应长度"]
   │
   └── 记忆2 - LEARNING:
       ├── content: "用户正在学习TypeScript，认为它很强大"
       ├── type: LEARNING
       ├── importance: 5.0
       ├── scope: AGENT
       └── keywords: ["TypeScript", "学习"]

2. Storage 完成
   ├── mem_002 (PREFERENCE): importance=8.0, block=CORE
   └── mem_003 (LEARNING): importance=5.0, block=SESSION

3. DreamingEngine (定时触发/下次空闲时):
   │
   ├── Consolidation (合并相似):
   │   ├── MemoryMerger.findSimilarGroups()
   │   │   ├── 候选: [mem_002, mem_003, ...]
   │   │   ├── 检查: mem_002.type === PREFERENCE → 排除
   │   │   └── 检查: mem_003.type === LEARNING → 参与合并
   │   │
   │   └── mergeGroup()
   │       └── 如果 mem_003 与其他 LEARNING 相似 → 合并
   │
   ├── Reorganization (图谱重构):
   │   ├── GraphReorganizer.supplementRelations()
   │   │   ├── 发现: mem_002 (PREFERENCE) 与 mem_003 (LEARNING) 相似度 0.72
   │   │   ├── 检查: 都是 PREFERENCE/LEARNING → 允许建立关联
   │   │   └── addRelation(mem_002, mem_003, 'related_preference', 0.72)
   │   │
   │   └── cleanupWeakEdges()
   │       └── 排除 IDENTITY/PREFERENCE/PERSONA 类型边的清理
   │
   └── Archival (归档检查):
       └── StorageOptimizer.findArchivalCandidates()
           └── 排除 IDENTITY/PREFERENCE/PERSONA 类型

4. ProfileManager (异步分析):
   │
   ├── PreferenceInferer.inferFromBehaviors()
   │   ├── 读取 mem_002 (PREFERENCE)
   │   └── 输出:
   │       └── preferences.interaction.responseLength = "short" (≤100字)
   │
   └── PersonaBuilder.buildFromConversation()
       ├── 读取 mem_003 (LEARNING)
       └── 更新 interests:
           └── [{ name: "TypeScript", strength: 0.8, source: "learning" }]

5. 最终 MemoryService 状态:
   ┌─────────────────────────────────────────────────────────────┐
   │ mem_002: PREFERENCE                                         │
   │   content: "用户偏好简洁回答，控制在100字以内"                 │
   │   importance: 8.0, block: CORE                             │
   └─────────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────────┐
   │ mem_003: LEARNING                                           │
   │   content: "用户正在学习TypeScript，认为它很强大"             │
   │   importance: 5.0, block: SESSION                           │
   │   relations: [ { uid: mem_002, weight: 0.72 } ]           │
   └─────────────────────────────────────────────────────────────┘
```

**Dreaming Engine 整理报告:**

```json
{
  "type": "reorganization",
  "status": "completed",
  "phases": {
    "scan": { "scannedCount": 50, "candidateCount": 10 },
    "analyze": { "analyzedCount": 10, "foundIssues": 3 },
    "execute": { "relationsRebuilt": 5 }
  },
  "relationsRebuilt": 5,
  "profileTypesProtected": ["IDENTITY", "PREFERENCE", "PERSONA"]
}
```

---

### Round 3: 用户查询，触发递进召回

**对话:**
```
用户: "我是谁？我有什么偏好？我在学习什么？"
```

**模块交互流程:**

```
1. API Layer: recall.ts
   │
   └── const result = await memoryRecallManager.recall({
         query: "我是谁？我有什么偏好？我在学习什么？",
         currentAgentId: "agent_001",
         currentSessionId: "session_001"
       })

2. MemoryRecallManager.recall() - 4步递进召回
   │
   ├── Step 1: SESSION 作用域
   │   └── Query: { scope: SESSION, agentId: agent_001 }
   │   └── 结果: [] (当前会话无相关记忆)
   │
   ├── Step 2: AGENT 作用域
   │   └── Query: { scope: AGENT, agentId: agent_001 }
   │   └── 结果: [mem_003] (LEARNING: TypeScript)
   │
   ├── Step 3: GLOBAL 作用域
   │   └── Query: { scope: GLOBAL }
   │   └── 结果: [mem_001, mem_002]
   │       ├── mem_001: IDENTITY (李明)
   │       └── mem_002: PREFERENCE (简洁回答)
   │
   └── Step 4: OTHER_AGENTS (如需)
       └── 结果: []

3. 召回结果 (RecallOutput):
   ┌────────────────────────────────────────────────────────────────────────┐
   │ memories: [                                                             │
   │   {                                                                    │
   │     uid: "mem_001",                                                    │
   │     type: "IDENTITY",                                                 │
   │     content: "用户姓名是李明，是一名软件工程师，住在北京",                │
   │     importance: 9.5,                                                   │
   │     scope: "GLOBAL"                                                   │
   │   },                                                                   │
   │   {                                                                    │
   │     uid: "mem_002",                                                    │
   │     type: "PREFERENCE",                                                │
   │     content: "用户偏好简洁回答，控制在100字以内",                        │
   │     importance: 8.0,                                                  │
   │     scope: "GLOBAL"                                                   │
   │   },                                                                   │
   │   {                                                                    │
   │     uid: "mem_003",                                                    │
   │     type: "LEARNING",                                                 │
   │     content: "用户正在学习TypeScript，认为它很强大",                      │
   │     importance: 5.0,                                                  │
   │     scope: "AGENT"                                                    │
   │   }                                                                    │
   │ ]                                                                      │
   └────────────────────────────────────────────────────────────────────────┘

4. ProfileManager.getL0L1Context()
   │
   ├── L0 (Identity):
   │   └── 读取 IDENTITY 记忆:
   │       └── 李明，软件工程师，北京
   │
   └── L1 (Critical Facts):
       ├── 读取 PREFERENCE 记忆:
       │   └── 简洁回答，100字以内
       │
       └── 读取 LEARNING 记忆:
           └── TypeScript

5. MemoryDegradationManager (遗忘检查) - 并行执行
   │
   └── checkDegradation()
       ├── mem_001 (IDENTITY, importance=9.5):
       │   └── 保护: IDENTITY 类型禁止降级
       │
       ├── mem_002 (PREFERENCE, importance=8.0):
       │   └── 保护: PREFERENCE 类型 importance >= 7 禁止降级
       │
       └── mem_003 (LEARNING, importance=5.0):
           └── 检查: recallCount=1, daysSinceAccess=1 → 暂不降级

6. 强化记忆 (异步)
   └── MemoryRecallManager.applyReinforcement()
       ├── mem_001: importance 9.5 → 9.7 (+0.2)
       ├── mem_002: importance 8.0 → 8.2 (+0.2)
       └── mem_003: importance 5.0 → 5.3 (+0.3, 低重要性强化幅度大)

7. API Response:
   {
     "memories": [mem_001, mem_002, mem_003],
     "profile": "你是李明，软件工程师，住在北京。你偏好简洁回答...",
     "context": {
       "L0": "李明，软件工程师，北京",
       "L1": "偏好简洁回答(≤100字)，正在学习TypeScript"
     }
   }
```

---

## 5. Code Changes Required

### 5.1 MemoryType Extension

**File:** `src/types/memory.ts`

```typescript
export enum MemoryType {
  // 原有 6 种
  FACT = 'fact',
  EVENT = 'event',
  DECISION = 'decision',
  ERROR = 'error',
  LEARNING = 'learning',
  RELATION = 'relation',

  // v2.0.0 新增
  IDENTITY = 'identity',      // 身份信息
  PREFERENCE = 'preference',  // 偏好设置
  PERSONA = 'persona',       // 人格特征
}
```

### 5.2 MemoryMerger - Profile Type Exclusion

**File:** `src/dreaming-engine/memory-merger.ts`

```typescript
// 在 findSimilarGroups() 中添加
const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

// 过滤候选记忆，排除 Profile 类型
const candidates = memoryIds.filter(id => {
  const memory = memoryMap.get(id);
  return memory && !PROFILE_TYPES.includes(memory.type);
});
```

### 5.3 GraphReorganizer - Profile Memory Protection

**File:** `src/dreaming-engine/graph-reorganizer.ts`

```typescript
// 在 supplementRelations() 中
const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

// 检查两端都不是 Profile 类型才建立关联
if (!PROFILE_TYPES.includes(memory1Type) && !PROFILE_TYPES.includes(memory2Type)) {
  await this.graphStore.addRelation(...);
}

// 在 cleanupWeakEdges() 中同样保护
```

### 5.4 StorageOptimizer - Archive Protection

**File:** `src/dreaming-engine/storage-optimizer.ts`

```typescript
// 在 findArchivalCandidates() 中
const PROTECTED_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

const candidates = memories.filter(m =>
  !PROTECTED_TYPES.includes(m.type) &&
  m.importanceScore < this.archivalConfig.importanceThreshold
);
```

### 5.5 ProfileManager - Memory Service Integration

**File:** `src/profile-manager/profile-manager.ts`

```typescript
// 新增依赖注入
constructor(
  private memoryService?: StorageMemoryService,  // 可选
  options?: ProfileManagerOptions
) {
  // ... existing code
}

// 读取 IDENTITY/PERSONA 记忆
async getPersonaFromMemory(userId: string): Promise<Persona | undefined> {
  if (!this.memoryService) return undefined;

  const memories = await this.memoryService.query({
    type: MemoryType.PERSONA,
    agentId: userId,
    limit: 10,
  });

  if (memories.length === 0) return undefined;

  // 从记忆内容构建 Persona
  return this.buildPersonaFromMemories(memories);
}

// 写入 PERSONA 记忆
async savePersonaToMemory(persona: Persona): Promise<void> {
  if (!this.memoryService) return;

  await this.memoryService.store({
    content: JSON.stringify(persona),
    type: MemoryType.PERSONA,
    metadata: {
      agentId: persona.userId,
      subject: persona.name,
    },
  }, {
    importance: 8.0,  // Persona 高重要性
    scopeScore: 8.0,  // 全局有效
  });
}
```

### 5.6 calculatePalaceLocation - Profile Type Handling

**File:** `src/memory-service/memory-store-manager.ts`

```typescript
// 根据新类型调整 Palace 位置
function calculatePalaceLocation(type: MemoryType, importance: number): PalaceLocation {
  // IDENTITY/PREFERENCE/PERSONA 强制使用 CORE
  if (type === MemoryType.IDENTITY || type === MemoryType.PREFERENCE || type === MemoryType.PERSONA) {
    return {
      wingId: 'wing_system',
      hallId: 'hall_profile',
      roomId: `room_${type.toLowerCase()}`,
      closetId: `closet_${generateUid()}`,
    };
  }

  // 其他类型按原有规则
  // ...
}
```

---

## 6. Module Dependency Summary

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│MemoryCaptureSvc │────►│ StorageMemorySvc │◄────│ ProfileManager  │
│  (提取/评分)    │     │   (存储/读取)    │     │ (双向同步)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │               ┌─────────────────┐              │
        │               │ MemoryRecallMgr│              │
        │               │ (递进召回)      │              │
        │               └─────────────────┘              │
        │                       │                       │
        ▼                       ▼                       │
┌─────────────────┐     ┌─────────────────┐              │
│ DreamingEngine  │     │ MemoryDegradation│◄────────────┘
│ (整理服务)       │────►│ Manager          │
│ - Merger        │     │ (遗忘检查)        │
│ - Reorganizer   │     └─────────────────┘
│ - Optimizer     │
└─────────────────┘
```

---

## 7. Key Design Decisions

1. **Profile Type 强制 CORE 区块**: IDENTITY/PREFERENCE/PERSONA 类型记忆 importance >= 7，强制存储在 CORE 区块，防止被归档删除

2. **Profile 类型排除合并/重构**: 这些类型的记忆具有高度个性化，不适合合并；关联应该由 ProfileManager 显式管理

3. **ProfileManager 可选 MemoryService**: 保持向后兼容，不强制依赖

4. **L0/L1 Context 由 ProfileManager 统一封装**: 调用方不需要知道具体从哪类记忆获取，ProfileManager 负责聚合

5. **遗忘保护优先级**: IDENTITY > PREFERENCE > PERSONA > 其他类型
