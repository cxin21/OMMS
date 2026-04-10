# OMMS - OpenClaw Memory Management System

**版本**: 3.5.0
**日期**: 2026-04-12

---

## 🎯 简介

OMMS (OpenClaw Memory Management System) 是一个智能记忆管理系统，为 AI Agent 提供长期记忆能力。

### 核心特性

- **自动记忆捕获** - 对话结束时自动提取关键内容
- **智能记忆召回** - 对话前自动注入相关记忆
- **双评分系统** - 独立计算重要性评分和作用域评分
- **分级管理** - session → agent → global 三级作用域
- **遗忘机制** - 自动归档/删除低价值记忆
- **强化机制** - 被召回的记忆自动提升重要性
- **跨Agent追踪** - 追踪记忆被不同Agent的使用情况
- **持久化存储** - LanceDB 文件持久化，重启不丢失
- **Web UI** - 可视化管理面板
- **Dreaming 机制** - 实验性智能记忆巩固系统

---

## 📦 安装

### 快速开始

```bash
# 1. 进入插件目录
cd omms-plugin

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 在 OpenClaw 中安装
openclaw plugins install ./omms-plugin --force

# 5. 启动
openclaw gateway start
```

---

## 🏗️ 项目结构

```
OMMS/
├── modules/                          # 功能模块
│   ├── core-memory/                 # 核心记忆模块
│   │   ├── DESIGN.md               # 设计文档
│   │   ├── README.md               # 使用说明
│   │   ├── CONFIG.md               # 配置项说明
│   │   └── src/                    # 源代码
│   ├── vector-search/              # 向量搜索模块
│   ├── llm/                        # LLM 模块
│   ├── dreaming/                   # Dreaming 模块
│   ├── knowledge-graph/            # 知识图谱模块
│   ├── profile/                    # 用户画像模块
│   ├── logging/                    # 日志模块
│   └── types/                      # 共享类型定义
├── omms-plugin/                     # OpenClaw 插件
│   ├── src/
│   │   ├── tools/                  # 工具集
│   │   ├── web-server/             # Web 服务
│   │   ├── cli/                    # CLI 工具
│   │   ├── api/                    # API 接口
│   │   ├── index.ts                # 入口文件
│   │   └── web-server.ts           # Web 服务器
│   └── openclaw.plugin.json        # 插件配置
├── omms-ui/                         # Web UI
└── docs/                            # 项目文档
```

---

## 🧩 模块说明

### 1. Core Memory（核心记忆）

核心记忆管理模块，包含：
- MemoryService：主记忆服务
- ScorerService：评分服务
- Persistence：持久化存储

### 2. Vector Search（向量搜索）

语义向量嵌入和搜索：
- EmbeddingService：文本向量化

### 3. LLM

大语言模型调用：
- LLMService：LLM 调用
- LLMExtractor：智能内容提取

### 4. Dreaming

智能记忆巩固系统：
- 三阶段处理：Light → Deep → REM
- 定时调度、阈值触发

### 5. Knowledge Graph

知识图谱引擎：
- GraphEngine：实体识别和关系抽取

### 6. Profile

用户画像构建：
- ProfileEngine：构建用户/Agent 画像

### 7. Logging

日志管理：
- LoggerService：结构化日志记录

---

## 🛠️ 工具列表

| 工具 | 说明 |
|------|------|
| `memory_recall` | 搜索记忆 |
| `memory_store` | 保存记忆 |
| `memory_forget` | 删除记忆 |
| `omms_dreaming` | Dreaming 控制 |
| `omms_stats` | 查看统计 |
| `omms_logs` | 查看日志 |
| `omms_graph` | 知识图谱查询 |

---

## 🌐 Web UI

访问地址: http://127.0.0.1:3456

功能页面：
- **概览** - 统计卡片、类型分布图、作用域分布图
- **记忆列表** - 搜索、筛选、提升/删除
- **活动日志** - 日志统计、完整日志
- **Dreaming** - 梦境机制控制、状态监控
- **知识图谱** - 实体和关系可视化
- **设置** - 配置 LLM/Embedding、功能开关

---

## 📚 文档导航

- [安装指南](./INSTALL.md) - 详细安装步骤
- [使用指南](./USER_GUIDE.md) - 详细使用说明
- [设计文档](./DESIGN.md) - 系统设计详解
- [配置文档](./CONFIG.md) - 所有配置项说明

### 模块文档

- [Core Memory 模块](../modules/core-memory/README.md)
- [Vector Search 模块](../modules/vector-search/README.md)
- [LLM 模块](../modules/llm/README.md)
- [Dreaming 模块](../modules/dreaming/README.md)
- [Knowledge Graph 模块](../modules/knowledge-graph/README.md)
- [Profile 模块](../modules/profile/README.md)
- [Logging 模块](../modules/logging/README.md)

---

## 🐛 问题反馈

- GitHub Issues: https://github.com/cxin21/openclaw-omms/issues

---

## 📄 许可证

MIT

---

## 🙏 致谢

- [LanceDB](https://github.com/lancedb/lancedb) - 嵌入式向量数据库
- [OpenClaw](https://github.com/) - AI Agent 框架
