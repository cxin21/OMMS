# OMMS 使用指南

**版本**: 1.3.0
**日期**: 2026-04-08

---

## 一、工作原理

### 1.1 整体流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户对话   │ ──► │   Agent     │ ──► │   记忆存储   │
│             │     │   处理      │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  自动提取   │     │   向量存储   │
                    │  关键内容   │     │   (Embedding)│
                    └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   重要性   │
                    │   评分      │
                    └─────────────┘
```

### 1.2 自动记忆流程

```
用户说："我用TypeScript开发React项目，喜欢用VSCode"
    │
    ▼
┌─────────────────────────────────────────────┐
│            agent_end Hook 触发                │
├─────────────────────────────────────────────┤
│  1. extractFromMessages()                    │
│     - 正则匹配提取关键内容                    │
│     - "用TypeScript开发React项目" → fact    │
│     - "喜欢用VSCode" → preference           │
│                                              │
│  2. scorer.score()                          │
│     - 计算重要性分数                         │
│     - fact: 0.6, preference: 0.7           │
│                                              │
│  3. memoryService.store()                   │
│     - 保存到内存                            │
│     - 生成向量存入向量库                    │
│     - 记录日志                             │
└─────────────────────────────────────────────┘
```

### 1.3 记忆检索流程

```
用户问："我用什么技术栈？"
    │
    ▼
┌─────────────────────────────────────────────┐
│            omms_recall 工具调用              │
├─────────────────────────────────────────────┤
│  1. embedding.embedOne(query)              │
│     - 调用远程 API 生成向量                 │
│                                              │
│  2. vectorStore.search()                   │
│     - 余弦相似度搜索                       │
│     - 关键词匹配                           │
│     - RRF 融合排序                         │
│                                              │
│  3. profileEngine.build()                 │
│     - 构建用户画像                         │
│                                              │
│  4. 返回结果                              │
│     - Profile + 相关记忆                    │
└─────────────────────────────────────────────┘
```

---

## 二、快速开始

### 2.1 配置

在 `~/.openclaw/openclaw.json` 中添加：

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableAutoCapture": true,
          "enableVectorSearch": true,
          "embedding": {
            "model": "BAAI/bge-m3",
            "dimensions": 1024,
            "baseURL": "https://api.siliconflow.cn/v1",
            "apiKey": "${SILICONFLOW_API_KEY}"
          }
        }
      }
    }
  },
  "tools": {
    "allow": ["omms_recall", "omms_write", "omms_stats", "omms_logs"]
  }
}
```

### 2.2 使用方式

OMMS 有两种使用方式：

| 方式 | 说明 | 触发 |
|------|------|------|
| **自动** | Agent 自动提取记忆 | `agent_end` hook |
| **手动** | 用户显式调用工具 | `omms_write` 等工具 |

---

## 三、分级召回机制

### 3.1 召回优先级

记忆按以下优先级排序：

| 优先级 | 作用域 | 说明 |
|--------|--------|------|
| 1 | 当前会话 | 当前对话中的记忆，权重最高 |
| 2 | 当前Agent | 当前Agent的记忆 |
| 3 | 全局 | 跨Agent共享的记忆 |
| 4 | 其他会话 | 历史会话中的记忆 |
| 5 | 其他Agent | 其他Agent的记忆 |

**综合评分公式**：
```
最终分数 = 相似度 × 作用域权重 + 重要性 × 0.3
```

### 3.2 记忆强化机制

被召回并有效使用时会自动强化评分：

| 当前评分 | 强化增量 |
|---------|---------|
| < 0.3 | +0.1 |
| 0.3 - 0.5 | +0.08 |
| 0.5 - 0.8 | +0.05 |
| >= 0.8 | 不再提升 |

**效果**：多次被召回的记忆会逐渐升级作用域

---

## 四、工具使用

### 4.1 omms_recall - 搜索记忆

**触发场景**：
- 用户问"之前..."
- 用户问"我记得..."
- 用户问"我用什么..."

**参数**：
```
query: 搜索内容 (必填)
limit: 返回数量 (可选，默认5)
```

**示例**：
```
用户：我想起之前我用过什么IDE？

Agent 调用：
omms_recall({ query: "IDE 开发工具" })

返回：
## Profile
Preferences: 用户喜欢用VSCode

## Relevant Memories
1. [preference] 用户喜欢用VSCode
2. [fact] 用户用TypeScript开发React项目
```

---

### 3.2 omms_write - 保存记忆

**触发场景**：
- 用户说"记住..."
- 用户说"note that..."
- 用户说"别忘了..."
- 用户做出重要决定

**参数**：
```
content: 要记住的内容 (必填)
type: 记忆类型 (可选)
        - fact (默认)
        - preference
        - decision
        - error
        - learning
importance: 重要性 0-1 (可选，默认0.5)
```

**示例**：
```
用户：记住，我偏好用pnpm作为包管理器

Agent 调用：
omms_write({
  content: "用户偏好用pnpm作为包管理器",
  type: "preference",
  importance: 0.7
})

返回：Saved: mem_123456_abc123
```

---

### 3.3 omms_stats - 查看统计

**触发场景**：
- 查看记忆数量
- 排查问题

**参数**：无

**示例**：
```
Agent 调用：
omms_stats({})

返回：
Total: 42, Long-term: 35, Session: 7
```

---

### 3.4 omms_logs - 查看日志

**触发场景**：
- 排查问题
- 调试

**参数**：
```
level: debug/info/warn/error (可选)
limit: 返回条数 (可选，默认50)
```

**示例**：
```
Agent 调用：
omms_logs({ level: "warn", limit: 20 })

返回：
## OMMS Logs (15 entries)
Total logs: 150
By level: debug=100, info=45, warn=5, error=0

2026-04-08T10:30:00 [WARN] Embedding API error { status: 401 }
```

---

## 四、自动行为

### 4.1 自动提取

`enableAutoCapture: true` 时，每次对话结束会自动提取：

| 类型 | 关键词示例 | 重要性基础分 |
|------|-----------|-------------|
| `decision` | "决定"、"选了这个"、"最终方案" | 0.45 |
| `error` | "失败"、"错误"、"bug"、"问题" | 0.40 |
| `preference` | "喜欢"、"偏好"、"一般用" | 0.35 |
| `fact` | "项目"、"系统"、"工具"、"使用" | 0.30 |
| `learning` | "学会了"、"理解了"、"发现" | 0.30 |

### 4.2 重要性评分

```
最终分数 = 基础分 + 调整项

调整项：
- 显式请求（用户说"记住"）：+0.25
- 相关记忆越多：+0.02（上限0.10）
- 会话超过10轮：+0.05
- 包含"最终"/"确定"：+0.10（decision类型）
```

### 4.3 记忆强化机制

被召回时自动强化：

| 当前评分 | 强化增量 |
|---------|---------|
| < 0.3 | +0.05 |
| 0.3 - 0.5 | +0.08 |
| 0.5 - 0.8 | +0.10 |

**效果**：
- 低分记忆被多次召回后会逐渐提升
- 评分提升后可能触发升级：`session` → `long-term` → `core`
- 长期有用的记忆自动成为核心记忆

### 4.4 遗忘策略

| 条件 | 自动操作 |
|------|---------|
| importance < 0.2 且 30天未访问 | 归档 |
| importance < 0.1 且 180天无更新 | 删除 |
| importance > 0.5 | 升级为长期记忆 |
| importance > 0.7 | 成为核心记忆 |

---

## 五、配置选项

### 5.1 核心选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `enableAutoCapture` | true | 自动从对话提取记忆 |
| `enableAutoRecall` | true | 自动注入相关记忆 |
| `enableVectorSearch` | true | 启用向量搜索 |
| `enableProfile` | true | 构建用户画像 |

### 5.2 高级选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `maxMemoriesPerSession` | 50 | 每会话最大提取数 |
| `embedding.model` | BAAI/bge-m3 | Embedding 模型 |
| `search.vectorWeight` | 0.7 | 向量搜索权重 |
| `search.keywordWeight` | 0.3 | 关键词搜索权重 |
| `logging.level` | info | 日志级别 |

---

## 六、最佳实践

### 6.1 何时使用自动模式

✅ **适合**：
- 日常对话
- 开发讨论
- 技术决策

❌ **不适合**：
- 敏感信息（密码、密钥）
- 测试/临时内容
- 无关闲聊

### 6.2 何时手动保存

✅ **手动保存**：
- 重要决定
- 用户明确要求记住
- 长期偏好
- 错误经验

### 6.3 提问技巧

| ❌ 低效提问 | ✅ 高效提问 |
|-----------|------------|
| "我之前用什么IDE？" | "我的开发工具偏好是什么？" |
| "记住我用VSCode" | "记住我偏好VSCode作为主要IDE" |
| "我之前说过什么？" | "关于数据库的决策有哪些？" |

---

## 七、调试

### 7.1 查看日志

```bash
# 终端查看
tail -f ~/.openclaw/logs/omms.log | grep OMMS

# 或在 Agent 中使用
omms_logs({ level: "debug" })
```

### 7.2 常见问题

| 问题 | 解决 |
|------|------|
| 记忆没有提取 | 检查 `enableAutoCapture` 是否为 true |
| 搜索不准确 | 调整 `search.vectorWeight` 增加向量权重 |
| API 报错 | 检查 `embedding.apiKey` 配置 |
| 配置无效 | 确认 `openclaw gateway restart` |

---

## 八、示例对话

### 8.1 日常开发

```
用户：我要开发一个新的React项目
Agent：好的，我来创建React项目...

用户：记住，我用TypeScript，不用JavaScript
Agent：已记住，你偏好TypeScript。

用户：用什么数据库好？
Agent：基于你之前的技术栈，我建议PostgreSQL...

用户：我之前用什么数据库？
Agent：让我查一下...
omms_recall({ query: "数据库" })
找到：用户偏好用pnpm作为包管理器
```

### 8.2 决策追踪

```
用户：我们决定用PostgreSQL数据库
Agent：好的，已记录这个决策。

用户：我们之前做过哪些决策？
Agent：让我查一下...
omms_recall({ query: "决策" })
1. [decision] 决定用PostgreSQL数据库
2. [decision] 决定使用TypeScript
3. [decision] 选择React作为前端框架
```
