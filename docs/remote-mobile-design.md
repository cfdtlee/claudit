# Claudit Remote Mobile Access 设计方案

## 概述

用户在本地运行 claudit，通过手机 app 远程查看 session 进度、todo 状态，并可发送消息操控 Claude Code。

## 架构

```
┌─ 本地 claudit (localhost:3001) ─────────┐
│                                          │
│  Express Server                          │
│  ├── REST API (/api/*)                   │
│  ├── WebSocket (/ws/chat, /ws/events)    │
│  └── 上报模块 (Reporter)                  │
│       │                                  │
│       └── 加密 → push ──┐               │
└──────────────────────────┼───────────────┘
                           ▼
              ┌─ Cloudflare Worker ─┐
              │                     │
              │  Relay API          │
              │  ├── KV Store       │
              │  └── Push (APNs)    │
              │                     │
              └─────────┬───────────┘
                        ▲
              拉取 ← 解密 │
              ┌─────────┴───────────┐
              │  手机 App (Expo)     │
              │  ├── 状态 Dashboard  │
              │  ├── Session 详情    │
              │  ├── Todo 列表       │
              │  └── 消息输入        │
              └─────────────────────┘
```

## 一、配对流程

首次使用时，本地 claudit 与手机 app 建立信任关系。

```
本地 claudit                    手机 App
     │                            │
     ├─ 生成 keypair (X25519)     │
     ├─ 生成 channelId (UUID)     │
     ├─ 显示 QR 码 ──────────────→ 扫码
     │   {                        │
     │     relayUrl,              ├─ 生成自己的 keypair
     │     channelId,             ├─ 派生 sharedKey (ECDH)
     │     publicKey              ├─ POST /pair 注册 pushToken
     │   }                        │
     └─ 收到配对确认 ←────────────┘
```

### 加密方案

| 层级 | 方案 | 说明 |
|------|------|------|
| 密钥交换 | X25519 ECDH | QR 码传递公钥 |
| 数据加密 | XSalsa20-Poly1305 (NaCl secretbox) | 与 Signal/Happy Coder 同方案 |
| 通道标识 | SHA-256(sharedKey) | Relay 用哈希标识通道，无法反推密钥 |

Relay 全程只接触加密后的 blob，零知识。

## 二、Relay API (Cloudflare Worker)

### 端点设计

```
POST   /api/channel/:channelId/pair
       Body: { pushToken, devicePublicKey }
       → 注册手机设备，保存 push token

PUT    /api/channel/:channelId/status
       Body: { encrypted: "base64..." }
       → 本地 claudit 推送加密状态快照

GET    /api/channel/:channelId/status
       → 返回最新加密状态快照

PUT    /api/channel/:channelId/sessions/:sessionId/logs
       Body: { encrypted: "base64..." }
       → 推送加密会话日志

GET    /api/channel/:channelId/sessions/:sessionId/logs?after=:timestamp
       → 拉取增量加密日志

POST   /api/channel/:channelId/commands
       Body: { encrypted: "base64..." }
       → 手机端发送加密指令

GET    /api/channel/:channelId/commands?after=:timestamp
       → 本地 claudit 轮询待执行的加密指令
```

### 存储

- **Cloudflare KV**: 状态快照（按 channelId 存，TTL 24h）
- **Cloudflare R2** (可选): 日志历史（超过 KV 1KB 限制时）

### 推送通知

Relay 收到状态更新时，检查是否需要推送：
- Session 完成 (`status: 'idle'`)
- Claude 等待输入 (`status: 'need_attention'`)
- 任务状态变更

通过 APNs / FCM 发送推送，payload 不含敏感内容，只含事件类型。

## 三、本地上报模块 (Reporter)

在 claudit server 内新增模块，定期将状态加密后推送到 relay。

### 上报数据结构

**状态快照** (每 5s 或状态变化时推送):

```typescript
interface StatusSnapshot {
  online: true;
  updatedAt: string;                 // ISO timestamp
  sessions: SessionBrief[];
  todos: { total: number; completed: number; };
  cron: { running: number; lastError?: string; };
}

interface SessionBrief {
  sessionId: string;
  project: string;                   // 项目名（非完整路径，隐私）
  status: 'idle' | 'running' | 'need_attention';
  lastMessage: string;               // 最近一条消息摘要
  updatedAt: string;
}
```

**会话日志** (实时推送):

```typescript
interface LogEntry {
  sessionId: string;
  ts: number;
  type: 'assistant_text' | 'assistant_thinking' | 'tool_use' | 'tool_result' | 'done' | 'error';
  // 按 type 不同携带不同字段
  text?: string;                     // assistant_text / assistant_thinking
  tool?: string;                     // tool_use: 工具名
  file?: string;                     // tool_use: 涉及的文件
  input?: Record<string, unknown>;   // tool_use: 简化后的参数
  success?: boolean;                 // tool_result
  message?: string;                  // error
}
```

### 接入点

Reporter 挂载到现有的 eventBus 和 WebSocket 事件：

```typescript
// server/src/services/reporter.ts

import { eventBus } from './eventBus.js';

// 1. 监听 session 事件 → 更新状态快照并推送
eventBus.onSessionEvent((event) => {
  updateSnapshot();
  pushToRelay('status', encrypt(snapshot));
});

// 2. 注入到 ClaudeProcess 事件 → 推送日志
// 在 /ws/chat 的连接处理中，同时把事件转发给 reporter
claude.on('assistant_text', (text) => {
  reporter.pushLog({ sessionId, type: 'assistant_text', text });
});
```

### 指令接收

Reporter 同时轮询 relay 的 commands 端点（每 3s），收到指令后解密并执行：

```typescript
// 轮询 relay
const commands = await fetch(`${relayUrl}/api/channel/${channelId}/commands?after=${lastTs}`);
for (const cmd of decrypt(commands)) {
  if (cmd.type === 'message') {
    // 转发到对应 session 的 ClaudeProcess
    claudeProcess.sendMessage(cmd.content);
  }
}
```

## 四、手机 App

### 技术栈

| 选择 | 方案 | 理由 |
|------|------|------|
| 框架 | React Native + Expo | 一套代码 iOS/Android，生态成熟 |
| 导航 | Expo Router | 文件系统路由 |
| 样式 | NativeWind (Tailwind) | 与 claudit web 端风格一致 |
| 加密 | tweetnacl | 轻量，与 NaCl secretbox 兼容 |
| 推送 | expo-notifications | Expo 内置 |

### 页面结构

```
App
├── (auth)
│   └── scan.tsx              ← 扫码配对
├── (main)
│   ├── index.tsx             ← Dashboard（状态概览）
│   ├── sessions/
│   │   ├── index.tsx         ← Session 列表
│   │   └── [id].tsx          ← Session 详情（日志流）
│   ├── todos.tsx             ← Todo 列表
│   └── settings.tsx          ← 设置（断开配对等）
```

### 核心组件

#### Dashboard (index.tsx)

```
┌─────────────────────────────┐
│  claudit        ● Online    │
├─────────────────────────────┤
│                             │
│  Sessions          2 active │
│  ┌─────────────────────┐   │
│  │ 🟢 myapp            │   │
│  │ 正在修改 index.ts... │   │
│  ├─────────────────────┤   │
│  │ 🟡 api-server       │   │
│  │ 等待输入             │   │
│  └─────────────────────┘   │
│                             │
│  Todos           3/7 done   │
│  ████████░░░░░░░░░  43%    │
│                             │
│  Cron             2 active  │
│  Next run: 14:30            │
│                             │
└─────────────────────────────┘
```

#### Session 详情 ([id].tsx)

消息按类型结构化渲染（参考 Happy Coder 方案），不使用终端模拟器：

```
┌─────────────────────────────┐
│  ← myapp          🟢 busy  │
├─────────────────────────────┤
│                             │
│  🤖 我来修改登录逻辑...     │  ← AgentText: MarkdownView
│                             │
│  ┌ Edit src/auth.ts ──────┐│  ← ToolUse: 卡片组件
│  │ + import { jwt } from..││
│  │ - import { basic } ... ││
│  └────────────────────────┘│
│                             │
│  ✓ File updated             │  ← ToolResult: 状态标签
│                             │
│  🤖 修改完成，正在运行测试  │
│                             │
│  ┌ Bash ──────────────────┐│
│  │ npm test               ││
│  └────────────────────────┘│
│                             │
├─────────────────────────────┤
│  [消息输入框]        Send ▶ │
└─────────────────────────────┘
```

渲染组件映射：

| LogEntry type | 组件 | 渲染方式 |
|---------------|------|---------|
| `assistant_text` | `AgentTextBlock` | Markdown 解析 + 原生 Text |
| `assistant_thinking` | `ThinkingBlock` | 折叠，低透明度 |
| `tool_use` | `ToolCard` | 卡片，显示工具名 + 文件 + diff |
| `tool_result` | `ResultBadge` | 成功/失败状态标签 |
| `done` | `DoneIndicator` | "Session 完成" 横幅 |
| `error` | `ErrorBanner` | 红色错误提示 |

代码块渲染：原生 `Text` + monospace 字体 (Menlo/monospace) + 简单正则语法高亮。

## 五、实施路线

### Phase 1: 本地上报模块

- [ ] 实现 `server/src/services/reporter.ts`
- [ ] 加密模块 (tweetnacl)
- [ ] 配对流程（生成 QR 码，终端显示）
- [ ] 挂载到 eventBus + ClaudeProcess 事件

### Phase 2: Relay (Cloudflare Worker)

- [ ] Worker + KV 基本 CRUD
- [ ] 状态推送/拉取端点
- [ ] 日志推送/拉取端点
- [ ] 指令通道
- [ ] APNs/FCM 推送集成

### Phase 3: 手机 App

- [ ] Expo 项目初始化
- [ ] 扫码配对 + 密钥存储
- [ ] Dashboard 页面
- [ ] Session 列表 + 详情（结构化渲染）
- [ ] Todo 列表
- [ ] 消息发送
- [ ] 推送通知

### Phase 4: 完善

- [ ] 离线消息队列
- [ ] 多设备支持
- [ ] 连接状态心跳
- [ ] App 端深色模式
