# OMMS 安装配置文档

**版本**: 1.3.0
**日期**: 2026-04-08

---

## 一、快速开始

### 1.1 环境要求

- Node.js >= 22.0.0
- npm 或 pnpm
- OpenClaw >= 2026.3.24
- Embedding API (可选，用于向量搜索)

### 1.2 安装步骤

```bash
# 1. 进入插件目录
cd /home/hechen/OMMS/omms-plugin

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 在 OpenClaw 中安装
openclaw plugins install /home/hechen/OMMS/omms-plugin

# 5. 启用插件
openclaw plugins enable omms

# 6. 重启 OpenClaw
openclaw gateway restart
```

---

## 二、配置文件

### 2.1 完整配置示例

编辑 `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableAutoCapture": true,
          "enableAutoRecall": true,
          "enableLLMExtraction": true,
          "enableProfile": true,
          "enableVectorSearch": true,
          "maxMemoriesPerSession": 50,
          "llm": {
            "provider": "openai-compatible",
            "model": "abab6.5s-chat",
            "baseURL": "https://api.minimax.chat/v1",
            "apiKey": "${MINIMAX_API_KEY}"
          },
          "embedding": {
            "model": "BAAI/bge-m3",
            "dimensions": 1024,
            "baseURL": "https://api.siliconflow.cn/v1",
            "apiKey": "${SILICONFLOW_API_KEY}"
          },
          "search": {
            "vectorWeight": 0.7,
            "keywordWeight": 0.3,
            "limit": 10
          },
          "logging": {
            "level": "info",
            "output": "console"
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

### 2.2 配置说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableAutoCapture` | boolean | true | 自动从对话提取记忆 |
| `enableAutoRecall` | boolean | true | 自动注入相关记忆 |
| `enableLLMExtraction` | boolean | true | 使用正则提取 |
| `enableProfile` | boolean | true | 构建用户画像 |
| `enableVectorSearch` | boolean | true | 启用向量搜索 |
| `maxMemoriesPerSession` | number | 50 | 每会话最大记忆数 |
| `embedding.model` | string | - | Embedding 模型名称 |
| `embedding.dimensions` | number | 1024 | 向量维度 |
| `embedding.baseURL` | string | - | API 地址 |
| `embedding.apiKey` | string | - | API Key |
| `search.vectorWeight` | number | 0.7 | 向量搜索权重 |
| `search.keywordWeight` | number | 0.3 | 关键词搜索权重 |
| `logging.level` | string | "info" | 日志级别 (debug/info/warn/error) |
| `logging.output` | string | "console" | 日志输出 (console/file/both) |
| `logging.filePath` | string | - | 日志文件路径 |

---

## 三、日志配置

### 3.1 日志级别

```json
{
  "logging": {
    "level": "info"
  }
}
```

| 级别 | 说明 |
|------|------|
| `debug` | 详细日志（包含所有操作） |
| `info` | 一般信息（默认，推荐生产环境） |
| `warn` | 仅警告和错误 |
| `error` | 仅错误 |

### 3.2 日志输出

```json
{
  "logging": {
    "level": "info",
    "output": "both",
    "filePath": "~/.openclaw/logs/omms.log"
  }
}
```

| 输出 | 说明 |
|------|------|
| `console` | 仅控制台输出（默认） |
| `file` | 仅文件输出 |
| `both` | 同时输出到控制台和文件 |

### 3.3 日志示例

```
2026-04-08T10:30:45.123Z [INFO] [OMMS] Initializing OMMS plugin
2026-04-08T10:30:45.234Z [INFO] [OMMS] Embedding service initialized { model: "BAAI/bge-m3", dimensions: 1024 }
2026-04-08T10:30:45.456Z [INFO] [OMMS] Memory service configured
2026-04-08T10:31:00.000Z [DEBUG] [OMMS] Searching memories { query: "用户偏好", limit: 10 }
2026-04-08T10:31:00.500Z [INFO] [OMMS] Recall complete { query: "用户偏好", memoriesFound: 3, hasProfile: true }
2026-04-08T10:31:30.000Z [INFO] [OMMS] Memory stored { id: "mem_1712567890_abc123", scope: "long-term" }
```

### 3.4 使用 omms_logs 工具查看日志

Agent 可以使用 `omms_logs` 工具查看系统日志：

```
参数:
  - level: 日志级别筛选 (debug/info/warn/error)
  - limit: 返回数量 (默认50)
```

---

## 四、Embedding API 配置

### 4.1 支持的平台

OMMS 支持任何 OpenAI-compatible 的 Embedding API。

| 平台 | baseURL | 推荐模型 | dimensions | 价格 |
|------|---------|----------|------------|------|
| **硅基流动** | `https://api.siliconflow.cn/v1` | `BAAI/bge-m3` | 1024 | 低廉 |
| **火山引擎** | `https://ark.cn-beijing.volces.com/api/v1` | `doubao-embedding-text-2412` | 1024 | 低廉 |
| **DeepSeek** | `https://api.deepseek.com/v1` | `text-embedding-v2` | 1536 | 低廉 |
| **OpenAI** | `https://api.openai.com/v1` | `text-embedding-3-small` | 1536 | 按量计费 |
| **Groq** | `https://api.groq.com/openai/v1` | `llmyer/bge-large-zh-v1.5` | 1024 | 免费额度 |

### 4.2 常用配置模板

#### 硅基流动 (推荐)

```json
{
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimensions": 1024,
    "baseURL": "https://api.siliconflow.cn/v1",
    "apiKey": "${SILICONFLOW_API_KEY}"
  }
}
```

获取 API Key: https://platform.siliconflow.cn

#### 火山引擎

```json
{
  "embedding": {
    "model": "doubao-embedding-text-2412",
    "dimensions": 1024,
    "baseURL": "https://ark.cn-beijing.volces.com/api/v1",
    "apiKey": "${VOLC_API_KEY}"
  }
}
```

获取 API Key: https://console.volcengine.com/ark

#### DeepSeek

```json
{
  "embedding": {
    "model": "text-embedding-v2",
    "dimensions": 1536,
    "baseURL": "https://api.deepseek.com/v1",
    "apiKey": "${DEEPSEEK_API_KEY}"
  }
}
```

获取 API Key: https://platform.deepseek.com

### 4.3 环境变量

建议使用环境变量存储 API Key:

```bash
# 在 ~/.bashrc 或 ~/.zshrc 中添加
export SILICONFLOW_API_KEY="sk-xxxxxxxxxxxxxxxx"

# 或创建 .env 文件
echo 'SILICONFLOW_API_KEY=sk-xxxxxxxx' > ~/.openclaw/.env
```

---

## 五、工具使用

### 5.1 omms_recall

搜索记忆。

```
参数:
  - query: 搜索查询 (必填)
  - limit: 返回数量 (可选，默认5)

示例:
  "用户最近做了哪些决策"
  "关于Python项目的记忆"
```

### 5.2 omms_write

显式保存记忆。

```
参数:
  - content: 要记住的内容 (必填)
  - type: 记忆类型 (可选: fact/preference/decision/error/learning)
  - importance: 重要性 0-1 (可选，默认0.5)

示例:
  content: "用户偏好使用TypeScript"
  type: "preference"
  importance: 0.8
```

### 5.3 omms_stats

查看统计信息。

```
参数: 无

返回:
  - 总记忆数
  - 长期记忆数
  - 会话记忆数
  - 按类型分布
```

### 5.4 omms_logs

查看系统日志。

```
参数:
  - level: 过滤日志级别 (可选)
  - limit: 返回条数 (默认50)
```

---

## 六、调试与日志

### 6.1 查看日志

```bash
# 查看 OpenClaw 日志
tail -f ~/.openclaw/logs/gateway.log | grep OMMS

# 或者在启动时开启调试模式
openclaw gateway --debug
```

### 6.2 常见问题

#### 1. 向量搜索不工作

检查配置:
```bash
# 测试 API 连接
curl -X POST "https://api.siliconflow.cn/v1/embeddings" \
  -H "Authorization: Bearer ${SILICONFLOW_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model": "BAAI/bge-m3", "input": "test"}'
```

#### 2. 记忆没有自动提取

确认配置:
```json
{
  "enableAutoCapture": true
}
```

#### 3. API Key 无效

确保使用环境变量:
```bash
export SILICONFLOW_API_KEY="sk-xxxxxxxx"
# 然后重启 OpenClaw
```

---

## 七、完整配置模板

### 7.1 最小配置 (仅关键词搜索)

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableVectorSearch": false,
          "enableAutoCapture": true,
          "logging": {
            "level": "info"
          }
        }
      }
    }
  }
}
```

### 7.2 标准配置 (硅基流动)

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableAutoCapture": true,
          "enableAutoRecall": true,
          "enableProfile": true,
          "enableVectorSearch": true,
          "maxMemoriesPerSession": 50,
          "embedding": {
            "model": "BAAI/bge-m3",
            "dimensions": 1024,
            "baseURL": "https://api.siliconflow.cn/v1",
            "apiKey": "${SILICONFLOW_API_KEY}"
          },
          "logging": {
            "level": "info",
            "output": "both",
            "filePath": "~/.openclaw/logs/omms.log"
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

### 7.3 调试配置

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true,
        "config": {
          "enableVectorSearch": true,
          "enableAutoCapture": true,
          "logging": {
            "level": "debug",
            "output": "both",
            "filePath": "~/.openclaw/logs/omms-debug.log"
          }
        }
      }
    }
  }
}
```

---

## 八、更新插件

### 8.1 本地开发模式

如果你修改了插件代码，需要重新编译并更新：

```bash
# 1. 重新编译最新代码
cd /home/hechen/OMMS/omms-plugin
npm run build

# 2. 使用 --force 覆盖安装
openclaw plugins install /home/hechen/OMMS/omms-plugin --force

# 3. 重启 Gateway
openclaw gateway restart
```

### 8.2 npm/ClawHub 安装

如果是从 npm 或 ClawHub 安装的插件：

```bash
# 更新到最新版本
openclaw plugins update omms

# 指定版本
openclaw plugins update omms@1.1.0
```

### 8.3 查看插件状态

```bash
# 查看已安装插件
openclaw plugins list

# 查看特定插件详情
openclaw plugins inspect omms

# 查看插件健康状态
openclaw plugins doctor
```

### 8.4 快速更新脚本

创建快捷脚本 `update-omms.sh`：

```bash
#!/bin/bash
cd /home/hechen/OMMS/omms-plugin
npm run build
openclaw plugins install /home/hechen/OMMS/omms-plugin --force
echo "Plugin updated! Restarting gateway..."
openclaw gateway restart
```

使用：
```bash
chmod +x update-omms.sh
./update-omms.sh
```

---

## 九、卸载

```bash
# 禁用插件
openclaw plugins disable omms

# 卸载
openclaw plugins uninstall omms

# 或直接删除
rm -rf ~/.openclaw/plugins/omms
```

---

## 九、获取帮助

- GitHub Issues: https://github.com/omms-team/openclaw-omms/issues
- 文档: 查看 OMMS-Design.md
