# OMMS-PRO 修复与测试实施计划

**版本**: v1.0  
**创建时间**: 2026-04-13  
**目标**: 基于 OMMS-Architecture.md 修复所有发现的问题，确保架构完整性

---

## 一、修复原则

### 1.1 核心原则
1. **严格遵循 OMMS-Architecture.md** - 所有修复必须符合架构文档定义
2. **保持五层存储架构** - Cache → Vector → SQLite → Palace → Graph
3. **UID 不变性** - 记忆 UID 终身不变，版本链追踪变更
4. **Palace 层级化** - wing/hall/room/closet 结构不能破坏
5. **双重评分机制** - Importance Score + Scope Score

### 1.2 禁止事项
- ❌ 不能绕过 PalaceStore 直接操作文件
- ❌ 不能破坏版本链完整性
- ❌ 不能跳过任何存储层
- ❌ 不能修改 UID 生成规则
- ❌ 不能破坏作用域升级/降级逻辑

---

## 二、问题清单与修复方案

### 2.1 记忆捕获流程

#### 问题描述
- 当前 `MemoryCaptureService` 使用 `CaptureInput` 不支持对话轮次
- LLM Extractor 未实现，无法进行真实测试
- 置信度阈值设置不合理

#### 架构要求（根据 OMMS-Architecture.md Section 5）
```
输入验证 → LLM 提取 → 评分生成 → 版本检测 → 存储写入 → 索引更新
```

#### 修复方案
**文件**: `src/memory-service/memory-capture-service.ts`

1. **增强 CaptureInput 支持对话轮次**
```typescript
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface EnhancedCaptureInput {
  agentId: string;
  sessionId?: string;
  turns: ConversationTurn[];  // 新增对话轮次支持
  config?: CaptureConfig;
}
```

2. **实现 MockLLMExtractor（用于测试）**
   - 基于关键词的提取逻辑
   - 自动评分（符合架构定义的双评分）
   - 支持所有 MemoryType

3. **调整置信度阈值**
   - 从 0.2 提升到 0.5
   - 可配置化

**优先级**: 🔴 高  
**预计工作量**: 2 小时

---

### 2.2 记忆召回流程

#### 问题描述
- `RecallOptions` 类型定义不完整
- 作用域升级逻辑未完全实现
- 遗忘机制需要手动触发

#### 架构要求（根据 OMMS-Architecture.md Section 6 & 7）
```
召回触发 → 递进式召回 (SESSION→AGENT→GLOBAL) → 作用域升级检测 → 强化
```

#### 修复方案
**文件**: `src/memory-service/memory-recall-manager.ts`

1. **完善 RecallOptions**
```typescript
export interface RecallOptions {
  query: string;
  wingId?: string;
  roomId?: string;
  hallId?: HallId;
  types?: MemoryType[];
  tags?: string[];
  limit?: number;
  minImportance?: number;
  minSimilarity?: number;
  timeRange?: { from: Timestamp; to: Timestamp; };
  // 新增字段
  agentId?: string;
  sessionId?: string;
  useVectorSearch?: boolean;
  includeVersionChain?: boolean;
}
```

2. **实现作用域升级逻辑（严格按架构）**
```typescript
// SESSION → AGENT
if (currentScope === MemoryScope.SESSION) {
  if (recallCount >= 3 && importance >= 5) {
    await this.upgradeScope(memory.uid, MemoryScope.AGENT);
    return true;
  }
}

// AGENT → GLOBAL
if (currentScope === MemoryScope.AGENT) {
  if (recallCount >= 5 && scopeScore >= 6 && usedByAgents >= 2) {
    await this.upgradeScope(memory.uid, MemoryScope.GLOBAL);
    return true;
  }
}
```

3. **实现自动化遗忘调度**
```typescript
startScheduler(checkIntervalMs: number = 3600000) {
  setInterval(async () => {
    await this.checkAndForget();
  }, checkIntervalMs);
}

async checkAndForget(): Promise<ForgetReport> {
  // 计算 forgetScore = effectiveImportance × 0.7 + effectiveScope × 0.3
  // < 3 → 归档，< 1 → 删除
}
```

**优先级**: 🔴 高  
**预计工作量**: 3 小时

---

### 2.3 版本管理

#### 问题描述
- 版本检测依赖于简单的相似度比较
- 版本链更新可能导致数据不一致

#### 架构要求（根据 OMMS-Architecture.md Section 4）
```
- UID 不变性：记忆 UID 终身不变
- 版本链：versionChain 追踪所有版本
- palaceRef: palace_{uid}_v{version}
- versionGroupId: 关联所有版本
```

#### 修复方案
**文件**: `src/memory-service/memory-version-manager.ts`

1. **实现语义相似度检测**
```typescript
async detectVersion(
  content: string,
  options: { agentId: string; type: MemoryType }
): Promise<{
  isNewVersion: boolean;
  existingMemoryId: string | null;
  similarity: number;
}> {
  // 使用向量相似度
  const similarMemories = await this.vectorStore.search(content, {
    limit: 5,
    filters: { agentId, type },
  });
  
  // 计算语义相似度
  for (const result of similarMemories) {
    const semanticSimilarity = await this.calculateSemanticSimilarity(
      content,
      result.text
    );
    
    if (semanticSimilarity >= this.config.similarityThreshold) {
      return {
        isNewVersion: true,
        existingMemoryId: result.id,
        similarity: semanticSimilarity,
      };
    }
  }
  
  return { isNewVersion: false, existingMemoryId: null, similarity: 0 };
}
```

2. **版本链原子性更新（使用事务）**
```typescript
async createVersion(
  existingMemoryId: string,
  newContent: string,
  newSummary: string,
  scores: { importance: number; scopeScore: number }
): Promise<{ newMemoryId: string; oldMemoryId: string }> {
  const transaction = await this.metaStore.beginTransaction();
  
  try {
    // 1. 获取现有记忆
    const existing = await this.metaStore.getById(existingMemoryId);
    
    // 2. 创建新版本记忆（保持 UID 不变）
    const newMemory = await this.storeManager.store({...}, scores);
    
    // 3. 更新旧版本状态
    await this.metaStore.update(existingMemoryId, {
      isLatestVersion: false,
      metadata: { nextVersionId: newMemory.uid },
    });
    
    // 4. 更新版本链索引
    await this.updateVersionChainIndex(existingMemoryId, newMemory.uid);
    
    await transaction.commit();
    return { newMemoryId: newMemory.uid, oldMemoryId: existingMemoryId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

**优先级**: 🔴 高  
**预计工作量**: 3 小时

---

### 2.4 用户画像流程

#### 问题描述
- ProfileManager 依赖 MemoryService 但为可选
- Persona 构建需要至少 5 轮对话，但没有提示机制

#### 架构要求（根据 OMMS-Architecture.md）
```
ProfileManager 从记忆中提取：
- 基本信息 (Identity)
- 偏好 (Preference)
- 技能 (Skills)
- 性格特征 (Traits)
```

#### 修复方案
**文件**: `src/profile-manager/profile-manager.ts`

1. **强制 MemoryService 依赖**
```typescript
export interface ProfileManagerOptions {
  storagePath?: string;
  config?: Partial<ProfileManagerConfig>;
  memoryService: StorageMemoryService;  // 改为必需
}

constructor(options?: ProfileManagerOptions) {
  if (!options?.memoryService) {
    throw new Error('MemoryService is required for ProfileManager');
  }
  this.memoryService = options.memoryService;
}
```

2. **添加构建进度提示**
```typescript
async buildPersona(
  userId: string,
  conversations: ConversationTurn[]
): Promise<{
  persona: Persona;
  progress: number;
  minTurnsRequired: number;
  ready: boolean;
}> {
  const minTurns = this.config.minConversationTurns || 5;
  const turnCount = conversations.length;
  const progress = Math.min(turnCount / minTurns, 1);
  const ready = turnCount >= minTurns;
  
  if (!ready) {
    return {
      persona: this.createEmptyPersona(),
      progress,
      minTurnsRequired: minTurns,
      ready: false,
    };
  }
  
  const persona = await this.doBuildPersona(conversations);
  return { persona, progress: 1, minTurnsRequired: minTurns, ready: true };
}
```

**优先级**: 🟡 中  
**预计工作量**: 2 小时

---

### 2.5 Dreaming 引擎

#### 问题描述
- 记忆整理任务没有自动调度器
- 归档和清理策略配置不完整

#### 架构要求（根据 OMMS-Architecture.md）
```
DreamingEngine 职责：
1. 记忆合并 (Consolidation)
2. 图谱重构 (Reorganization)
3. 记忆归档 (Archival)
4. 碎片整理 (Defragmentation)
```

#### 修复方案
**文件**: `src/dreaming-engine/dreaming-manager.ts`

1. **实现自动调度器**
```typescript
export class DreamingManager {
  private schedulerTimer?: NodeJS.Timeout;
  
  startAutoScheduler(config: {
    consolidationInterval?: number;
    reorganizationInterval?: number;
    archivalInterval?: number;
  } = {}) {
    const defaultConfig = {
      consolidationInterval: 3600000,  // 1 小时
      reorganizationInterval: 7200000,  // 2 小时
      archivalInterval: 86400000,  // 24 小时
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    
    this.schedulerTimer = setInterval(async () => {
      await this.runAllTasks();
    }, finalConfig.consolidationInterval);
  }
  
  private async runAllTasks(): Promise<void> {
    await this.consolidateMemories();
    await this.reorganizeGraph();
    await this.archiveOldMemories();
    await this.defragmentStorage();
  }
}
```

2. **完善配置（符合架构）**
```typescript
export interface DreamingEngineConfig {
  consolidation: {
    enabled: boolean;
    similarityThreshold: number;  // 0.85
    maxGroupSize: number;  // 10
  };
  
  reorganization: {
    enabled: boolean;
    minRelations: number;  // 3
    autoLinkThreshold: number;  // 0.7
  };
  
  archival: {
    enabled: boolean;
    daysBeforeArchive: number;  // 30
    forgetScoreThreshold: number;  // 2.5
  };
  
  defragmentation: {
    enabled: boolean;
    fragmentationThreshold: number;  // 0.3
  };
  
  scheduling: {
    autoStart: boolean;
    intervals: {
      consolidation: number;
      reorganization: number;
      archival: number;
      defragmentation: number;
    };
  };
}
```

**优先级**: 🟡 中  
**预计工作量**: 2 小时

---

## 三、测试计划

### 3.1 测试场景设计

#### 场景 1: 10 轮对话模拟（第一轮）
**目标**: 测试基础捕获和召回功能

**对话内容**:
1. 用户基本信息（姓名、年龄、职业）→ IDENTITY (L4, A2)
2. 技术偏好（Python, TypeScript）→ PREFERENCE (L3, A1)
3. 居住地（北京）→ IDENTITY (L3, A2)
4. 阅读事件（《代码大全》）→ EVENT (L2, A0)
5. 价值观决策（代码质量重要）→ DECISION (L3, A2)
6. 错误记录（生产 DELETE）→ ERROR (L4, A2)
7. 合作关系（与李四）→ RELATION (L3, A1)
8. 项目事实（任务管理应用）→ FACT (L2, A1)
9. 计划事件（QCon 大会）→ EVENT (L3, A1)
10. 学习决策（学机器学习）→ DECISION (L3, A1)

**预期结果**:
- 捕获 15-20 条记忆
- 覆盖所有 MemoryType
- 覆盖 L2-L4 重要性等级
- 覆盖 A0-A2 作用域等级

#### 场景 2: 10 轮对话模拟（第二轮 - 版本更新）
**目标**: 测试版本管理和作用域升级

**对话内容**:
1. 职业变更（创业公司技术负责人）→ 版本更新
2. 地址变更（搬到海淀区）→ 版本更新
3. 偏好变更（更喜欢 Go）→ 版本更新
4. 健康事件（膝盖受伤）→ EVENT (L3)
5. 计划变更（不参加 QCon）→ 版本更新
6. 合作结束（项目上线）→ 版本更新
7. 闲聊（今天天气）→ 不捕获
8. 学习开始（吴恩达课程）→ EVENT (L3)
9. 策略调整（先学传统 ML）→ DECISION (L3)
10. 结束语 → 不捕获

**预期结果**:
- 捕获 8-10 条记忆
- 5-6 条版本更新
- 2-3 次作用域升级
- 版本链完整

#### 场景 3: 作用域升级测试
**目标**: 验证作用域升级逻辑

**测试步骤**:
1. 创建 SESSION 作用域记忆（importance=6, scopeScore=5）
2. 召回 3 次
3. 验证是否升级到 AGENT
4. 继续召回 5 次
5. 验证是否升级到 GLOBAL

**预期结果**:
- SESSION → AGENT: 召回≥3 次 且 importance≥5
- AGENT → GLOBAL: 召回≥5 次 且 scopeScore≥6 且 usedByAgents≥2

#### 场景 4: 遗忘机制测试
**目标**: 验证遗忘算法

**测试步骤**:
1. 创建低重要性记忆（importance=2, scopeScore=1）
2. 长时间未召回（模拟 30 天）
3. 执行遗忘检查
4. 验证是否被归档

**预期结果**:
- forgetScore < 1 → 删除
- forgetScore < 3 → 归档
- forgetScore >= 3 → 保留

#### 场景 5: 多版本复杂场景
**目标**: 测试版本链完整性

**测试步骤**:
1. 创建记忆 v1
2. 更新内容 → v2
3. 再次更新 → v3
4. 查询版本链
5. 验证所有版本可追溯

**预期结果**:
- versionChain 包含所有版本
- isLatestVersion 正确标记
- palaceRef 格式正确

### 3.2 测试脚本结构

```typescript
describe('OMMS-PRO Memory System', () => {
  let omms: OMMS;
  
  beforeAll(async () => {
    omms = new OMMS();
    await omms.initialize();
  });
  
  afterAll(async () => {
    await omms.shutdown();
  });
  
  describe('Memory Capture', () => {
    it('should capture identity information', async () => {
      // 测试身份信息捕获
    });
    
    it('should capture preferences', async () => {
      // 测试偏好捕获
    });
    
    // ... 更多测试
  });
  
  describe('Memory Recall', () => {
    it('should recall by query', async () => {
      // 测试查询召回
    });
    
    it('should upgrade scope correctly', async () => {
      // 测试作用域升级
    });
    
    // ... 更多测试
  });
  
  describe('Version Management', () => {
    it('should detect version update', async () => {
      // 测试版本检测
    });
    
    it('should maintain version chain', async () => {
      // 测试版本链
    });
    
    // ... 更多测试
  });
  
  describe('Forgetting Mechanism', () => {
    it('should archive low importance memories', async () => {
      // 测试归档
    });
    
    it('should delete very low importance memories', async () => {
      // 测试删除
    });
    
    // ... 更多测试
  });
});
```

---

## 四、实施时间表

### 第一阶段：核心修复（Day 1-2）
- ✅ 修复记忆捕获流程（2h）
- ✅ 修复记忆召回流程（3h）
- ✅ 修复版本管理（3h）
- ✅ 实现 MockLLMExtractor（2h）

**小计**: 10 小时

### 第二阶段：功能完善（Day 3）
- ✅ 修复用户画像流程（2h）
- ✅ 修复 Dreaming 引擎（2h）
- ✅ 添加自动化调度器（2h）
- ✅ 完善配置（1h）

**小计**: 7 小时

### 第三阶段：测试验证（Day 4）
- ✅ 创建测试套件（3h）
- ✅ 运行测试（2h）
- ✅ 修复测试发现的问题（2h）
- ✅ 文档更新（1h）

**小计**: 8 小时

**总计**: 25 小时

---

## 五、验收标准

### 5.1 功能验收
- ✅ 记忆捕获：支持对话轮次，准确率 > 80%
- ✅ 记忆召回：递进式召回正常工作
- ✅ 作用域升级：符合架构定义的阈值
- ✅ 版本管理：版本链完整，UID 不变
- ✅ 遗忘机制：自动执行，符合算法

### 5.2 性能验收
- ✅ 捕获延迟：< 500ms
- ✅ 召回延迟：< 1s
- ✅ 版本检测：< 200ms
- ✅ 内存占用：< 500MB

### 5.3 质量验收
- ✅ TypeScript 编译：0 错误
- ✅ 测试覆盖率：> 80%
- ✅ 代码审查：通过
- ✅ 架构一致性：100% 符合 OMMS-Architecture.md

---

## 六、风险管理

### 6.1 技术风险
- **风险**: LLM Extractor 模拟不准确
- **应对**: 使用 MockLLMExtractor 进行测试，后续替换为真实 LLM

- **风险**: 版本检测误判
- **应对**: 调整相似度阈值，添加人工确认机制

### 6.2 架构风险
- **风险**: 修复破坏五层存储架构
- **应对**: 严格遵循架构文档，代码审查重点检查

- **风险**: 作用域升级逻辑错误
- **应对**: 添加详细日志，便于调试

### 6.3 数据风险
- **风险**: 测试数据污染生产环境
- **应对**: 使用独立测试目录，测试后清理

---

## 七、交付物

1. ✅ 修复后的源代码
2. ✅ 完整的测试套件
3. ✅ 测试报告
4. ✅ 修复文档
5. ✅ 架构一致性检查清单

---

**批准**:  
- [ ] 技术负责人审核
- [ ] 架构师审核
- [ ] 项目经理审核

**开始日期**: 2026-04-13  
**预计完成日期**: 2026-04-16
