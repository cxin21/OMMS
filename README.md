# OMMS - OpenClaw Memory Management System

**版本**: 2.5.0
**日期**: 2026-04-11

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

### 设计理念

**记忆首先属于创建者，通过使用逐渐扩展**

- 每个记忆首先独属于创建它的Agent
- 创建者对自有记忆有最高优先级
- 记忆通过被其他Agent有效使用来扩展作用域
- 重要性和作用域评分完全独立

---

## 📦 安装

详细安装说明请查看 [OMMS-Install.md](OMMS-Install.md)

### 快速开始

```bash
# 1. 进入插件目录
cd /home/hechen/OMMS/omms-plugin

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 在 OpenClaw 中安装
openclaw plugins install /home/hechen/OMMS/omms-plugin --force

# 5. 启动
openclaw gateway start
```

---

## ⚙️ 配置

### 最小配置

```json
{
  "plugins": {
    "entries": {
      "omms": {
        "enabled": true
      }
    }
  }
}
```

### 完整配置

详细配置说明请查看 [OMMS-Install.md](OMMS-Install.md)

---

## 📖 使用指南

详细使用说明请查看 [OMMS-UserGuide.md](OMMS-UserGuide.md)

### 工具列表

| 工具 | 说明 |
|------|------|
| `omms_recall` | 搜索记忆 |
| `omms_write` | 显式保存记忆 |
| `omms_stats` | 查看统计 |
| `omms_logs` | 查看日志 |
| `omms_graph` | 知识图谱查询 |

### Web UI

访问地址: http://127.0.0.1:3456

功能页面：
- **概览** - 统计卡片、类型分布图、作用域分布图
- **记忆列表** - 搜索、筛选、提升/删除
- **活动日志** - 日志统计、完整日志
- **设置** - 配置 LLM/Embedding、功能开关

---

## 📐 架构设计

详细设计说明请查看 [OMMS-Design.md](OMMS-Design.md)

### 双评分系统

1. **Importance（重要性评分）** - 评估记忆本身的价值
2. **Scope Score（作用域评分）** - 评估记忆被多Agent共享的程度

### 召回优先级

| 优先级 | 条件 | 权重 |
|--------|------|------|
| 1 | 所有者召回 | 1.0 |
| 2 | 当前Agent | 0.8 |
| 3 | global 作用域 | 0.6 |
| 4 | agent 作用域 | 0.4 |
| 5 | 其他session | 0.2 |

### 作用域升级

```
session → agent → global
```

---

## 🔧 开发

### 项目结构

```
omms-plugin/
├── src/
│   ├── services/       # 核心服务
│   │   ├── memory.ts   # 记忆服务
│   │   ├── scorer.ts   # 评分服务
│   │   ├── vector-store.ts  # 向量存储
│   │   ├── persistence.ts   # 持久化
│   │   └── ...
│   ├── tools/         # 工具
│   │   ├── recall.ts
│   │   ├── write.ts
│   │   └── ...
│   ├── types/         # 类型定义
│   ├── api.ts         # API
│   ├── index.ts       # 入口
│   └── web-server.ts  # Web服务
└── openclaw.plugin.json  # 插件配置
```

### 编译

```bash
npm run build
```

### 测试

```bash
npm test
```

---

## 📚 文档

- [OMMS-Install.md](OMMS-Install.md) - 安装配置文档
- [OMMS-UserGuide.md](OMMS-UserGuide.md) - 使用指南
- [OMMS-Design.md](OMMS-Design.md) - 设计文档

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
