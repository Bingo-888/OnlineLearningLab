# 在线学习平台 v1（EPUB/PDF 上传 + 在线阅读）实施计划

> 生成时间：2026-09-27 13:10（UTC+8）
> 目标工作区：`C:\Users\bingo\项目\Coding\Project\OnlineLearningLab`（当前为空目录，未初始化 git）
> 本文档地位：唯一事实来源（single source of truth）。实现者遇到任何与本文档冲突的"惯例"，以本文档为准。

---

## 0. 给零上下文实现者的使用说明（先读这一段）

你是第一次接触这个代码库的实现者。本计划假设：

- 你**完全不知道**项目里有什么（现在什么都没有，只有这份计划）。
- 你的品味可疑 —— 所以每个决策都已经替你做完了，**不要即兴发挥**、不要引入计划外的依赖、不要"顺手优化"。
- 每个 Task 都是 2~5 分钟的专注工作，包含：涉及文件、完整可粘贴的代码、精确的验证命令和预期输出。
- 每个代码 Task 严格走 **TDD 循环**：先写测试 → 运行确认失败（RED）→ 写最小实现 → 运行确认通过（GREEN）→ commit。
- commit 格式：`<type>(<scope>): <summary>`，type ∈ {feat, fix, chore, test, docs, refactor}，scope ∈ {repo, shared, server, web, e2e, docker}。每个 Task 结尾有给定的 commit message，照抄。
- 所有验证命令都在 **仓库根目录** 用 bash（Windows 上为 Git-Bash/MSYS）执行，除非另有说明。
- 预期输出只承诺"关键特征"（如 `Tests 5 passed`），不会逐字复制整段输出。如果你的输出**不包含**这些关键特征，停下来排查，不要继续。

**绝对禁止清单（v1 明确不做）：**

- 批注/高亮/笔记、书内全文搜索、格式转换（MOBI/AZW3/CBZ）、OCR
- 私有书架 UI、书籍分享链接、课程/测验/作业系统
- 邮箱注册/找回密码/SMTP、OAuth、双因素认证
- 国际化（界面只有中文）、ESLint/Prettier（只有 `tsc` 严格模式）
- Redis/Postgres/对象存储（只有 SQLite + 本地磁盘）

---

## 1. Goal（一句话）

构建一个自托管的多用户在线学习平台 v1：用户凭邀请码注册登录后，可在线阅读由管理员上传的 EPUB/PDF 电子书，阅读进度按用户自动保存与恢复。

---

## 2. 当前上下文 / 假设

### 2.1 环境事实（已实测，2026-09-27）

| 项 | 值 |
|---|---|
| 工作区 | `C:\Users\bingo\项目\Coding\Project\OnlineLearningLab`（空目录，非 git 仓库） |
| 宿主工具链 | Node **v26.7.0**、pnpm **12.5.1**、Docker **29.8.0**、Python 3.14.7 |
| Shell | bash（MSYS/Git-Bash）；native 工具参数用 `C:/...` 正斜杠路径 |
| 操作系统 | Windows 11（生产目标是任意 Linux 主机上的 Docker） |

### 2.2 需求决策（已通过 grill-me 两轮问答锁定，不得再改）

| 编号 | 问题 | 决策 |
|---|---|---|
| D1 | 技术栈 | **TS 全家桶**：pnpm monorepo（`shared` + `server` + `web`），Hono(Node) API + React(Vite) SPA + SQLite，单进程/单容器 |
| D2 | 用户模型 | **多用户**：邀请码注册，角色 `admin` / `learner`；用户名+密码（无邮箱/SMTP）；管理员可重置他人密码 |
| D3 | 书库模型 | **公共书库**：仅管理员可上传，所有登录用户可读；schema 预留 `owner_id` + `visibility`，v2 可加私有书 |
| D4 | 部署 | **Docker Compose**：多阶段 Dockerfile + 数据卷持久化（SQLite + 上传文件）；日常开发本地 `pnpm dev` 热更 |
| D5 | PDF 阅读 | **pdf.js 自绘**（react-pdf）：进度自动记录、翻页/缩放/深色 UI 可控；不用 iframe 原生查看器 |
| D6 | 阅读器功能面 | 核心（上传/书架/阅读/进度记忆）+ 深色模式 + 字号调节（EPUB）+ 目录(TOC)跳转 + 封面缩略图 |

### 2.3 本计划代替你做的次要假设（低风险，均可事后调）

| 项 | 假设值 | 备注 |
|---|---|---|
| 界面语言 | 中文 | 所有按钮/文案中文 |
| 上传大小上限 | 默认 200MB，`MAX_UPLOAD_MB` 可调 | 实现为整文件读内存（见风险 R5） |
| 会话有效期 | 30 天 | HttpOnly Cookie `oll_session` |
| 首个注册用户 | 自动成为 `admin`，无需邀请码 | 引导机制，Gitea 同款做法 |
| 邀请码 | 管理员在管理页生成；一次性，用后作废 | 被邀请者一律 `learner` |
| 文件存储 | `DATA_DIR/books/<id>.<ext>`、`DATA_DIR/covers/<id>.<ext>` | 本地磁盘，卷持久化 |
| 数据可移植性 | 全量备份 = 打包 `data/` 目录 | README 写说明 |
| CI | 无 | 验证靠本地命令 + Playwright E2E |

### 2.4 版本策略

- 所有 JS 依赖用 `pnpm add` 安装**最新稳定版**，锁进 `pnpm-lock.yaml`（lockfile 是唯一版本事实）。
- 计划中的 API 用法只使用各库的稳定核心 API（Hono v4 风格、zod 基础 API、epubjs 0.3 API、react-pdf 现代 API）。
- Docker 基础镜像：`node:26-bookworm-slim`；若该 tag 拉取失败，用 `node:24-bookworm-slim` 替代（`node:sqlite` 在两个版本都可用，见 R1）。

---

## 3. 架构总览

### 3.1 三句话

单体 Node 进程（Hono）同时提供 `/api/*` REST 接口与（生产环境）静态托管 Vite 构建产物；SQLite（Node 内置 `node:sqlite`，零原生依赖）存元数据，上传的 EPUB/PDF 与封面以文件形式落在 `DATA_DIR`；浏览器端 React SPA 用 epub.js / react-pdf 渲染电子书，阅读进度经防抖后回调 API 持久化。

```
┌───────────────────────────── 浏览器（React SPA, Vite 构建）─────────────────────────────┐
│  登录/注册   书架页(/library)   阅读页(/book/:id)   管理页(/admin)                      │
│                       │              │                                               │
│                       │        epub.js ｜ react-pdf（渲染、进度、TOC、主题）             │
└───────────────────────┼──────────────┼───────────────────────────────────────────────┘
                        ▼              ▼        fetch /api/*（Cookie: oll_session）
┌────────────────────────── 单 Node 进程（Hono v4, 生产: 静态+API 同端口 3000）────────────┐
│  /api/auth/*（注册·登录·登出·me）   /api/books/*（上传·列表·文件流(Range)·封面·进度·删除） │
│  /api/admin/*（用户·邀请码·重置密码）   /api/health                                      │
│        │                          │                                                  │
│   node:sqlite（DATA_DIR/db.sqlite）  DATA_DIR/books/*  DATA_DIR/covers/*                │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 目录结构（最终形态）

```
OnlineLearningLab/
├── package.json               # 根：workspace 脚本（dev/build/test/test:e2e/typecheck）
├── pnpm-workspace.yaml        # shared / server / web
├── playwright.config.ts       # e2e 配置（webServer 拉起 server+web）
├── .gitignore  .dockerignore  .env.example  README.md
├── Dockerfile                 # 多阶段构建 → 单镜像
├── docker-compose.yml
├── scripts/
│   └── make-fixtures.mjs      # 生成 e2e 测试用 test.pdf / test.epub
├── e2e/
│   ├── global-setup.ts        # 清理 e2e/.data
│   ├── journey.spec.ts        # 3 个串行 E2E 场景
│   └── .data/  .fixtures/     # 运行时生成（gitignore）
├── shared/                    # @oll/shared：zod 契约 + DTO 类型
│   ├── package.json  tsconfig.json
│   └── src/index.ts  src/schemas.test.ts
├── server/                    # @oll/server：Hono API
│   ├── package.json  tsconfig.json  tsconfig.build.json  vitest.config.ts
│   ├── .env                   # 本地开发用（gitignore；从根 .env.example 复制）
│   └── src/
│       ├── index.ts           # 引导：loadEnv → 建目录 → openDb → createApp → listen
│       ├── app.ts             # createApp(opts)：组装所有路由（测试工厂）
│       ├── schema.ts          # SCHEMA_SQL（建表 DDL 常量）
│       ├── db.ts              # openDb / migrate / withTx
│       ├── auth.ts            # scrypt 哈希、会话、Cookie、中间件、限流器
│       ├── files.ts           # 魔数嗅探、路径助手、Range 解析
│       ├── routes/auth.ts  routes/books.ts  routes/admin.ts
│       └── *.test.ts          # 与实现同目录的 vitest 测试
└── web/                       # @oll/web：React SPA
    ├── package.json  tsconfig*.json  vite.config.ts  vitest.config.ts  index.html
    └── src/
        ├── main.tsx  index.css  App.tsx
        ├── api/client.ts      # fetch 封装（ApiError / api.get/post/put/postForm）
        ├── lib/format.ts  lib/theme.ts  lib/debounce.ts  lib/useProgressSaver.ts
        ├── auth/RequireAuth.tsx  auth/LoginPage.tsx  auth/RegisterPage.tsx
        ├── pages/LibraryPage.tsx  pages/ReaderPage.tsx  pages/AdminPage.tsx
        ├── components/BookCard.tsx  components/UploadDialog.tsx  components/Toc.tsx
        └── reader/extract.ts  reader/EpubReader.tsx  reader/PdfReader.tsx
```

### 3.3 固定契约（跨文件不得漂移）

| 契约 | 值 |
|---|---|
| 包名 | `@oll/shared`、`@oll/server`、`@oll/web` |
| 端口 | server 开发 **8787**；web 开发 **5173**（Vite 代理 `/api` → 8787）；生产统一 **3000** |
| 环境变量 | `PORT`、`DATA_DIR`、`MAX_UPLOAD_MB`（默认 200）、`COOKIE_SECURE`（`"true"` 才加 Secure；默认不加） |
| Cookie | 名 `oll_session`，值 = 32 字节随机 hex；库中只存 `sha256(token)`；有效期 30 天；`HttpOnly; SameSite=Lax; Path=/` |
| ID | 全部 `crypto.randomUUID()` 字符串；时间全部 Unix 毫秒整数 |
| 错误响应 | JSON `{"error": "<snake_case_code>"}` + 恰当状态码（400/401/403/404/409/413/415/416/429） |
| 文件类型判定 | 服务端魔数：PDF=`25 50 44 46 2D`（`%PDF-`）；EPUB=`50 4B 03 04`（ZIP）；封面 PNG=`89 50 4E 47`、JPEG=`FF D8 FF`、WEBP=`RIFF....WEBP` |
| 书籍格式枚举 | `"epub" | "pdf"`；封面扩展名 `png|jpg|webp` |
| 进度语义 | `locator`：EPUB 为 CFI 字符串，PDF 为页码十进制字符串；`percent`：0–100 浮点 |
| 中文文案 | 按钮/标签/报错提示中文；代码标识符与 commit 英文 |

---

## 4. 数据模型（完整 DDL，`server/src/schema.ts` 原样使用）

```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('admin','learner')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,            -- sha256(cookie token) 的 hex
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  used_by    TEXT REFERENCES users(id),
  used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS books (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  author            TEXT,
  format            TEXT NOT NULL CHECK (format IN ('epub','pdf')),
  original_filename TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,        -- 相对 DATA_DIR，如 'books/<id>.epub'
  cover_path        TEXT,                 -- 相对 DATA_DIR，如 'covers/<id>.jpg'
  owner_id          TEXT NOT NULL REFERENCES users(id),
  visibility        TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  uploaded_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator    TEXT NOT NULL,
  percent    REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON progress(book_id);
```

迁移策略：`PRAGMA user_version`；`0 → 1` 时执行上述 DDL 并置 `user_version = 1`。v1 只有这一个迁移，**不要**引入迁移框架。

---

## 5. API 契约（完整清单）

| 方法 | 路径 | 权限 | 请求 | 成功响应 | 失败 |
|---|---|---|---|---|---|
| GET | `/api/health` | 公开 | — | `200 {"ok":true}` | — |
| POST | `/api/auth/register` | 公开 | JSON `{username,password,inviteCode?}` | `201 {"user":UserDto}` + Set-Cookie | `400 invalid_input` / `400 invite_required` / `400 invalid_invite` / `409 username_taken` |
| POST | `/api/auth/login` | 公开 | JSON `{username,password}` | `200 {"user":UserDto}` + Set-Cookie | `401 invalid_credentials` / `429 too_many_attempts` |
| POST | `/api/auth/logout` | 登录 | — | `204`（清 Cookie + 删会话行） | — |
| GET | `/api/auth/me` | 登录 | — | `200 {"user":UserDto}` | `401 unauthorized` |
| GET | `/api/books` | 登录 | — | `200 {"books":BookDto[]}`（含当前用户进度） | `401` |
| POST | `/api/books` | admin | multipart：`file`(必), `cover`(选), `title`(选), `author`(选) | `201 {"book":BookDto}` | `400 missing_file` / `413 file_too_large` / `415 unsupported_format` / `403` |
| GET | `/api/books/:id` | 登录 | — | `200 {"book":BookDto}` | `404 not_found` |
| GET | `/api/books/:id/file` | 登录 | 支持 `Range: bytes=a-b` | `200` 全量 / `206` 部分 / `416` | `404` |
| GET | `/api/books/:id/cover` | 登录 | — | `200` 图片（Cache-Control 1 天） | `404 no_cover` |
| DELETE | `/api/books/:id` | admin | — | `204`（删行 + 删文件） | `404` |
| PUT | `/api/books/:id/progress` | 登录 | JSON `{locator,percent}` | `204` | `400 invalid_input` / `404` |
| GET | `/api/admin/users` | admin | — | `200 {"users":UserDto[]}` | `403` |
| POST | `/api/admin/users/:id/password` | admin | JSON `{newPassword}` | `204`（重置 + 吊销该用户所有会话） | `404` |
| GET | `/api/admin/invites` | admin | — | `200 {"invites":InviteDto[]}` | `403` |
| POST | `/api/admin/invites` | admin | — | `201 {"invite":InviteDto}` | `403` |

DTO（定义在 `shared/src/index.ts`，server 与 web 共用）：

```ts
export interface UserDto { id: string; username: string; role: 'admin' | 'learner'; createdAt: number }
export interface BookDto {
  id: string; title: string; author: string | null; format: 'epub' | 'pdf'
  sizeBytes: number; hasCover: boolean; uploadedAt: number
  progress: { locator: string; percent: number } | null
}
export interface InviteDto { code: string; createdAt: number; usedBy: string | null; usedAt: number | null }
```

---

## 6. 前端路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/login` | LoginPage | 用户名+密码；成功 → `/library` |
| `/register` | RegisterPage | 用户名+密码+邀请码；首个用户免邀请码（界面显示提示"你将成为管理员"） |
| `/library` | LibraryPage | 封面网格；管理员多一个"上传"按钮 |
| `/book/:id` | ReaderPage | 按 `format` 渲染 EpubReader 或 PdfReader |
| `/admin` | AdminPage | 仅 admin 可见（导航链接条件渲染）；邀请码 + 用户管理 |
| `/`、未知路径 | 重定向 | → `/library`（未登录时 RequireAuth 再转 `/login`） |

---

## 7. 工程约定

1. **TDD**：每个代码 Task 先写测试（新文件或追加用例）→ `… vitest run <file>` 看到失败 → 最小实现 → 再跑看到通过 → commit。UI 组件不做单元测试（由 Phase 14 的 Playwright 覆盖），但所有纯逻辑（格式化、防抖、限流、Range 解析、魔数）必须有单测。
2. **DRY**：可复用类型/校验放 `shared`；`server` 与 `web` 不重复定义 DTO。
3. **YAGNI**：只实现本计划写出来的东西。不加"以后可能有用"的抽象、参数、配置项。
4. **commit 频率**：每个 Task 一次 commit（给定 message）；**不要**把多个 Task 攒成一个大 commit。
5. 每个 Phase 结尾跑一次全量：`pnpm -r test` + `pnpm -r typecheck`（预期全绿）——Phase 任务里已包含。
6. Windows 注意：所有命令用 bash(POSIX) 语法；给 native 工具（node/git）的路径用 `C:/...` 形式。

---

## Phase 0 — 仓库脚手架（6 个 Task）

### T01 初始化 git 仓库

**文件**：`.gitignore`

**步骤**：

1. 运行：

```bash
git init
git checkout -b main
```

预期：`Initialized empty Git repository` + `Switched to a new branch 'main'`。
（若 git 提示需要配置身份：`git config --global user.name "你的名字"` 和 `git config --global user.email "you@example.com"` 各跑一次。）

2. 创建 `.gitignore`：

```gitignore
node_modules/
dist/
data/
server/data/
server/.env
.env
e2e/.data/
e2e/.fixtures/
playwright-report/
test-results/
*.local
.DS_Store
```

3. 验证：

```bash
git status --short
```

预期：只有 `.gitignore` 显示为 `?? .gitignore`。

4. commit：

```bash
git add .gitignore && git commit -m "chore(repo): init repository with gitignore"
```

### T02 根 workspace 配置

**文件**：`package.json`、`pnpm-workspace.yaml`

**步骤**：

1. 创建 `pnpm-workspace.yaml`：

```yaml
packages:
  - shared
  - server
  - web
```

2. 创建 `package.json`：

```json
{
  "name": "online-learning-lab",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@12.5.1",
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "test:e2e": "playwright test"
  }
}
```

3. 验证：

```bash
pnpm ls -r --depth -1
```

预期：输出根包 `online-learning-lab`（此时还没有子包，无报错即可）。

4. commit：

```bash
git add package.json pnpm-workspace.yaml && git commit -m "chore(repo): add pnpm workspace config"
```

### T03 shared 包：契约仓库（TDD）

**文件**：`shared/package.json`、`shared/tsconfig.json`、`shared/src/index.ts`、`shared/src/schemas.test.ts`

**步骤**：

1. 脚手架：

```bash
mkdir -p shared/src
```

创建 `shared/package.json`：

```json
{
  "name": "@oll/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  }
}
```

创建 `shared/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

安装依赖（在根目录执行）：

```bash
pnpm --filter @oll/shared add zod
pnpm --filter @oll/shared add -D typescript vitest
```

预期：两次 `Done` / packages added 提示，根目录出现 `pnpm-lock.yaml`。

2. **RED** —— 创建 `shared/src/schemas.test.ts`：

```ts
import { test, expect } from 'vitest'
import { registerSchema, progressSchema } from './index.js'

test('registerSchema: 拒绝过短密码', () => {
  const r = registerSchema.safeParse({ username: 'alice', password: 'short' })
  expect(r.success).toBe(false)
})

test('registerSchema: 接受合法输入且 inviteCode 可选', () => {
  const r = registerSchema.safeParse({ username: 'alice_1', password: 'password123' })
  expect(r.success).toBe(true)
})

test('progressSchema: percent 必须在 0-100', () => {
  expect(progressSchema.safeParse({ locator: 'epubcfi(/6/4!/4/2)', percent: 42.5 }).success).toBe(true)
  expect(progressSchema.safeParse({ locator: 'x', percent: 101 }).success).toBe(false)
})
```

3. 跑测试确认失败（`index.js` 不存在）：

```bash
pnpm --filter @oll/shared exec vitest run
```

预期：FAIL，报错包含 `Failed to resolve import "./index.js"` 或找不到模块（RED 确认）。

4. 创建 `shared/src/index.ts`：

```ts
import { z } from 'zod'

// ---- zod 请求契约（server 校验 + web 表单复用）----
export const usernameSchema = z.string().min(3).max(32).regex(/^[A-Za-z0-9_]+$/)
export const passwordSchema = z.string().min(8).max(128)

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().min(4).max(64).optional(),
})

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const progressSchema = z.object({
  locator: z.string().min(1).max(2048),
  percent: z.number().min(0).max(100),
})

export const resetPasswordSchema = z.object({ newPassword: passwordSchema })

// ---- DTO ----
export type Role = 'admin' | 'learner'
export type BookFormat = 'epub' | 'pdf'

export interface UserDto { id: string; username: string; role: Role; createdAt: number }
export interface BookDto {
  id: string; title: string; author: string | null; format: BookFormat
  sizeBytes: number; hasCover: boolean; uploadedAt: number
  progress: { locator: string; percent: number } | null
}
export interface InviteDto { code: string; createdAt: number; usedBy: string | null; usedAt: number | null }
```

5. 跑测试确认通过 + 构建：

```bash
pnpm --filter @oll/shared exec vitest run
pnpm --filter @oll/shared build
```

预期：`Tests 3 passed (3)`；构建后存在 `shared/dist/index.js` 和 `shared/dist/index.d.ts`。

6. commit：

```bash
git add -A && git commit -m "feat(shared): add zod request schemas and DTO types"
```

### T04 server 包脚手架 + 健康检查（TDD 起点）

**文件**：`server/package.json`、`server/tsconfig.json`、`server/tsconfig.build.json`、`server/vitest.config.ts`、`server/src/app.ts`、`server/src/app.test.ts`

**步骤**：

1. 脚手架与依赖：

```bash
mkdir -p server/src
cd server && pnpm init --init-type=module > /dev/null && cd ..
```

把 `server/package.json` 编辑为：

```json
{
  "name": "@oll/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

安装依赖：

```bash
pnpm --filter @oll/server add hono @hono/node-server zod
pnpm --filter @oll/server add '@oll/shared@workspace:*'
pnpm --filter @oll/server add -D typescript tsx vitest @types/node
```

（`'@oll/shared@workspace:*'` 会把本地包按 workspace 协议写进 dependencies；若某版本 pnpm 拒绝该写法，退化为在 `server/package.json` 手写 `"@oll/shared": "workspace:*"` 再 `pnpm install`。）

2. 创建 `server/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

创建 `server/tsconfig.build.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src", "sourceMap": true },
  "exclude": ["src/**/*.test.ts"]
}
```

创建 `server/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

3. **RED** —— 创建 `server/src/app.test.ts`：

```ts
import { test, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'

export function makeTestApp(opts: { maxUploadMb?: number } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-test-'))
  const db = new DatabaseSync(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, maxUploadMb: opts.maxUploadMb ?? 200 })
  return { app, db, dataDir }
}

test('GET /api/health 返回 ok', async () => {
  const { app } = makeTestApp()
  const res = await app.request('/api/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})
```

这条测试同时是本计划中**所有** server 测试的工厂模板：后续文件从 `./test-helpers.js` 引入同一工厂（T05 会抽出这个文件；本 Task 先就地实现）。

4. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/app.test.ts
```

预期：FAIL，`Failed to resolve import "./app.js"`（RED）。

5. 创建 `server/src/app.ts`：

```ts
import { Hono } from 'hono'
import type { DatabaseSync } from 'node:sqlite'

export interface AppOptions {
  db: DatabaseSync
  dataDir: string
  maxUploadMb?: number
  cookieSecure?: boolean
  webRoot?: string | null   // 生产静态资源目录；开发/测试传 null
}

export type AppEnv = { Variables: { user: unknown } }

export function createApp(opts: AppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.notFound((c) => c.json({ error: 'not_found' }, 404))
  return app
}
```

6. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/app.test.ts
```

预期：`Tests 1 passed (1)`。

7. commit：

```bash
git add -A && git commit -m "feat(server): scaffold hono app with health endpoint"
```

### T05 server 测试工厂抽公共文件

**文件**：`server/src/test-helpers.ts`、`server/src/app.test.ts`（改）

**步骤**：

1. 创建 `server/src/test-helpers.ts`，把 `makeTestApp` 原样搬入（从 `app.test.ts` 剪切），并追加注册辅助函数：

```ts
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { createApp, type AppEnv } from './app.js'

export interface TestCtx {
  app: Hono<AppEnv>
  db: DatabaseSync
  dataDir: string
}

export function makeTestApp(opts: { maxUploadMb?: number } = {}): TestCtx {
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-test-'))
  const db = new DatabaseSync(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, maxUploadMb: opts.maxUploadMb ?? 200 })
  return { app, db, dataDir }
}

/** 注册用户并返回携带会话 Cookie 的请求头 */
export async function registerUser(
  ctx: TestCtx,
  username: string,
  password = 'password123',
  inviteCode?: string,
): Promise<{ headers: { cookie: string }; user: { id: string; role: string } }> {
  const res = await ctx.app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, inviteCode }),
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  const token = /oll_session=([^;]+)/.exec(setCookie)?.[1]
  if (!token) throw new Error(`register failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string; role: string } }
  return { headers: { cookie: `oll_session=${token}` }, user: body.user }
}
```

2. `app.test.ts` 改为：

```ts
import { test, expect } from 'vitest'
import { makeTestApp } from './test-helpers.js'

test('GET /api/health 返回 ok', async () => {
  const { app } = makeTestApp()
  const res = await app.request('/api/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})
```

3. 验证：

```bash
pnpm --filter @oll/server exec vitest run
```

预期：`Tests 1 passed (1)`。

4. commit：

```bash
git add -A && git commit -m "test(server): extract shared test helpers"
```

### T06 web 包脚手架（Vite + React + Tailwind）

**文件**：`web/**`（脚手架生成后裁剪）

**步骤**：

1. 脚手架：

```bash
pnpm create vite web --template react-ts
```

预期：`Scaffolding project in .../web`。随后：

```bash
pnpm install
pnpm --filter @oll/web add react-router @tanstack/react-query
pnpm --filter @oll/web add '@oll/shared@workspace:*'
pnpm --filter @oll/web add -D tailwindcss @tailwindcss/vite vitest
```

若 `@oll/shared` 安装报 workspace 协议问题，手动在 `web/package.json` 的 dependencies 里写 `"@oll/shared": "workspace:*"` 后 `pnpm install`。

2. 删除脚手架演示文件：

```bash
rm web/src/App.css web/src/assets/react.svg web/public/vite.svg
```

3. 替换 `web/src/index.css` 全部内容：

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

html, body, #root { height: 100%; }
body { @apply bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100; }
```

（若 `@custom-variant` 行在当前 tailwindcss 版本报错，打开 https://tailwindcss.com/docs/dark-mode 按"class 策略"一节替换写法，这是唯一允许的免费发挥点。）

4. 替换 `web/vite.config.ts` 全部内容：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
```

5. 创建 `web/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

6. 替换 `web/src/App.tsx` 为占位：

```tsx
export default function App() {
  return <div className="p-8">在线学习平台</div>
}
```

`web/src/main.tsx` 保持脚手架默认（渲染 `<App />`），但删除对不存在文件的引用（`App.css` 已被删，若 main.tsx 引用了它就去掉那行 import）。

7. 验证：

```bash
pnpm --filter @oll/web build
```

预期：`vite build` 成功，产出 `web/dist/index.html`。

8. commit：

```bash
git add -A && git commit -m "feat(web): scaffold vite react app with tailwind and shared deps"
```

**Phase 0 收尾验证**：

```bash
pnpm -r typecheck && pnpm -r test
```

预期：全部通过（shared 3 个测试、server 1 个测试通过；web 无测试文件时 vitest 以 `No test files found` 退出码 1 —— 若发生，在 `web/package.json` 的 test 脚本加 `--passWithNoTests`）。


## Phase 1 — 服务端核心：数据层与鉴权工具（T07–T11）

### T07 数据层：schema + 迁移 + openDb（TDD）

**文件**：`server/src/schema.ts`、`server/src/db.ts`、`server/src/types.ts`、`server/src/db.test.ts`、`server/src/test-helpers.ts`（改）

**步骤**：

1. **RED** —— 创建 `server/src/db.test.ts`：

```ts
import { test, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, withTx } from './db.js'

function makeDb() {
  return openDb(join(mkdtempSync(join(tmpdir(), 'oll-db-')), 'db.sqlite'))
}

test('迁移后 user_version = 1 且五张表存在', () => {
  const db = makeDb()
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number }
  expect(v.user_version).toBe(1)
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
  const names = rows.map((r) => r.name)
  for (const t of ['books', 'invites', 'progress', 'sessions', 'users']) expect(names).toContain(t)
})

test('外键生效：插入孤儿 progress 会抛错', () => {
  const db = makeDb()
  expect(() =>
    db.prepare(`INSERT INTO progress (user_id, book_id, locator, percent, updated_at) VALUES ('x','y','l',0,0)`).run(),
  ).toThrow()
})

test('withTx 回滚', () => {
  const db = makeDb()
  expect(() =>
    withTx(db, () => {
      db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES ('u1','a','h','admin',1)`).run()
      throw new Error('boom')
    }),
  ).toThrow('boom')
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  expect(n.n).toBe(0)
})

test('重复 openDb 幂等（不重复执行迁移）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oll-db-'))
  const db1 = openDb(join(dir, 'db.sqlite'))
  db1.close()
  const db2 = openDb(join(dir, 'db.sqlite'))
  expect((db2.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/db.test.ts
```

预期：FAIL，`Failed to resolve import "./db.js"`（RED）。

3. 创建 `server/src/schema.ts`（第 4 节的 DDL 原样放入模板字符串）：

```ts
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('admin','learner')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  used_by    TEXT REFERENCES users(id),
  used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS books (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  author            TEXT,
  format            TEXT NOT NULL CHECK (format IN ('epub','pdf')),
  original_filename TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,
  cover_path        TEXT,
  owner_id          TEXT NOT NULL REFERENCES users(id),
  visibility        TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  uploaded_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator    TEXT NOT NULL,
  percent    REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON progress(book_id);
`
```

创建 `server/src/db.ts`：

```ts
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA_SQL } from './schema.js'

export type Db = DatabaseSync

/**
 * 打开数据库并保证 schema 已迁移。
 * ':memory:' 亦可（测试用）。node:sqlite 为同步 API。
 */
export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: Db) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version < 1) {
    db.exec(SCHEMA_SQL)
    db.exec('PRAGMA user_version = 1')
  }
}

/** 同步事务助手（node:sqlite 没有 db.transaction() 包装器） */
export function withTx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
```

创建 `server/src/types.ts`（消除后续类型循环依赖）：

```ts
export interface UserRow {
  id: string
  username: string
  password_hash: string
  role: 'admin' | 'learner'
  created_at: number
}

export type AppEnv = { Variables: { user: UserRow } }
```

4. 修改 `server/src/app.ts`：删除内联的 `AppEnv` 定义，改为：

```ts
import type { AppEnv } from './types.js'
export type { AppEnv } from './types.js'
```

5. 修改 `server/src/test-helpers.ts`：把 `new DatabaseSync(':memory:')` 换成迁移过的内存库：

```ts
import { openDb } from './db.js'
// ...
const db = openDb(':memory:')
```

（`DatabaseSync` 的 import 相应删掉。）

6. 确认全部通过：

```bash
pnpm --filter @oll/server exec vitest run
```

预期：`Test Files 2 passed`，`Tests 5 passed (5)`（db 4 个 + health 1 个）。

7. commit：

```bash
git add -A && git commit -m "feat(server): add sqlite schema, migrations and transaction helper"
```

### T08 文件工具：魔数嗅探 + Range 解析（TDD）

**文件**：`server/src/files.ts`、`server/src/files.test.ts`

**步骤**：

1. **RED** —— 创建 `server/src/files.test.ts`：

```ts
import { test, expect } from 'vitest'
import { sniffFormat, sniffImage, parseRange, CONTENT_TYPES } from './files.js'

const enc = (s: string) => new TextEncoder().encode(s)

test('sniffFormat 识别 pdf / epub / 未知', () => {
  expect(sniffFormat(enc('%PDF-1.7\n...'))).toBe('pdf')
  expect(sniffFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe('epub')
  expect(sniffFormat(enc('<html>'))).toBe(null)
  expect(sniffFormat(new Uint8Array([]))).toBe(null)
})

test('sniffImage 识别 png / jpg / webp / 未知', () => {
  expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png')
  expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
  expect(
    sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])),
  ).toBe('webp')
  expect(sniffImage(enc('GIF89a'))).toBe(null)
})

test('parseRange：无 header / 常规 / 后缀 / 越界钳制 / 非法', () => {
  expect(parseRange(null, 100)).toBe(null)
  expect(parseRange('bytes=0-3', 100)).toEqual({ start: 0, end: 3 })
  expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 })
  expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  expect(parseRange('bytes=5-999', 100)).toEqual({ start: 5, end: 99 }) // 钳制
  expect(parseRange('bytes=100-101', 100)).toBe('invalid') // start >= size
  expect(parseRange('bytes=7-3', 100)).toBe('invalid')
  expect(parseRange('bytes=abc', 100)).toBe(null)
})

test('CONTENT_TYPES 完整', () => {
  expect(CONTENT_TYPES.pdf).toBe('application/pdf')
  expect(CONTENT_TYPES.epub).toBe('application/epub+zip')
  expect(CONTENT_TYPES.jpg).toBe('image/jpeg')
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/files.test.ts
```

预期：FAIL（`Failed to resolve import "./files.js"`）。

3. 创建 `server/src/files.ts`：

```ts
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** 书籍魔数：PDF = '%PDF-'；EPUB = ZIP 头 'PK\x03\x04' */
export function sniffFormat(bytes: Uint8Array): 'pdf' | 'epub' | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  ) return 'pdf'
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'epub'
  return null
}

export function sniffImage(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp'
  return null
}

/**
 * 解析单段 Range。返回：null = 无/不可识别（按全量响应）；
 * 'invalid' = 语法可识别但范围非法（响应 416）；否则为闭区间 {start,end}。
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Number(m[2])
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return 'invalid'
  if (end >= size) end = size - 1
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}

export function ensureDataDirs(dataDir: string): void {
  mkdirSync(join(dataDir, 'books'), { recursive: true })
  mkdirSync(join(dataDir, 'covers'), { recursive: true })
}
```

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/files.test.ts
```

预期：`Tests 4 passed (4)`。

5. commit：

```bash
git add -A && git commit -m "feat(server): add magic-byte sniffing and range parsing utils"
```

### T09 密码哈希与会话工具（TDD）

**文件**：`server/src/auth.ts`、`server/src/auth.test.ts`

**步骤**：

1. **RED** —— 创建 `server/src/auth.test.ts`：

```ts
import { test, expect } from 'vitest'
import { openDb } from './db.js'
import {
  hashPassword, verifyPassword, sha256,
  createSession, getSessionUser, deleteSession, deleteUserSessions, SESSION_TTL_MS,
} from './auth.js'

function seedUser(db: ReturnType<typeof openDb>, id = 'u1') {
  db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,'','learner',1)`).run(id, `user_${id}`)
  return id
}

test('scrypt：同密码两次哈希不同盐，但都能验证通过', () => {
  const h1 = hashPassword('password123')
  const h2 = hashPassword('password123')
  expect(h1).not.toBe(h2)
  expect(h1.startsWith('scrypt$')).toBe(true)
  expect(verifyPassword('password123', h1)).toBe(true)
  expect(verifyPassword('password124', h1)).toBe(false)
})

test('verifyPassword 对损坏的哈希返回 false 而不抛错', () => {
  expect(verifyPassword('x', 'garbage')).toBe(false)
  expect(verifyPassword('x', 'scrypt$zz$zz')).toBe(false)
})

test('sha256 稳定输出', () => {
  expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('会话：创建/查询/删除/过期', () => {
  const db = openDb(':memory:')
  const uid = seedUser(db)
  const token = createSession(db, uid)
  expect(getSessionUser(db, token)?.id).toBe(uid)
  // 库里存的是哈希而不是明文 token
  expect(db.prepare('SELECT id FROM sessions').get()).toEqual({ id: sha256(token) })
  expect(getSessionUser(db, 'not-a-token')).toBe(null)
  deleteSession(db, token)
  expect(getSessionUser(db, token)).toBe(null)
})

test('会话过期后不可用', () => {
  const db = openDb(':memory:')
  const uid = seedUser(db)
  const token = 'deadbeef'.repeat(8)
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), uid, Date.now() - SESSION_TTL_MS - 1, Date.now() - 1)
  expect(getSessionUser(db, token)).toBe(null)
})

test('deleteUserSessions 清空该用户全部会话', () => {
  const db = openDb(':memory:')
  const uid = seedUser(db)
  const t1 = createSession(db, uid)
  const t2 = createSession(db, uid)
  deleteUserSessions(db, uid)
  expect(getSessionUser(db, t1)).toBe(null)
  expect(getSessionUser(db, t2)).toBe(null)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/auth.test.ts
```

预期：FAIL（`Failed to resolve import "./auth.js"`）。

3. 创建 `server/src/auth.ts`：

```ts
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { Db } from './db.js'
import type { AppEnv, UserRow } from './types.js'
import type { UserDto } from '@oll/shared'

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const

export const SESSION_COOKIE = 'oll_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    if (salt.length === 0 || expected.length === 0) return false
    const actual = scryptSync(password, salt, expected.length, SCRYPT)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function newId(): string {
  return randomUUID()
}

export function toUserDto(u: UserRow): UserDto {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.created_at }
}

// ---- 会话 ----

export function createSession(db: Db, userId: string, now = Date.now()): string {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), userId, now, now + SESSION_TTL_MS)
  return token
}

export function getSessionUser(db: Db, token: string, now = Date.now()): UserRow | null {
  if (!token) return null
  const row = db
    .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.id = ? AND s.expires_at > ?`)
    .get(sha256(token), now) as UserRow | undefined
  return row ?? null
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token))
}

export function deleteUserSessions(db: Db, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function setSessionCookie(c: Context<AppEnv>, token: string, secure: boolean): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure,
  })
}

// ---- 请求上下文 ----

export function getAuthUser(db: Db, c: Context<AppEnv>): UserRow | null {
  const token = getCookie(c, SESSION_COOKIE)
  return token ? getSessionUser(db, token) : null
}

export function requireAuth(db: Db) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = getAuthUser(db, c)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', user)
    await next()
  }
}

export function requireAdmin(db: Db) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = getAuthUser(db, c)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
    c.set('user', user)
    await next()
  }
}

// ---- 登录限流（内存实现；重启即清零，可接受）----

export function makeRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
  const { limit, windowMs } = opts
  const now = opts.now ?? (() => Date.now())
  const hits = new Map<string, number[]>()
  return (key: string): boolean => {
    const t = now()
    const arr = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
    if (arr.length >= limit) {
      hits.set(key, arr)
      return false
    }
    arr.push(t)
    hits.set(key, arr)
    return true
  }
}
```

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/auth.test.ts
```

预期：`Tests 6 passed (6)`。

5. commit：

```bash
git add -A && git commit -m "feat(server): add password hashing, sessions and auth middleware"
```

### T10 限流器测试（补测，T09 已实现）

**文件**：`server/src/auth.test.ts`（追加）

**步骤**：

1. 在 `auth.test.ts` 末尾追加：

```ts
import { makeRateLimiter } from './auth.js'   // ← 合并到文件顶部既有的 import 里

test('限流器：超过 limit 拒绝，窗口滑过后恢复', () => {
  let t = 1_000
  const allow = makeRateLimiter({ limit: 2, windowMs: 1_000, now: () => t })
  expect(allow('k')).toBe(true)
  expect(allow('k')).toBe(true)
  expect(allow('k')).toBe(false) // 第 3 次在窗口内 → 拒绝
  t = 2_100 // 窗口滑过
  expect(allow('k')).toBe(true)
  expect(allow('other')).toBe(true) // 不同 key 独立计数
})
```

2. 运行：

```bash
pnpm --filter @oll/server exec vitest run src/auth.test.ts
```

预期：`Tests 7 passed (7)`。

3. commit：

```bash
git add -A && git commit -m "test(server): cover rate limiter windowing"
```

---

## Phase 2 — 鉴权路由（T11–T12）

### T11 注册路由（TDD）

**文件**：`server/src/routes/auth.ts`、`server/src/routes/auth.test.ts`、`server/src/app.ts`（改）

**步骤**：

1. **RED** —— 创建 `server/src/routes/auth.test.ts`：

```ts
import { test, expect } from 'vitest'
import { makeTestApp } from '../test-helpers.js'

function json(body: unknown) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

test('第一个用户注册成功且是 admin，无需邀请码', async () => {
  const { app } = makeTestApp()
  const res = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  expect(res.status).toBe(201)
  const body = (await res.json()) as { user: { role: string; username: string } }
  expect(body.user.role).toBe('admin')
  expect(body.user.username).toBe('boss')
  expect(res.headers.get('set-cookie')).toContain('oll_session=')
})

test('第二个用户缺邀请码 → 400 invite_required', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const res = await app.request('/api/auth/register', json({ username: 'alice', password: 'password123' }))
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'invite_required' })
})

test('无效邀请码 → 400 invalid_invite', async () => {
  const { app, db } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const bossId = ((await reg.json()) as { user: { id: string } }).user.id
  db.prepare(`INSERT INTO invites (code, created_by, created_at) VALUES ('good',?,1)`).run(bossId)
  const res = await app.request('/api/auth/register', json({ username: 'alice', password: 'password123', inviteCode: 'badcode' }))
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'invalid_invite' })
})

test('有效邀请码 → 201 learner，且邀请码被消费（不可复用）', async () => {
  const { app, db } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const bossId = ((await reg.json()) as { user: { id: string } }).user.id
  db.prepare(`INSERT INTO invites (code, created_by, created_at) VALUES ('good',?,1)`).run(bossId)
  const res = await app.request('/api/auth/register', json({ username: 'alice', password: 'password123', inviteCode: 'good' }))
  expect(res.status).toBe(201)
  expect(((await res.json()) as { user: { role: string } }).user.role).toBe('learner')
  const again = await app.request('/api/auth/register', json({ username: 'bob', password: 'password123', inviteCode: 'good' }))
  expect(again.status).toBe(400)
  expect(await again.json()).toEqual({ error: 'invalid_invite' })
})

test('重复用户名（含大小写变体）→ 409 username_taken', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const res = await app.request('/api/auth/register', json({ username: 'BOSS', password: 'password123' }))
  expect(res.status).toBe(409)
})

test('非法输入（短密码/坏用户名）→ 400 invalid_input', async () => {
  const { app } = makeTestApp()
  const shortPw = await app.request('/api/auth/register', json({ username: 'okname', password: 'short' }))
  expect(shortPw.status).toBe(400)
  expect(await shortPw.json()).toEqual({ error: 'invalid_input' })
  const badName = await app.request('/api/auth/register', json({ username: '带空格 名字', password: 'password123' }))
  expect(badName.status).toBe(400)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/routes/auth.test.ts
```

预期：FAIL —— 所有用例 404 `{"error":"not_found"}`（路由未实现，RED）。

3. 创建 `server/src/routes/auth.ts`：

```ts
import { Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { loginSchema, registerSchema } from '@oll/shared'
import type { AppOptions } from '../app.js'
import type { AppEnv, UserRow } from '../types.js'
import {
  createSession, deleteSession, getAuthUser, hashPassword, newId,
  setSessionCookie, toUserDto, verifyPassword,
} from '../auth.js'
import { withTx } from '../db.js'

export function authRoutes(opts: AppOptions, loginLimiter: (key: string) => boolean): Hono<AppEnv> {
  const { db } = opts
  const secure = opts.cookieSecure === true
  const r = new Hono<AppEnv>()

  r.post('/register', async (c) => {
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const { username, password, inviteCode } = parsed.data

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
    const isFirst = n === 0
    // 用户名冲突优先于邀请码校验：重复用户直接 409（与测试用例约定一致）
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      return c.json({ error: 'username_taken' }, 409)
    }
    let inviteCodeToConsume: string | null = null
    if (!isFirst) {
      if (!inviteCode) return c.json({ error: 'invite_required' }, 400)
      const invite = db.prepare('SELECT code FROM invites WHERE code = ? AND used_by IS NULL').get(inviteCode)
      if (!invite) return c.json({ error: 'invalid_invite' }, 400)
      inviteCodeToConsume = inviteCode
    }
    const user: UserRow = {
      id: newId(),
      username,
      password_hash: hashPassword(password),
      role: isFirst ? 'admin' : 'learner',
      created_at: Date.now(),
    }
    withTx(db, () => {
      db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)')
        .run(user.id, user.username, user.password_hash, user.role, user.created_at)
      if (inviteCodeToConsume) {
        db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?')
          .run(user.id, Date.now(), inviteCodeToConsume)
      }
    })

    setSessionCookie(c, createSession(db, user.id), secure)
    return c.json({ user: toUserDto(user) }, 201)
  })

  r.post('/login', async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const { username, password } = parsed.data
    if (!loginLimiter(`login:${username.toLowerCase()}`)) {
      return c.json({ error: 'too_many_attempts' }, 429)
    }
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
    if (!row || !verifyPassword(password, row.password_hash)) {
      return c.json({ error: 'invalid_credentials' }, 401)
    }
    setSessionCookie(c, createSession(db, row.id), secure)
    return c.json({ user: toUserDto(row) })
  })

  r.post('/logout', (c) => {
    const token = getCookie(c, 'oll_session')
    if (token) deleteSession(db, token)
    deleteCookie(c, 'oll_session', { path: '/' })
    return c.body(null, 204)
  })

  r.get('/me', (c) => {
    const user = getAuthUser(db, c)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    return c.json({ user: toUserDto(user) })
  })

  return r
}
```

4. 在 `server/src/app.ts` 挂载（`createApp` 内、health 之后）：

```ts
import { authRoutes } from './routes/auth.js'
import { makeRateLimiter } from './auth.js'
// ...
const loginLimiter = makeRateLimiter({ limit: 10, windowMs: 10 * 60_000 })
app.route('/api/auth', authRoutes(opts, loginLimiter))
```

5. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/routes/auth.test.ts
```

预期：`Tests 6 passed (6)`。

6. commit：

```bash
git add -A && git commit -m "feat(server): add register route with invite codes and admin bootstrap"
```

### T12 登录 / 登出 / me 路由（TDD）

**文件**：`server/src/routes/auth.test.ts`（追加）

**步骤**：

1. 追加测试（T11 已实现全部逻辑，本 Task 验证边界）：

```ts
test('登录：正确凭证 200 + Cookie；错误 401；未知用户 401', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const ok = await app.request('/api/auth/login', json({ username: 'boss', password: 'password123' }))
  expect(ok.status).toBe(200)
  expect(ok.headers.get('set-cookie')).toContain('oll_session=')
  const bad = await app.request('/api/auth/login', json({ username: 'boss', password: 'wrong-pass' }))
  expect(bad.status).toBe(401)
  expect(await bad.json()).toEqual({ error: 'invalid_credentials' })
  const ghost = await app.request('/api/auth/login', json({ username: 'nobody', password: 'password123' }))
  expect(ghost.status).toBe(401)
})

test('连续 10 次失败后第 11 次 → 429 too_many_attempts', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  for (let i = 0; i < 10; i++) {
    const res = await app.request('/api/auth/login', json({ username: 'boss', password: 'nope-nope' }))
    expect(res.status).toBe(401)
  }
  const limited = await app.request('/api/auth/login', json({ username: 'boss', password: 'password123' }))
  expect(limited.status).toBe(429)
  expect(await limited.json()).toEqual({ error: 'too_many_attempts' })
})

test('me：带 Cookie 200；无 Cookie 401', async () => {
  const { app } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const cookie = /oll_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1]
  const me = await app.request('/api/auth/me', { headers: { cookie: `oll_session=${cookie}` } })
  expect(me.status).toBe(200)
  expect(((await me.json()) as { user: { username: string } }).user.username).toBe('boss')
  const anon = await app.request('/api/auth/me')
  expect(anon.status).toBe(401)
})

test('logout：204 且会话立即失效', async () => {
  const { app } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const cookie = `oll_session=${/oll_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1]}`
  const out = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } })
  expect(out.status).toBe(204)
  const me = await app.request('/api/auth/me', { headers: { cookie } })
  expect(me.status).toBe(401)
})
```

2. 运行：

```bash
pnpm --filter @oll/server exec vitest run src/routes/auth.test.ts
```

预期：`Tests 10 passed (10)`。（若 429 用例失败，检查限流器是否在 createApp 内只被创建一次。）

3. commit：

```bash
git add -A && git commit -m "test(server): cover login, logout and me flows"
```

---

## Phase 3 — 书库 API（T13–T18）

### T13 上传：管理员 happy path（TDD）

**文件**：`server/src/routes/books.ts`、`server/src/routes/books.test.ts`、`server/src/app.ts`（改）

**步骤**：

1. **RED** —— 创建 `server/src/routes/books.test.ts`：

```ts
import { test, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeTestApp, registerUser } from '../test-helpers.js'

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')

export function pdfFormData(name = 'book.pdf', bytes: Uint8Array = PDF, extra: Record<string, string | File> = {}) {
  const fd = new FormData()
  fd.set('file', new File([bytes], name, { type: 'application/pdf' }))
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

test('管理员上传 PDF：201 + 文件落盘 + 元数据入库', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const fd = pdfFormData('深度学习入门.pdf', PDF, { title: '深度学习入门', author: '张三' })
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(201)
  const { book } = (await res.json()) as { book: { id: string; title: string; author: string; format: string; sizeBytes: number; hasCover: boolean; progress: null } }
  expect(book.title).toBe('深度学习入门')
  expect(book.author).toBe('张三')
  expect(book.format).toBe('pdf')
  expect(book.sizeBytes).toBe(PDF.length)
  expect(book.hasCover).toBe(false)
  expect(book.progress).toBe(null)
  expect(existsSync(join(ctx.dataDir, 'books', `${book.id}.pdf`))).toBe(true)
})

test('未提供 title 时用文件名（去扩展名）兜底', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('my notes.pdf'), headers: admin.headers })
  const { book } = (await res.json()) as { book: { title: string } }
  expect(book.title).toBe('my notes')
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：FAIL —— 404（路由未挂载，RED）。

3. 创建 `server/src/routes/books.ts`：

```ts
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { progressSchema, type BookDto } from '@oll/shared'
import type { AppOptions } from '../app.js'
import type { AppEnv, UserRow } from '../types.js'
import { requireAdmin, requireAuth } from '../auth.js'
import { CONTENT_TYPES, ensureDataDirs, parseRange, sniffFormat, sniffImage } from '../files.js'

interface BookRow {
  id: string
  title: string
  author: string | null
  format: 'epub' | 'pdf'
  original_filename: string
  size_bytes: number
  storage_path: string
  cover_path: string | null
  owner_id: string
  visibility: string
  uploaded_at: number
}

type BookRowWithProgress = BookRow & { progress_locator: string | null; progress_percent: number | null }

export function toBookDto(r: BookRowWithProgress): BookDto {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    format: r.format,
    sizeBytes: r.size_bytes,
    hasCover: r.cover_path !== null,
    uploadedAt: r.uploaded_at,
    progress: r.progress_locator != null ? { locator: r.progress_locator, percent: r.progress_percent ?? 0 } : null,
  }
}

export function bookRoutes(opts: AppOptions): Hono<AppEnv> {
  const { db, dataDir } = opts
  const maxBytes = (opts.maxUploadMb ?? 200) * 1024 * 1024
  const r = new Hono<AppEnv>()

  r.post('/', requireAdmin(db), async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!(file instanceof File)) return c.json({ error: 'missing_file' }, 400)
    if (file.size > maxBytes) return c.json({ error: 'file_too_large' }, 413)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const format = sniffFormat(bytes)
    if (!format) return c.json({ error: 'unsupported_format' }, 415)

    let cover: { ext: string; bytes: Uint8Array } | null = null
    const coverField = body['cover']
    if (coverField instanceof File) {
      if (coverField.size > 5 * 1024 * 1024) return c.json({ error: 'cover_too_large' }, 413)
      const cb = new Uint8Array(await coverField.arrayBuffer())
      const ext = sniffImage(cb)
      if (!ext) return c.json({ error: 'unsupported_cover' }, 415)
      cover = { ext, bytes: cb }
    }

    const titleField = typeof body['title'] === 'string' ? body['title'].trim() : ''
    const authorField = typeof body['author'] === 'string' ? body['author'].trim() : ''
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '') || '未命名书籍'
    const title = (titleField || fallbackTitle).slice(0, 300)
    const author = authorField ? authorField.slice(0, 200) : null

    const user = c.get('user') as UserRow
    const id = randomUUID()
    const storagePath = `books/${id}.${format}`
    ensureDataDirs(dataDir)
    writeFileSync(join(dataDir, storagePath), bytes)
    let coverRel: string | null = null
    if (cover) {
      coverRel = `covers/${id}.${cover.ext}`
      writeFileSync(join(dataDir, coverRel), cover.bytes)
    }

    const now = Date.now()
    db.prepare(`INSERT INTO books
      (id, title, author, format, original_filename, size_bytes, storage_path, cover_path, owner_id, visibility, uploaded_at)
      VALUES (?,?,?,?,?,?,?,?,?,'public',?)`)
      .run(id, title, author, format, file.name, file.size, storagePath, coverRel, user.id, now)

    const book: BookDto = {
      id, title, author, format, sizeBytes: file.size,
      hasCover: coverRel !== null, uploadedAt: now, progress: null,
    }
    return c.json({ book }, 201)
  })

  // T14~T18 将在此文件继续追加：GET /、GET /:id、GET /:id/file、GET /:id/cover、DELETE /:id、PUT /:id/progress

  return r
}
```

4. 在 `app.ts` 挂载：

```ts
import { bookRoutes } from './routes/books.js'
// createApp 内：
app.route('/api/books', bookRoutes(opts))
```

5. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：`Tests 2 passed (2)`。

6. commit：

```bash
git add -A && git commit -m "feat(server): add book upload endpoint for admins"
```

### T14 上传校验分支（TDD）

**文件**：`server/src/routes/books.test.ts`（追加）

**步骤**：

1. 先给 `test-helpers.ts` 追加创建学员用户的助手（两条路由都已有实现）：

```ts
export async function createLearner(ctx: TestCtx, admin: { headers: { cookie: string } }, username: string) {
  const inv = await ctx.app.request('/api/admin/invites', { method: 'POST', headers: admin.headers })
  const code = ((await inv.json()) as { invite: { code: string } }).invite.code
  return registerUser(ctx, username, 'password123', code)
}
```

2. 追加测试：

```ts
test('非管理员上传 → 403', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const res = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData(), headers: learner.headers })
  expect(res.status).toBe(403)
})

test('未登录上传 → 401', async () => {
  const ctx = makeTestApp()
  const res = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData() })
  expect(res.status).toBe(401)
})

test('缺少文件字段 → 400 missing_file', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const fd = new FormData()
  fd.set('title', '没有文件')
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'missing_file' })
})

test('超过大小上限 → 413 file_too_large（上限设为 1MB）', async () => {
  const ctx = makeTestApp({ maxUploadMb: 1 })
  const admin = await registerUser(ctx, 'boss')
  const big = new Uint8Array(1024 * 1024 + 1)
  big.set(PDF) // 仍然是合法 PDF 头，但超限
  const res = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('big.pdf', big),
    headers: admin.headers,
  })
  expect(res.status).toBe(413)
})

test('魔数不识别的文件 → 415 unsupported_format', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const fd = new FormData()
  fd.set('file', new File([new TextEncoder().encode('GIF89a...')], 'fake.pdf', { type: 'application/pdf' }))
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(415)
  expect(await res.json()).toEqual({ error: 'unsupported_format' })
})

test('EPUB 上传（PK 魔数）→ 201 且落盘 .epub', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const epubBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00])
  const fd = new FormData()
  fd.set('file', new File([epubBytes], 'novel.epub', { type: 'application/epub+zip' }))
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(201)
  const { book } = (await res.json()) as { book: { id: string; format: string } }
  expect(book.format).toBe('epub')
  expect(existsSync(join(ctx.dataDir, 'books', `${book.id}.epub`))).toBe(true)
})

test('带 PNG 封面 → 201 + hasCover=true + 封面落盘', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const res = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('with-cover.pdf', PDF, { cover: new File([png], 'cover.png', { type: 'image/png' }) }),
    headers: admin.headers,
  })
  expect(res.status).toBe(201)
  const { book } = (await res.json()) as { book: { id: string; hasCover: boolean } }
  expect(book.hasCover).toBe(true)
  expect(existsSync(join(ctx.dataDir, 'covers', `${book.id}.png`))).toBe(true)
})

test('非法封面（伪造 content-type）→ 415 unsupported_cover', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('bad-cover.pdf', PDF, { cover: new File([new TextEncoder().encode('not an image')], 'c.png', { type: 'image/png' }) }),
    headers: admin.headers,
  })
  expect(res.status).toBe(415)
})
```

注意：`createLearner` 依赖 `/api/admin/invites` —— 它在 T17 实现。**若你按顺序执行，先把 T17（管理接口）提前做掉**，或暂时把这两条用到 `createLearner` 的用例跳过（`test.skip`）并在 T17 完成后恢复。推荐前者（先做 T17 再回来跑 T14）。

3. 运行：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：`Tests 10 passed (10)`。

4. commit：

```bash
git add -A && git commit -m "test(server): cover upload validation branches"
```

### T15 列表与详情（TDD，含进度联表）

**文件**：`server/src/routes/books.test.ts`（追加）、`server/src/routes/books.ts`（追加路由）

**步骤**：

1. **RED** —— 追加测试：

```ts
const uploadPdf = (ctx: ReturnType<typeof makeTestApp>, headers: { cookie: string }, title?: string) =>
  ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('a.pdf', PDF, title ? { title } : {}),
    headers,
  })

test('登录用户看列表：按上传时间倒序，含自己的进度', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  await uploadPdf(ctx, admin.headers, '第一本')
  await uploadPdf(ctx, admin.headers, '第二本')
  const res = await ctx.app.request('/api/books', { headers: admin.headers })
  expect(res.status).toBe(200)
  const { books } = (await res.json()) as { books: { title: string; progress: unknown }[] }
  expect(books.map((b) => b.title)).toEqual(['第二本', '第一本'])
  expect(books[0].progress).toBe(null)
})

test('未登录看列表 → 401', async () => {
  const ctx = makeTestApp()
  const res = await ctx.app.request('/api/books')
  expect(res.status).toBe(401)
})

test('详情：存在 200；不存在 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await uploadPdf(ctx, admin.headers)
  const { book } = (await up.json()) as { book: { id: string } }
  const ok = await ctx.app.request(`/api/books/${book.id}`, { headers: admin.headers })
  expect(ok.status).toBe(200)
  const missing = await ctx.app.request('/api/books/no-such-id', { headers: admin.headers })
  expect(missing.status).toBe(404)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：新增用例 FAIL（404/无路由），其余通过（RED）。

3. 在 `books.ts` 的 `r.post` 之后追加：

```ts
  r.get('/', requireAuth(db), (c) => {
    const user = c.get('user') as UserRow
    const rows = db.prepare(`
      SELECT b.*, p.locator AS progress_locator, p.percent AS progress_percent
      FROM books b
      LEFT JOIN progress p ON p.book_id = b.id AND p.user_id = ?
      WHERE b.visibility = 'public'
      ORDER BY b.uploaded_at DESC, b.rowid DESC
    `).all(user.id) as unknown as BookRowWithProgress[]
    return c.json({ books: rows.map(toBookDto) })
  })

  r.get('/:id', requireAuth(db), (c) => {
    const user = c.get('user') as UserRow
    const row = db.prepare(`
      SELECT b.*, p.locator AS progress_locator, p.percent AS progress_percent
      FROM books b
      LEFT JOIN progress p ON p.book_id = b.id AND p.user_id = ?
      WHERE b.id = ?
    `).get(user.id, c.req.param('id')) as unknown as BookRowWithProgress | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ book: toBookDto(row) })
  })
```

注意：`/:id` 必须声明在 `/:id/file` 与 `/:id/cover` **之后**吗？—— 不：Hono 路由按注册顺序匹配，`GET /:id/file` 与 `GET /:id` 模式不同，不会互相吞掉。按本计划给出的追加顺序即可。列表排序附了 `rowid DESC` 兜底：同一毫秒上传的两本书也能稳定倒序，避免测试闪断。

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：`Tests 13 passed (13)`。

5. commit：

```bash
git add -A && git commit -m "feat(server): add book list and detail endpoints with progress join"
```

### T16 文件流 + Range（TDD）

**文件**：`server/src/routes/books.test.ts`（追加）、`server/src/routes/books.ts`（追加路由）

**步骤**：

1. **RED** —— 追加测试：

```ts
const RANGE_CONTENT = new TextEncoder().encode('%PDF-1.4 abcdefghijklmnopqrstuvwxyz 0123456789')

test('文件流：无 Range → 200 全量 + content-type', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('r.pdf', RANGE_CONTENT),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/file`, { headers: admin.headers })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/pdf')
  expect(res.headers.get('accept-ranges')).toBe('bytes')
  expect((await res.arrayBuffer()).byteLength).toBe(RANGE_CONTENT.length)
})

test('文件流：Range 206 返回正确切片与 content-range', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('r.pdf', RANGE_CONTENT),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/file`, {
    headers: { ...admin.headers, range: 'bytes=0-3' },
  })
  expect(res.status).toBe(206)
  expect(res.headers.get('content-range')).toBe(`bytes 0-3/${RANGE_CONTENT.length}`)
  expect(await res.text()).toBe('%PDF')
})

test('文件流：非法 Range → 416', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('r.pdf', RANGE_CONTENT),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/file`, {
    headers: { ...admin.headers, range: 'bytes=99999-100000' },
  })
  expect(res.status).toBe(416)
})

test('文件流：未登录 401；不存在 404', async () => {
  const ctx = makeTestApp()
  expect((await ctx.app.request('/api/books/x/file')).status).toBe(401)
  const admin = await registerUser(ctx, 'boss')
  expect((await ctx.app.request('/api/books/x/file', { headers: admin.headers })).status).toBe(404)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：新增 4 条 FAIL（RED）。

3. 在 `books.ts` 追加：

```ts
  r.get('/:id/file', requireAuth(db), (c) => {
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(c.req.param('id')) as BookRow | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    const abs = join(dataDir, row.storage_path)
    if (!existsSync(abs)) return c.json({ error: 'not_found' }, 404)
    const size = statSync(abs).size
    const headers: Record<string, string> = {
      'content-type': CONTENT_TYPES[row.format],
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=0',
    }
    const range = parseRange(c.req.header('range') ?? null, size)
    if (range === 'invalid') {
      return c.body(null, 416, { 'content-range': `bytes */${size}` })
    }
    if (range) {
      const stream = createReadStream(abs, { start: range.start, end: range.end })
      return c.body(Readable.toWeb(stream) as ReadableStream, 206, {
        ...headers,
        'content-range': `bytes ${range.start}-${range.end}/${size}`,
        'content-length': String(range.end - range.start + 1),
      })
    }
    const stream = createReadStream(abs)
    return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
      ...headers,
      'content-length': String(size),
    })
  })
```

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：`Tests 17 passed (17)`。

5. commit：

```bash
git add -A && git commit -m "feat(server): stream book files with range support"
```

### T17 管理接口：邀请码 + 用户（TDD）

**文件**：`server/src/routes/admin.ts`、`server/src/routes/admin.test.ts`、`server/src/app.ts`（改）

**步骤**：

1. **RED** —— 创建 `server/src/routes/admin.test.ts`：

```ts
import { test, expect } from 'vitest'
import { makeTestApp, registerUser, createLearner } from '../test-helpers.js'

test('管理员生成邀请码 → 201；列表可见且未使用', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/admin/invites', { method: 'POST', headers: admin.headers })
  expect(res.status).toBe(201)
  const { invite } = (await res.json()) as { invite: { code: string; usedBy: null } }
  expect(invite.code).toMatch(/^[0-9a-f]{12}$/)
  expect(invite.usedBy).toBe(null)
  const list = await ctx.app.request('/api/admin/invites', { headers: admin.headers })
  const body = (await list.json()) as { invites: { code: string }[] }
  expect(body.invites.map((i) => i.code)).toContain(invite.code)
})

test('学员访问管理接口 → 403；匿名 → 401', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  expect((await ctx.app.request('/api/admin/invites', { headers: learner.headers })).status).toBe(403)
  expect((await ctx.app.request('/api/admin/invites')).status).toBe(401)
  expect((await ctx.app.request('/api/admin/users', { headers: learner.headers })).status).toBe(403)
})

test('用户列表包含 admin 与 learner', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  await createLearner(ctx, admin, 'alice')
  const res = await ctx.app.request('/api/admin/users', { headers: admin.headers })
  const { users } = (await res.json()) as { users: { username: string; role: string }[] }
  expect(users.map((u) => `${u.username}:${u.role}`)).toEqual(['boss:admin', 'alice:learner'])
})

test('管理员重置密码：旧密码失效、新密码可登录、旧会话被吊销', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const reset = await ctx.app.request(`/api/admin/users/${learner.user.id}/password`, {
    method: 'POST',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword: 'brand-new-pass' }),
  })
  expect(reset.status).toBe(204)
  // 旧会话失效
  expect((await ctx.app.request('/api/auth/me', { headers: learner.headers })).status).toBe(401)
  // 旧密码不能登录
  const oldLogin = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  })
  expect(oldLogin.status).toBe(401)
  // 新密码可以
  const newLogin = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'brand-new-pass' }),
  })
  expect(newLogin.status).toBe(200)
})

test('重置不存在的用户 → 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/admin/users/nope/password', {
    method: 'POST',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword: 'whatever-123' }),
  })
  expect(res.status).toBe(404)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/routes/admin.test.ts
```

预期：FAIL（404，RED）。

3. 创建 `server/src/routes/admin.ts`：

```ts
import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { resetPasswordSchema, type InviteDto } from '@oll/shared'
import type { AppOptions } from '../app.js'
import type { AppEnv, UserRow } from '../types.js'
import { deleteUserSessions, hashPassword, requireAdmin, toUserDto } from '../auth.js'
import { withTx } from '../db.js'

interface InviteRow {
  code: string
  created_by: string
  created_at: number
  used_by: string | null
  used_at: number | null
}

function toInviteDto(r: InviteRow): InviteDto {
  return { code: r.code, createdAt: r.created_at, usedBy: r.used_by, usedAt: r.used_at }
}

export function adminRoutes(opts: AppOptions): Hono<AppEnv> {
  const { db } = opts
  const r = new Hono<AppEnv>()

  r.get('/users', requireAdmin(db), (c) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as unknown as UserRow[]
    return c.json({ users: rows.map(toUserDto) })
  })

  r.post('/users/:id/password', requireAdmin(db), async (c) => {
    const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(c.req.param('id'))
    if (!target) return c.json({ error: 'not_found' }, 404)
    withTx(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(hashPassword(parsed.data.newPassword), c.req.param('id'))
      deleteUserSessions(db, c.req.param('id'))
    })
    return c.body(null, 204)
  })

  r.get('/invites', requireAdmin(db), (c) => {
    const rows = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all() as unknown as InviteRow[]
    return c.json({ invites: rows.map(toInviteDto) })
  })

  r.post('/invites', requireAdmin(db), (c) => {
    const user = c.get('user') as UserRow
    const code = randomBytes(6).toString('hex')
    const createdAt = Date.now()
    db.prepare('INSERT INTO invites (code, created_by, created_at) VALUES (?,?,?)').run(code, user.id, createdAt)
    return c.json({ invite: { code, createdAt, usedBy: null, usedAt: null } }, 201)
  })

  return r
}
```

4. 在 `app.ts` 挂载：

```ts
import { adminRoutes } from './routes/admin.js'
// createApp 内：
app.route('/api/admin', adminRoutes(opts))
```

5. 确认通过 + 回到 T14 恢复被跳过的用例（如有）：

```bash
pnpm --filter @oll/server exec vitest run
```

预期：全绿（此时应无 `test.skip`）。

6. commit：

```bash
git add -A && git commit -m "feat(server): add admin routes for invites and password reset"
```

### T18 阅读进度写入（TDD）

**文件**：`server/src/routes/books.test.ts`（追加）、`server/src/routes/books.ts`（追加路由）

**步骤**：

1. **RED** —— 追加测试：

```ts
test('进度：PUT 后列表与详情都带进度；重复 PUT 覆盖', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('p.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  const put = await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '3', percent: 60 }),
  })
  expect(put.status).toBe(204)
  const detail = await ctx.app.request(`/api/books/${book.id}`, { headers: admin.headers })
  const detailBody = (await detail.json()) as { book: { progress: { locator: string; percent: number } } }
  expect(detailBody.book.progress).toEqual({ locator: '3', percent: 60 })
  await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '9', percent: 100 }),
  })
  const list = await ctx.app.request('/api/books', { headers: admin.headers })
  const listBody = (await list.json()) as { books: { progress: { locator: string } }[] }
  expect(listBody.books[0].progress.locator).toBe('9')
})

test('进度：跨用户隔离', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('p.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '2', percent: 20 }),
  })
  const learnerList = await ctx.app.request('/api/books', { headers: learner.headers })
  const body = (await learnerList.json()) as { books: { progress: unknown }[] }
  expect(body.books[0].progress).toBe(null)
})

test('进度：非法输入 400；不存在的书 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('p.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  const bad = await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '', percent: 150 }),
  })
  expect(bad.status).toBe(400)
  const missing = await ctx.app.request('/api/books/ghost/progress', {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '1', percent: 1 }),
  })
  expect(missing.status).toBe(404)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：新增 3 条 FAIL（RED）。

3. 在 `books.ts` 追加：

```ts
  r.put('/:id/progress', requireAuth(db), async (c) => {
    const parsed = progressSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const id = c.req.param('id')
    if (!db.prepare('SELECT id FROM books WHERE id = ?').get(id)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const user = c.get('user') as UserRow
    db.prepare(`
      INSERT INTO progress (user_id, book_id, locator, percent, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET
        locator = excluded.locator, percent = excluded.percent, updated_at = excluded.updated_at
    `).run(user.id, id, parsed.data.locator, parsed.data.percent, Date.now())
    return c.body(null, 204)
  })
```

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：`Tests 20 passed (20)`。

5. commit：

```bash
git add -A && git commit -m "feat(server): add reading progress upsert endpoint"
```

### T19 封面读取与删除书籍（TDD）

**文件**：`server/src/routes/books.test.ts`（追加）、`server/src/routes/books.ts`（追加路由）

**步骤**：

1. **RED** —— 追加测试：

```ts
test('封面：有封面 200 + content-type；无封面 404 no_cover', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('c.pdf', PDF, { cover: new File([png], 'c.png', { type: 'image/png' }) }),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/cover`, { headers: admin.headers })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('image/png')
  expect(res.headers.get('cache-control')).toContain('max-age=86400')
  expect((await res.arrayBuffer()).byteLength).toBe(png.length)

  const up2 = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('nc.pdf'), headers: admin.headers })
  const { book: book2 } = (await up2.json()) as { book: { id: string } }
  const noCover = await ctx.app.request(`/api/books/${book2.id}/cover`, { headers: admin.headers })
  expect(noCover.status).toBe(404)
  expect(await noCover.json()).toEqual({ error: 'no_cover' })
})

test('删除：admin 204 且文件与行都消失；learner 403；不存在 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('d.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  expect((await ctx.app.request(`/api/books/${book.id}`, { method: 'DELETE', headers: learner.headers })).status).toBe(403)
  const del = await ctx.app.request(`/api/books/${book.id}`, { method: 'DELETE', headers: admin.headers })
  expect(del.status).toBe(204)
  expect(existsSync(join(ctx.dataDir, 'books', `${book.id}.pdf`))).toBe(false)
  expect((await ctx.app.request(`/api/books/${book.id}`, { headers: admin.headers })).status).toBe(404)
  expect((await ctx.app.request(`/api/books/${book.id}`, { method: 'DELETE', headers: admin.headers })).status).toBe(404)
})
```

2. 确认失败（RED）：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

3. 在 `books.ts` 追加：

```ts
  r.get('/:id/cover', requireAuth(db), (c) => {
    const row = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(c.req.param('id')) as
      | { cover_path: string | null }
      | undefined
    if (!row?.cover_path) return c.json({ error: 'no_cover' }, 404)
    const abs = join(dataDir, row.cover_path)
    if (!existsSync(abs)) return c.json({ error: 'no_cover' }, 404)
    const ext = row.cover_path.split('.').pop() as keyof typeof CONTENT_TYPES
    return c.body(new Uint8Array(readFileSync(abs)), 200, {
      'content-type': CONTENT_TYPES[ext],
      'cache-control': 'public, max-age=86400',
    })
  })

  r.delete('/:id', requireAdmin(db), (c) => {
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(c.req.param('id')) as BookRow | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    db.prepare('DELETE FROM books WHERE id = ?').run(row.id) // progress 级联删除（FK ON）
    rmSync(join(dataDir, row.storage_path), { force: true })
    if (row.cover_path) rmSync(join(dataDir, row.cover_path), { force: true })
    return c.body(null, 204)
  })
```

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run src/routes/books.test.ts
```

预期：`Tests 22 passed (22)`。

5. commit：

```bash
git add -A && git commit -m "feat(server): add cover serving and book deletion"
```

**Phase 3 收尾**：

```bash
pnpm -r test && pnpm -r typecheck
```

预期：全绿。commit 若有零散改动：`git commit -m "chore(server): phase 3 green"`。


## Phase 4 — 服务端引导与静态托管（T20–T22）

### T20 入口引导 `index.ts` + 手工冒烟

**文件**：`server/src/index.ts`、`server/.env`（本地新建，已 gitignore）

**步骤**：

1. 创建 `server/src/index.ts`：

```ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { openDb } from './db.js'
import { ensureDataDirs } from './files.js'

try {
  process.loadEnvFile()
} catch {
  // .env 可选（Docker 场景由 compose 注入环境变量）
}

const port = Number(process.env.PORT ?? 3000)
const dataDir = resolve(process.env.DATA_DIR ?? './data')
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 200)
const cookieSecure = process.env.COOKIE_SECURE === 'true'
const webRootEnv = process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null
const webRoot = webRootEnv && existsSync(webRootEnv) ? webRootEnv : null

ensureDataDirs(dataDir)
const db = openDb(resolve(dataDir, 'db.sqlite'))
const app = createApp({ db, dataDir, maxUploadMb, cookieSecure, webRoot })

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[oll] listening on http://localhost:${info.port} | dataDir=${dataDir} | webRoot=${webRoot ?? '(dev: 由 Vite 提供)'}`)
})
```

2. 创建 `server/.env`：

```
PORT=8787
DATA_DIR=./data
MAX_UPLOAD_MB=200
COOKIE_SECURE=false
```

3. 冒烟验证（后台启动 → curl → 关闭）：

```bash
pnpm --filter @oll/server dev &
sleep 3
curl -s http://localhost:8787/api/health
```

预期：`{"ok":true}`。

```bash
curl -si -X POST http://localhost:8787/api/auth/register -H 'content-type: application/json' -d '{"username":"admin","password":"admin12345"}' | head -20
```

预期：`HTTP/1.1 201` + `Set-Cookie: oll_session=...` + `{"user":{...,"role":"admin",...}}`。

```bash
kill %1
```

预期：进程结束（提示 `Terminated` 或命令返回无输出），随后 `server/data/` 下出现 `db.sqlite` 与 `books/`、`covers/` 目录。

4. commit：

```bash
git add -A && git commit -m "feat(server): add bootstrap entrypoint with env loading"
```

### T21 静态托管 + SPA 回退（TDD）

**文件**：`server/src/app.ts`（改）、`server/src/static.test.ts`

**步骤**：

1. **RED** —— 创建 `server/src/static.test.ts`：

```ts
import { test, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { openDb } from './db.js'

function makeStaticApp() {
  const webRoot = mkdtempSync(join(tmpdir(), 'oll-static-'))
  writeFileSync(join(webRoot, 'index.html'), '<html><body>OLL-APP</body></html>')
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-static-data-'))
  const db = openDb(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, webRoot })
  return app
}

test('根路径返回 index.html', async () => {
  const res = await makeStaticApp().request('/')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('OLL-APP')
})

test('SPA 深层路由回退到 index.html', async () => {
  const res = await makeStaticApp().request('/book/abc123')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('OLL-APP')
})

test('未匹配的 /api/* 仍是 JSON 404，而不是 index.html', async () => {
  const res = await makeStaticApp().request('/api/unknown')
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'not_found' })
})

test('未配置 webRoot 时（开发模式）非 API 路径返回 JSON 404', async () => {
  const db = openDb(':memory:')
  const app = createApp({ db, dataDir: mkdtempSync(join(tmpdir(), 'oll-dev-')), cookieSecure: false })
  const res = await app.request('/book/abc')
  expect(res.status).toBe(404)
})
```

2. 确认失败：

```bash
pnpm --filter @oll/server exec vitest run src/static.test.ts
```

预期：前 2 条 FAIL（404），后 2 条通过（RED 部分确认）。

3. 修改 `server/src/app.ts`——在 `createApp` 返回前、`notFound` **之前**插入：

```ts
import { serveStatic } from '@hono/node-server/serve-static'
// ...
  if (opts.webRoot) {
    app.use('*', serveStatic({ root: opts.webRoot }))
    app.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) return next()
      return serveStatic({ root: opts.webRoot!, path: 'index.html' })(c, next)
    })
  }
  app.notFound((c) => c.json({ error: 'not_found' }, 404))
```

（`notFound` 之后不要放任何路由。）

4. 确认通过：

```bash
pnpm --filter @oll/server exec vitest run
```

预期：全绿（server 全部测试文件通过）。

5. commit：

```bash
git add -A && git commit -m "feat(server): serve web build with spa fallback in production"
```

### T22 根级 `.env.example` 与文档片段

**文件**：`.env.example`、`README.md`（先只写运行说明，Phase 10 再补部署章节）

**步骤**：

1. 创建 `.env.example`：

```
# 复制到 server/.env 供本地开发；Docker 部署时由 docker-compose.yml 注入
PORT=8787
DATA_DIR=./data
MAX_UPLOAD_MB=200
# 走 HTTPS（反向代理）时改为 true，本地 http 保持 false
COOKIE_SECURE=false
```

2. 创建 `README.md`（v1 首版内容）：

```markdown
# OnlineLearningLab

自托管在线学习平台 v1：管理员上传 EPUB/PDF，登录用户在线阅读，进度自动保存。

## 本地开发

要求：Node ≥ 24、pnpm。

```bash
pnpm install
cp .env.example server/.env   # 首次
pnpm dev                      # server: http://localhost:8787  web: http://localhost:5173
```

首次打开 http://localhost:5173/register——**第一个注册的用户自动成为管理员**，此后注册需要邀请码（管理页生成）。

## 测试

```bash
pnpm -r test        # 单元/接口测试
pnpm test:e2e       # Playwright 端到端（首次需 pnpm exec playwright install chromium）
```

## 部署

见 Phase 10 部署章节（Docker Compose 一节）。
```

3. 验证：

```bash
git status --short
```

预期：新增 `.env.example`、`README.md`（以及可能的锁定文件变化）。

4. commit：

```bash
git add -A && git commit -m "docs: add env example and readme quickstart"
```

---

## Phase 5 — 前端骨架、主题与登录注册（T23–T24）

### T23 API 客户端 + 主题 + 纯逻辑（TDD）

**文件**：`web/src/api/client.ts`、`web/src/lib/theme.ts`、`web/src/lib/format.ts`、`web/src/lib/format.test.ts`

**步骤**：

1. **RED** —— 创建 `web/src/lib/format.test.ts`：

```ts
import { test, expect } from 'vitest'
import { formatBytes, formatPercent } from './format'

test('formatBytes 边界', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(512)).toBe('512 B')
  expect(formatBytes(1024)).toBe('1.0 KB')
  expect(formatBytes(1536)).toBe('1.5 KB')
  expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB')
})

test('formatPercent 取整', () => {
  expect(formatPercent(0)).toBe('0%')
  expect(formatPercent(45.6)).toBe('46%')
  expect(formatPercent(100)).toBe('100%')
})
```

2. 确认失败：

```bash
pnpm --filter @oll/web exec vitest run src/lib/format.test.ts
```

预期：FAIL（找不到模块 ./format，RED）。

3. 创建三个模块：

`web/src/lib/format.ts`：

```ts
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export function formatPercent(p: number): string {
  return `${Math.round(p)}%`
}
```

`web/src/lib/theme.ts`：

```ts
export type Theme = 'light' | 'dark'

const KEY = 'oll-theme'

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(KEY, theme)
}
```

`web/src/api/client.ts`：

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    let message = res.statusText || 'request failed'
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // 非 JSON 响应，保留状态文本
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
```

4. 确认通过：

```bash
pnpm --filter @oll/web exec vitest run src/lib/format.test.ts
```

预期：`Tests 2 passed (2)`。

5. commit：

```bash
git add -A && git commit -m "feat(web): add api client, theme and format utils"
```

### T24 路由骨架 + 登录/注册页

**文件**：`web/src/main.tsx`、`web/src/App.tsx`、`web/src/auth/RequireAuth.tsx`、`web/src/auth/LoginPage.tsx`、`web/src/auth/RegisterPage.tsx`、`web/src/pages/LibraryPage.tsx`（占位）、`web/src/pages/ReaderPage.tsx`（占位）、`web/src/pages/AdminPage.tsx`（占位）

**步骤**：

1. 安装路由与 Query（T06 已装 react-router 与 @tanstack/react-query）：

```bash
pnpm --filter @oll/web exec tsc -b
```

先跑一次确认当前脚手架可编译（无输出即通过）。

2. 创建 `web/src/auth/RequireAuth.tsx`：

```tsx
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router'
import type { ReactNode } from 'react'
import type { UserDto } from '@oll/shared'
import { api } from '../api/client'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<{ user: UserDto }>('/api/auth/me')).user,
  })
}

export function RequireAuth({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const me = useMe()
  if (me.isPending) return <div className="p-8 text-center text-gray-400">加载中…</div>
  if (me.isError) return <Navigate to="/login" replace />
  if (adminOnly && me.data.role !== 'admin') return <Navigate to="/library" replace />
  return <>{children}</>
}
```

3. 创建 `web/src/auth/LoginPage.tsx`：

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/login', { username, password })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/library')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? '用户名或密码错误' : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold">登录 · 在线学习平台</h1>
        <input
          data-testid="login-username"
          className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          data-testid="login-password"
          className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          placeholder="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p data-testid="login-error" className="text-sm text-red-500">{error}</p>}
        <button
          data-testid="login-submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
        <p className="text-sm text-gray-500">
          没有账号？<Link className="text-blue-600 hover:underline" to="/register">注册</Link>
        </p>
      </form>
    </div>
  )
}
```

4. 创建 `web/src/auth/RegisterPage.tsx`（与登录页同构，多一个邀请码输入，data-testid 用 `register-*`）：

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'

export function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/register', {
        username,
        password,
        inviteCode: inviteCode.trim() ? inviteCode.trim() : undefined,
      })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/library')
    } catch (err) {
      const map: Record<string, string> = {
        invite_required: '该平台已有用户，注册需要邀请码',
        invalid_invite: '邀请码无效或已被使用',
        username_taken: '用户名已被占用',
        invalid_input: '输入不合法：用户名 3-32 位字母数字下划线，密码至少 8 位',
      }
      setError(err instanceof ApiError ? map[err.message] ?? '注册失败，请重试' : '注册失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold">注册 · 在线学习平台</h1>
        <p className="text-xs text-gray-500">如果你是第一个用户，将自动成为管理员，无需邀请码。</p>
        <input data-testid="register-username" className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="用户名"
          value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <input data-testid="register-password" className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="密码（至少 8 位）" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <input data-testid="register-invite" className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="邀请码（首个用户留空）"
          value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
        {error && <p data-testid="register-error" className="text-sm text-red-500">{error}</p>}
        <button data-testid="register-submit" disabled={busy} className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '注册中…' : '注册'}
        </button>
        <p className="text-sm text-gray-500">已有账号？<Link className="text-blue-600 hover:underline" to="/login">登录</Link></p>
      </form>
    </div>
  )
}
```

5. 占位页（Phase 6/7/9 再实现）：

`web/src/pages/LibraryPage.tsx`、`web/src/pages/ReaderPage.tsx`、`web/src/pages/AdminPage.tsx` 先各写：

```tsx
export function LibraryPage() { return <div className="p-8">书架（待实现）</div> }
```

（ReaderPage、AdminPage 同理。）

6. 替换 `web/src/App.tsx`：

```tsx
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './auth/LoginPage'
import { RegisterPage } from './auth/RegisterPage'
import { LibraryPage } from './pages/LibraryPage'
import { ReaderPage } from './pages/ReaderPage'
import { AdminPage } from './pages/AdminPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/library', element: <RequireAuth><LibraryPage /></RequireAuth> },
  { path: '/book/:id', element: <RequireAuth><ReaderPage /></RequireAuth> },
  { path: '/admin', element: <RequireAuth adminOnly><AdminPage /></RequireAuth> },
  { path: '*', element: <Navigate to="/library" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
```

7. 替换 `web/src/main.tsx`：

```tsx
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { applyTheme, getTheme } from './lib/theme'

applyTheme(getTheme())

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

// 有意的选择：不用 <StrictMode>。开发模式下它会双跑 effect，
// 让 epub.js / pdf.js 这类"创建实例 + iframe/canvas"的组件出现难以排查的重复挂载问题。
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
```

8. 端到端冒烟（两个终端或后台）：

```bash
pnpm dev &
sleep 6
curl -s http://localhost:5173/ | head -3
curl -s http://localhost:5173/api/health
```

预期：第一条返回含 `<title>` 或 `<div id="root">` 的 HTML；第二条 `{"ok":true}`（证明 Vite 代理生效）。浏览器打开 http://localhost:5173/register 手工注册第一用户（用户名 `admin`，密码 ≥8 位），应跳转到 `/library` 且看到"书架（待实现）"。

```bash
kill %1
```

9. commit：

```bash
git add -A && git commit -m "feat(web): add router, query client, theme and auth pages"
```

---

## Phase 6 — 书架与上传（T25–T26）

### T25 书架页 + BookCard + 顶部栏

**文件**：`web/src/pages/LibraryPage.tsx`（替换占位）、`web/src/components/BookCard.tsx`

**步骤**：

1. 创建 `web/src/components/BookCard.tsx`：

```tsx
import { Link } from 'react-router'
import type { BookDto } from '@oll/shared'

export function BookCard({ book }: { book: BookDto }) {
  return (
    <Link data-testid="book-card" to={`/book/${book.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
        {book.hasCover ? (
          <img
            data-testid="cover-img"
            src={`/api/books/${book.id}/cover`}
            alt={book.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl">{book.format === 'epub' ? '📖' : '📄'}</div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {book.format.toUpperCase()}
        </span>
      </div>
      <div className="mt-2 truncate font-medium" title={book.title}>{book.title}</div>
      <div className="truncate text-sm text-gray-500">{book.author ?? '未知作者'}</div>
      {book.progress ? (
        <div data-testid="progress-bar" className="mt-1 h-1.5 overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
          <div className="h-full bg-blue-500" style={{ width: `${book.progress.percent}%` }} />
        </div>
      ) : null}
    </Link>
  )
}
```

2. 替换 `web/src/pages/LibraryPage.tsx`：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BookDto } from '@oll/shared'
import { api } from '../api/client'
import { useMe } from '../auth/RequireAuth'
import { BookCard } from '../components/BookCard'
import { UploadDialog } from '../components/UploadDialog'
import { applyTheme, getTheme } from '../lib/theme'

export function LibraryPage() {
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const theme = getTheme()

  const books = useQuery({
    queryKey: ['books'],
    queryFn: async () => (await api.get<{ books: BookDto[] }>('/api/books')).books,
  })

  async function onLogout() {
    await api.post('/api/auth/logout')
    qc.clear()
    navigate('/login')
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
    navigate(0) // 简单粗暴地重挂载以刷新主题渲染；v1 可接受
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">书架</h1>
        <div className="flex items-center gap-3 text-sm">
          {me.data?.role === 'admin' && (
            <>
              <button data-testid="upload-button" onClick={() => setUploadOpen(true)}
                className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">
                上传书籍
              </button>
              <button data-testid="admin-link" onClick={() => navigate('/admin')}
                className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
                管理
              </button>
            </>
          )}
          <button data-testid="theme-toggle" onClick={toggleTheme}
            className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
          <span className="text-gray-500">{me.data?.username}</span>
          <button data-testid="logout-button" onClick={onLogout}
            className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
            退出
          </button>
        </div>
      </header>

      {books.isPending && <p className="text-gray-400">加载中…</p>}
      {books.isError && <p className="text-red-500">书架加载失败，请刷新重试</p>}
      {books.data?.length === 0 && (
        <p data-testid="empty-state" className="py-24 text-center text-gray-400">
          书架还是空的{me.data?.role === 'admin' ? '，点右上角「上传书籍」添加第一本吧' : ''}
        </p>
      )}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {books.data?.map((b) => <BookCard key={b.id} book={b} />)}
      </div>

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            void qc.invalidateQueries({ queryKey: ['books'] })
            setUploadOpen(false)
          }}
        />
      )}
    </div>
  )
}
```

3. 创建 `web/src/components/UploadDialog.tsx` 的**临时占位**（T26 实现完整逻辑），保证本步可编译：

```tsx
export function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  void onClose
  void onUploaded
  return <div />
}
```

4. 验证（dev 模式下浏览器手工检查）：

```bash
pnpm dev &
sleep 6
curl -s http://localhost:5173/api/books
kill %1
```

预期：`{"error":"unauthorized"}`（未带 Cookie 的 curl 被 401，属正常；浏览器里登录后应显示空书架文案）。

5. commit：

```bash
git add -A && git commit -m "feat(web): add library page with book grid and shell nav"
```

### T26 上传弹窗 + 客户端元数据/封面提取

**文件**：`web/src/reader/extract.ts`、`web/src/components/UploadDialog.tsx`（替换占位）

**步骤**：

1. 安装阅读器依赖（本步只用到提取能力）：

```bash
pnpm --filter @oll/web add epubjs react-pdf pdfjs-dist
```

装完立刻检查两件事并记下版本（后续步骤依赖）：

```bash
node -e "console.log(require('pdfjs-dist/package.json').version)" --prefix web 2>/dev/null || cat web/node_modules/pdfjs-dist/package.json | grep '"version"' | head -1
cat web/node_modules/react-pdf/package.json | grep '"version"' | head -1
```

预期：打印两个版本号。**若 react-pdf 依赖的 pdfjs-dist 与直接安装的大版本不一致，重新按 `pnpm --filter @oll/web add pdfjs-dist@<react-pdf 要求的版本>` 对齐**（react-pdf 的 package.json 里 `peerDependencies`/`dependencies` 有说明）。

2. 创建 `web/src/reader/extract.ts`：

```ts
import ePub from 'epubjs'
import * as pdfjs from 'pdfjs-dist'

// 必须与 PdfReader 中的写法一致：单行 new URL（Vite ≥7.1 对多行写法有已知回归）
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export interface ExtractedMeta {
  title: string | null
  author: string | null
  cover: Blob | null
}

export async function extractMeta(file: File): Promise<ExtractedMeta> {
  const bytes = await file.arrayBuffer()
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.epub')) return extractEpub(bytes)
  return extractPdf(bytes)
}

async function extractPdf(bytes: ArrayBuffer): Promise<ExtractedMeta> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  try {
    const meta = await doc.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string }
    const cover = await renderFirstPage(doc)
    return {
      title: info.Title?.trim() || null,
      author: info.Author?.trim() || null,
      cover,
    }
  } finally {
    void doc.destroy()
  }
}

async function renderFirstPage(doc: pdfjs.PDFDocumentProxy): Promise<Blob | null> {
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 400 / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvasContext: ctx, viewport } as never).promise
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  } catch {
    return null
  }
}

async function extractEpub(bytes: ArrayBuffer): Promise<ExtractedMeta> {
  const book = ePub(bytes)
  try {
    await book.ready
    const meta = (await book.loaded.metadata) as { title?: string; creator?: string } | undefined
    let cover: Blob | null = null
    try {
      const coverUrl = await book.coverUrl()
      if (coverUrl) cover = await (await fetch(coverUrl)).blob()
    } catch {
      // 无封面不致命
    }
    return {
      title: meta?.title?.trim() || null,
      author: meta?.creator?.trim() || null,
      cover,
    }
  } finally {
    book.destroy()
  }
}
```

（`as never` 是给 pdfjs 版本的 render 参数留的逃生舱；若你的 pdfjs 版本类型完全匹配，去掉即可。）

3. 替换 `web/src/components/UploadDialog.tsx`：

```tsx
import { useRef, useState } from 'react'
import type { BookDto } from '@oll/shared'
import { api, ApiError } from '../api/client'
import { extractMeta } from '../reader/extract'

export function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      setStatus('正在解析文件…')
      const meta = await extractMeta(file)
      setStatus('正在上传…')
      const form = new FormData()
      form.set('file', file)
      form.set('title', meta.title ?? file.name.replace(/\.[^.]+$/, ''))
      if (meta.author) form.set('author', meta.author)
      if (meta.cover) form.set('cover', meta.cover, 'cover.jpg')
      await api.postForm<{ book: BookDto }>('/api/books', form)
      setStatus('上传成功')
      onUploaded()
    } catch (err) {
      const map: Record<string, string> = {
        file_too_large: '文件超过大小上限',
        unsupported_format: '不支持的格式（仅 EPUB / PDF）',
        unsupported_cover: '封面格式不支持',
      }
      setError(err instanceof ApiError ? map[err.message] ?? `上传失败：${err.message}` : '上传失败，请重试')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        data-testid="upload-dialog"
        className="w-96 space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">上传书籍</h2>
        <p className="text-sm text-gray-500">支持 EPUB / PDF，默认上限 200MB。标题与封面将自动从文件中提取。</p>
        <input
          ref={inputRef}
          data-testid="upload-input"
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
          className="block w-full text-sm"
        />
        {status && <p data-testid="upload-status" className="text-sm text-blue-600">{status}</p>}
        {error && <p data-testid="upload-error" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
```

注意：`<input type="file">` 的 `onChange` 只有用户真实点击才触发；Playwright E2E 用 `setInputFiles` 驱动（即使元素 `display:none` 也可）。

4. 验证：

```bash
pnpm --filter @oll/web exec tsc -b
```

预期：无类型错误。然后手工：`pnpm dev`，浏览器登录 admin → 点"上传书籍" → 选一个本地 EPUB/PDF → 弹窗出现"正在解析文件…→正在上传…" → 书架出现新卡片（有封面则显示封面）。

5. commit：

```bash
git add -A && git commit -m "feat(web): add upload dialog with client-side metadata and cover extraction"
```

---

## Phase 7 — EPUB 阅读器（T27–T28）

### T27 进度保存 Hook + 防抖工具

**文件**：`web/src/lib/debounce.ts`、`web/src/lib/useProgressSaver.ts`

**步骤**：

1. 创建 `web/src/lib/debounce.ts`：

```ts
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
}
```

2. 创建 `web/src/lib/useProgressSaver.ts`：

```ts
import { useEffect, useMemo, useRef } from 'react'
import { debounce } from './debounce'
import { api } from '../api/client'

/**
 * 阅读进度保存：事件触发后 2 秒防抖落库；
 * 组件卸载（切页/关标签）时用最后一次位置补一次保存。
 */
export function useProgressSaver(bookId: string) {
  const lastRef = useRef<{ locator: string; percent: number } | null>(null)

  const save = useMemo(
    () =>
      debounce((locator: string, percent: number) => {
        void api.put(`/api/books/${bookId}/progress`, { locator, percent }).catch(() => {
          // 静默失败：阅读体验优先，下次事件会重试
        })
      }, 2000),
    [bookId],
  )

  useEffect(() => {
    return () => {
      if (lastRef.current) {
        void api.put(`/api/books/${bookId}/progress`, lastRef.current).catch(() => {})
      }
    }
  }, [bookId])

  return (locator: string, percent: number) => {
    lastRef.current = { locator, percent }
    save(locator, percent)
  }
}
```

3. 验证：

```bash
pnpm --filter @oll/web exec tsc -b
```

预期：无类型错误。

4. commit：

```bash
git add -A && git commit -m "feat(web): add progress saver hook with debounce and unload flush"
```

### T28 EpubReader 组件 + 阅读页装配

**文件**：`web/src/reader/EpubReader.tsx`、`web/src/components/Toc.tsx`、`web/src/pages/ReaderPage.tsx`（替换占位）

**步骤**：

1. 创建 `web/src/components/Toc.tsx`（EPUB/PDF 共用）：

```tsx
export interface TocItem {
  label: string
  onSelect: () => void
}

export function Toc({ items, onClose }: { items: TocItem[]; onClose: () => void }) {
  return (
    <aside data-testid="toc-panel" className="absolute left-0 top-0 z-40 h-full w-72 overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">目录</h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">关闭</button>
      </div>
      {items.length === 0 && <p className="text-sm text-gray-400">本书没有可用目录</p>}
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i}>
            <button data-testid="toc-item" onClick={item.onSelect} className="w-full truncate text-left text-sm hover:text-blue-600">
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

2. 创建 `web/src/reader/EpubReader.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import { Toc } from '../components/Toc'
import { getTheme, applyTheme, type Theme } from '../lib/theme'

interface Props {
  url: string
  initialLocator: string | null
  onProgress: (locator: string, percent: number) => void
}

export function EpubReader({ url, initialLocator, onProgress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<any>(null)
  const locationsReadyRef = useRef(false)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const [tocItems, setTocItems] = useState<{ label: string; href: string }[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [fontScale, setFontScale] = useState(100)
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const book = ePub(url)
    const rendition = book.renderTo(container, { width: '100%', height: '100%', flow: 'paginated' })
    renditionRef.current = rendition

    rendition.themes.register('light', { body: { background: '#ffffff', color: '#111827' } })
    rendition.themes.register('dark', { body: { background: '#111827', color: '#e5e7eb' } })
    rendition.themes.select(getTheme() === 'dark' ? 'dark' : 'light')

    rendition.on('relocated', (location: any) => {
      const cfi: string = location?.start?.cfi
      if (!cfi) return
      let pct = 0
      if (locationsReadyRef.current) {
        const raw = book.locations.percentageFromCfi(cfi)
        pct = raw == null ? 0 : Math.round(raw * 100)
      }
      setPercent(pct)
      onProgressRef.current(cfi, pct)
    })

    void book.loaded.navigation.then((nav: any) => {
      setTocItems((nav?.toc ?? []).map((item: any) => ({ label: String(item.label ?? '').trim() || '未命名章节', href: item.href })))
    })

    void book.ready
      .then(() => book.locations.generate(1600))
      .then(() => {
        locationsReadyRef.current = true
      })
      .catch(() => {
        // 位置表生成失败：进度将回退为 0%，阅读不受影响
      })

    void rendition.display(initialLocator ?? undefined)

    return () => {
      rendition.destroy()
      book.destroy()
      renditionRef.current = null
      locationsReadyRef.current = false
    }
  }, [url]) // initialLocator 只取首次值：由 ReaderPage 保证挂载时已拿到

  useEffect(() => {
    const size = Math.round(16 * (fontScale / 100))
    renditionRef.current?.themes.fontSize(`${size}px`)
  }, [fontScale])

  useEffect(() => {
    renditionRef.current?.themes.select(theme === 'dark' ? 'dark' : 'light')
    applyTheme(theme)
  }, [theme])

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
        <button data-testid="toc-button" onClick={() => setTocOpen((v) => !v)}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">目录</button>
        <button data-testid="epub-prev" onClick={() => void renditionRef.current?.prev()}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">上一页</button>
        <button data-testid="epub-next" onClick={() => void renditionRef.current?.next()}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">下一页</button>
        <span className="mx-2 text-gray-400">|</span>
        <button data-testid="font-decrease" onClick={() => setFontScale((v) => Math.max(70, v - 10))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">A-</button>
        <button data-testid="font-increase" onClick={() => setFontScale((v) => Math.min(180, v + 10))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">A+</button>
        <span className="mx-2 text-gray-400">|</span>
        <button data-testid="reader-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
        <span data-testid="progress-text" className="ml-auto text-gray-500">{percent}%</span>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1" />

      {tocOpen && (
        <Toc
          items={tocItems.map((item) => ({
            label: item.label,
            onSelect: () => {
              void renditionRef.current?.display(item.href)
              setTocOpen(false)
            },
          }))}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  )
}
```

3. 替换 `web/src/pages/ReaderPage.tsx`：

```tsx
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { BookDto } from '@oll/shared'
import { api } from '../api/client'
import { useProgressSaver } from '../lib/useProgressSaver'
import { EpubReader } from '../reader/EpubReader'
import { PdfReader } from '../reader/PdfReader'

export function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const saveProgress = useProgressSaver(id ?? '')

  const book = useQuery({
    queryKey: ['book', id],
    queryFn: async () => (await api.get<{ book: BookDto }>(`/api/books/${id}`)).book,
    enabled: Boolean(id),
  })

  if (book.isPending) return <div className="p-8 text-center text-gray-400">加载中…</div>
  if (book.isError || !book.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">书籍不存在或已被删除</p>
        <button onClick={() => navigate('/library')} className="mt-4 rounded bg-blue-600 px-4 py-2 text-white">返回书架</button>
      </div>
    )
  }

  const b = book.data
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <button data-testid="back-to-library" onClick={() => navigate('/library')}
          className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700">← 书架</button>
        <h1 data-testid="reader-title" className="truncate font-medium">{b.title}</h1>
        <span className="ml-auto text-sm text-gray-400">{b.author ?? ''}</span>
      </div>
      <div className="min-h-0 flex-1">
        {b.format === 'epub' ? (
          <EpubReader url={`/api/books/${b.id}/file`} initialLocator={b.progress?.locator ?? null} onProgress={saveProgress} />
        ) : (
          <PdfReader url={`/api/books/${b.id}/file`} initialLocator={b.progress?.locator ?? null} onProgress={saveProgress} />
        )}
      </div>
    </div>
  )
}
```

注意：`ReaderPage` 引用了 `PdfReader`——T29 之前它会编译失败。**先创建 `web/src/reader/PdfReader.tsx` 的空壳**：

```tsx
export function PdfReader(_props: { url: string; initialLocator: string | null; onProgress: (locator: string, percent: number) => void }) {
  return <div className="p-8 text-gray-400">PDF 阅读器（待实现）</div>
}
```

（T29 用真实实现替换它。）

4. 验证：

```bash
pnpm --filter @oll/web exec tsc -b
pnpm dev &
sleep 6
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/book/anything
kill %1
```

预期：tsc 无错误；curl 输出 `200`（SPA 返回 HTML 外壳）。

手工验证（重要）：浏览器上传一本真实中文 EPUB → 点开 → 应看到正文分页；翻页、目录跳转、A+/A-/深色切换均生效；等约 5 秒后刷新页面 → 阅读位置应恢复到刚才的位置（进度保存生效），书架卡片出现蓝色进度条。

5. commit：

```bash
git add -A && git commit -m "feat(web): add epub reader with toc, fonts, themes and progress"
```

---

## Phase 8 — PDF 阅读器（T29）

### T29 PdfReader 实现

**文件**：`web/src/reader/PdfReader.tsx`（替换空壳）

**步骤**：

0. 先确认当前 react-pdf 版本的样式文件路径（版本差异最容易踩的一处）：

```bash
ls web/node_modules/react-pdf/dist/Page/ | grep -i css
```

预期：列出 `AnnotationLayer.css`、`TextLayer.css`。若不是这两个路径（例如在 `dist/esm/Page/` 下），把下一条代码顶部的两个 CSS import 替换为实际存在的路径。

1. 替换 `web/src/reader/PdfReader.tsx`：

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Toc } from '../components/Toc'
import { applyTheme, getTheme, type Theme } from '../lib/theme'

// ⚠️ 必须与 <Document> 在同一模块内配置 worker（react-pdf 会在自身模块加载时写入默认值）；
// ⚠️ new URL(...) 必须写成单行（Vite ≥ 7.1 对多行写法有已知回归）。
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface Props {
  url: string
  initialLocator: string | null
  onProgress: (locator: string, percent: number) => void
}

export function PdfReader({ url, initialLocator, onProgress }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const initialPage = initialLocator ? Math.max(1, Number.parseInt(initialLocator, 10) || 1) : 1
  const [page, setPage] = useState(initialPage)
  const [numPages, setNumPages] = useState(0)
  const [baseWidth, setBaseWidth] = useState(720)
  const [zoom, setZoom] = useState(1)
  const [tocItems, setTocItems] = useState<{ label: string; page: number }[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function measure() {
      const w = wrapRef.current?.clientWidth ?? window.innerWidth
      setBaseWidth(Math.max(240, Math.min(900, w - 32)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (numPages > 0) onProgressRef.current(String(page), Math.round((page / numPages) * 100))
  }, [page, numPages])

  const goTo = useCallback(
    (p: number) => {
      setPage((prev) => {
        const max = numPages || 1
        return p < 1 ? 1 : p > max ? max : p
      })
    },
    [numPages],
  )

  async function onLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages)
    setTocItems(await loadOutline(pdf))
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
        <button data-testid="toc-button" onClick={() => setTocOpen((v) => !v)} disabled={tocItems.length === 0}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-700">目录</button>
        <button data-testid="page-prev" onClick={() => goTo(page - 1)} disabled={page <= 1}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-700">上一页</button>
        <span className="flex items-center gap-1">
          <input
            data-testid="page-input"
            type="number"
            min={1}
            max={numPages || 1}
            value={page}
            onChange={(e) => goTo(Number.parseInt(e.target.value, 10) || 1)}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-center dark:border-gray-700 dark:bg-gray-950"
          />
          <span className="text-gray-500">/ {numPages || '…'}</span>
        </span>
        <button data-testid="page-next" onClick={() => goTo(page + 1)} disabled={numPages > 0 && page >= numPages}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-700">下一页</button>
        <span className="mx-2 text-gray-400">|</span>
        <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">缩小</button>
        <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">放大</button>
        <span className="mx-2 text-gray-400">|</span>
        <button data-testid="reader-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
        <span data-testid="progress-text" className="ml-auto text-gray-500">
          {numPages > 0 ? Math.round((page / numPages) * 100) : 0}%
        </span>
      </div>

      <div ref={wrapRef} data-testid="pdf-viewer" className="min-h-0 flex-1 overflow-auto bg-gray-200 p-4 dark:bg-gray-900">
        {error && <p className="p-4 text-red-500">{error}</p>}
        <Document
          file={url}
          onLoadSuccess={(pdf) => void onLoadSuccess(pdf)}
          onLoadError={() => setError('PDF 加载失败')}
          loading={<p className="text-gray-500">PDF 加载中…</p>}
          className="flex justify-center"
        >
          <Page pageNumber={page} width={Math.round(baseWidth * zoom)} className="shadow-lg" />
        </Document>
      </div>

      {tocOpen && (
        <Toc
          items={tocItems.map((item) => ({
            label: item.label,
            onSelect: () => {
              goTo(item.page)
              setTocOpen(false)
            },
          }))}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  )
}

async function loadOutline(pdf: PDFDocumentProxy): Promise<{ label: string; page: number }[]> {
  const outline = await pdf.getOutline().catch(() => null)
  if (!outline) return []
  const items: { label: string; page: number }[] = []
  for (const entry of outline) {
    try {
      const dest = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest
      if (!dest || !Array.isArray(dest) || dest.length === 0) continue
      const index = await pdf.getPageIndex(dest[0] as never)
      items.push({ label: String(entry.title ?? '').trim() || '未命名章节', page: index + 1 })
    } catch {
      // 个别目的式解析失败不影响其余目录项
    }
  }
  return items
}
```

说明：主题切换对"整页图片"不适用（v1 有意不做 canvas 反色——图片类书籍反色会变丑）；深色模式作用于外围 UI 与工具栏。

2. 验证：

```bash
pnpm --filter @oll/web exec tsc -b
```

预期：无类型错误。

手工验证：上传一本真实 PDF（多页）→ 打开 → 文档渲染为 canvas；翻页/页码输入/缩放生效；等 2 秒刷新页面 → 回到此前页码；书架进度条按比例增长；`F12 Console` 无 worker 报错（若出现 `Setting up fake worker failed`，见风险 R2 的排查条目）。

3. commit：

```bash
git add -A && git commit -m "feat(web): add pdf reader with navigation, outline and progress"
```

---

## Phase 9 — 管理页（T30）

### T30 AdminPage：邀请码与用户管理

**文件**：`web/src/pages/AdminPage.tsx`（替换占位）

**步骤**：

1. 替换 `web/src/pages/AdminPage.tsx`：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InviteDto, UserDto } from '@oll/shared'
import { api, ApiError } from '../api/client'

export function AdminPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get<{ users: UserDto[] }>('/api/admin/users')).users,
  })
  const invites = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: async () => (await api.get<{ invites: InviteDto[] }>('/api/admin/invites')).invites,
  })

  const createInvite = useMutation({
    mutationFn: async () => (await api.post<{ invite: InviteDto }>('/api/admin/invites')).invite,
    onSuccess: (invite) => {
      setMessage(`已生成邀请码：${invite.code}`)
      void qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
  })

  const resetPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await api.post(`/api/admin/users/${id}/password`, { newPassword: password })
    },
    onSuccess: () => {
      setMessage('密码已重置，该用户的所有登录会话已失效')
      setResetFor(null)
      setNewPassword('')
    },
    onError: (err) => {
      setMessage(err instanceof ApiError && err.message === 'invalid_input' ? '密码至少需要 8 位' : '重置失败')
    },
  })

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate('/library')} className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700">
          ← 书架
        </button>
        <h1 className="text-2xl font-bold">管理</h1>
      </header>

      {message && <p data-testid="admin-message" className="mb-4 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">{message}</p>}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">邀请码</h2>
          <button data-testid="invite-generate" onClick={() => createInvite.mutate()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">生成邀请码</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
              <th className="py-2">邀请码</th><th>状态</th><th>生成时间</th>
            </tr>
          </thead>
          <tbody>
            {invites.data?.map((inv) => (
              <tr key={inv.code} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2 font-mono" data-testid="invite-code">{inv.code}</td>
                <td>{inv.usedBy ? '已使用' : '未使用'}</td>
                <td>{new Date(inv.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">用户</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
              <th className="py-2">用户名</th><th>角色</th><th>注册时间</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-900" data-testid="user-row">
                <td className="py-2">{u.username}</td>
                <td>{u.role === 'admin' ? '管理员' : '学员'}</td>
                <td>{new Date(u.createdAt).toLocaleString()}</td>
                <td className="text-right">
                  {resetFor === u.id ? (
                    <span className="inline-flex items-center gap-2">
                      <input
                        data-testid="reset-input"
                        type="password"
                        placeholder="新密码"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-32 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                      />
                      <button data-testid="reset-submit" onClick={() => resetPassword.mutate({ id: u.id, password: newPassword })}
                        className="rounded bg-blue-600 px-2 py-1 text-white">确认</button>
                      <button onClick={() => setResetFor(null)} className="text-gray-500">取消</button>
                    </span>
                  ) : (
                    <button data-testid="reset-start" onClick={() => { setResetFor(u.id); setNewPassword('') }}
                      className="text-blue-600 hover:underline">重置密码</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
```

2. 验证：

```bash
pnpm --filter @oll/web exec tsc -b
pnpm dev &
sleep 6
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/admin
kill %1
```

预期：tsc 无错误；curl `200`。

手工验证：以 admin 登录 → 书架 → 管理：生成邀请码（出现在表格）；按码注册第二个账号（`register` 页）→ 用户列表出现学员；重置该学员密码 → 学员下次访问被踢回登录页。

3. commit：

```bash
git add -A && git commit -m "feat(web): add admin page for invites and user management"
```

**Phase 5–9 收尾**：

```bash
pnpm -r test && pnpm -r typecheck && pnpm -r build
```

预期：全部通过，`web/dist/`、`server/dist/`、`shared/dist/` 均产出。


## Phase 10 — Docker 交付（T31–T33）

### T31 Dockerfile + .dockerignore

**文件**：`Dockerfile`、`.dockerignore`

**步骤**：

1. 创建 `.dockerignore`：

```
node_modules
**/node_modules
**/dist
data
server/data
e2e
.hermes
.git
.gitignore
playwright-report
test-results
*.log
```

2. 创建 `Dockerfile`：

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- 构建阶段：装依赖、训构建产物、产出可独立运行的服务端 bundle ----
FROM node:26-bookworm-slim AS build
RUN npm install -g pnpm@12.5.1
WORKDIR /src
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r build
# pnpm deploy：把 @oll/server 及其生产依赖（含被注入的 @oll/shared）拷成独立可运行目录
RUN pnpm deploy --filter=@oll/server --prod /out/server
RUN mkdir -p /out/server/web-dist && cp -r web/dist/. /out/server/web-dist/

# ---- 运行阶段：只带运行时必需内容 ----
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST=/app/web-dist
WORKDIR /app
COPY --from=build /out/server/ ./
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
```

说明与兜底：

- 若 `node:26-bookworm-slim` 拉取失败（`docker pull node:26-bookworm-slim` 报 manifest unknown），把两处 `26` 改成 `24`（node:sqlite 在 24 上同样可用，无需 flag）。
- 若 `pnpm deploy --filter=@oll/server` 报 filter 语法错误，改用路径过滤：`pnpm deploy --filter=./server --prod /out/server`。
- `pnpm deploy` 需要仓库里的 lockfile 与 workspace 协议依赖（T04/T06 已用 `workspace:*` 写入）。

3. 验证构建（本步骤不启动容器）：

```bash
docker build -t online-learning-lab:dev .
```

预期：最后一行 `=> => naming to docker.io/library/online-learning-lab:dev`，退出码 0。构建期间能看到 `pnpm deploy` 执行成功。

4. commit：

```bash
git add -A && git commit -m "feat(docker): add multi-stage build with pnpm deploy"
```

### T32 docker-compose.yml + README 部署章节

**文件**：`docker-compose.yml`、`README.md`（追加）

**步骤**：

1. 创建 `docker-compose.yml`：

```yaml
services:
  app:
    build: .
    image: online-learning-lab:latest
    container_name: oll
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DATA_DIR: /data
      MAX_UPLOAD_MB: "200"
      # 前面套了 HTTPS 反向代理（如 Caddy/Nginx）后改成 "true"
      COOKIE_SECURE: "false"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

2. 在 `README.md` 末尾追加"## 部署（Docker Compose）"章节：

````markdown
## 部署（Docker Compose）

```bash
# 在仓库根目录
docker compose up -d --build
```

服务运行在 `http://<主机>:3000`。首次打开注册页，**第一个注册用户自动成为管理员**。

数据全部落在宿主机 `./data/`（SQLite 数据库 + 上传文件 + 封面）：

- 备份：`docker compose stop && tar czf oll-backup-$(date +%F).tgz data/ && docker compose start`
- 恢复：停容器后把 `data/` 解回去再启动。

公开到公网的建议（v1 不含，属于部署者职责）：在容器前面加一层 HTTPS 反向代理（如 Caddy），并把 `COOKIE_SECURE` 改为 `"true"`。
````

3. 验证：

```bash
docker compose config --quiet && echo CONFIG-OK
```

预期：输出 `CONFIG-OK`。

4. commit：

```bash
git add -A && git commit -m "feat(docker): add compose file and deployment docs"
```

### T33 容器冒烟测试（含持久化验证）

**步骤**：

1. 起服务：

```bash
docker compose up -d --build
sleep 5
docker compose ps
```

预期：`oll` 状态 `running`（`STATUS` 列显示 `Up ...`）。

2. 接口冒烟：

```bash
curl -s http://localhost:3000/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/library
```

预期：`{"ok":true}`；`200`；`200`（SPA 回退生效）。

3. 注册 + 登录 + 文件上传闭环（curl，纯 HTTP 层）：

```bash
curl -c /tmp/oll-cookies.txt -s -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"dockeradmin","password":"admin12345"}'
echo
printf '%%PDF-1.4 smoke test\n%%%%EOF\n' > /tmp/smoke.pdf
curl -b /tmp/oll-cookies.txt -s -X POST http://localhost:3000/api/books -F 'file=@/tmp/smoke.pdf' -F 'title=Docker 冒烟'
echo
curl -b /tmp/oll-cookies.txt -s http://localhost:3000/api/books
```

预期：第一条返回 `"role":"admin"`；第三条返回含 `"title":"Docker 冒烟"` 的 JSON。

4. 持久化验证：

```bash
docker compose restart
sleep 3
curl -s http://localhost:3000/api/health
curl -b /tmp/oll-cookies.txt -s http://localhost:3000/api/books | head -c 200
echo
ls -la data/
```

预期：health 仍 `{"ok":true}`；书籍列表仍在（数据在卷里）；`data/` 下有 `db.sqlite`、`books/`。

5. 收尾：

```bash
docker compose down
```

预期：容器移除，`data/` 保留（不要删，避免误删演示数据；想清空则 `rm -rf data`）。

6. 若验证过程中发现缺陷：修复 → 重新 `docker compose up -d --build` → 重跑步骤 2–4 → commit 修复（`fix(docker): ...`）。全部通过则本 Task 无代码改动；在 README 的部署章节下追加一行 "已验证：<日期> Docker Compose 冒烟通过。" 后 commit：

```bash
git add -A && git commit -m "docs: record docker smoke test pass"
```

---

## Phase 11 — 端到端测试（T34–T36）

### T34 测试文件生成脚本（PDF + EPUB fixture）

**文件**：`scripts/make-fixtures.mjs`、根 `package.json`（追加 devDeps）

**步骤**：

1. 安装依赖与浏览器驱动：

```bash
pnpm add -D -w pdf-lib jszip @playwright/test
pnpm exec playwright install chromium
```

预期：`pdf-lib`、`jszip`、`@playwright/test` 进入根 devDependencies；playwright 下载 chromium（首次较久，~150MB）。

2. 创建 `scripts/make-fixtures.mjs`：

```js
import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'

const outDir = new URL('../e2e/.fixtures/', import.meta.url)
await mkdir(outDir, { recursive: true })

// ---- PDF：2 页 + 标题/作者元数据 ----
const pdf = await PDFDocument.create()
pdf.setTitle('E2E 测试 PDF')
pdf.setAuthor('Hermes')
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (const [i, text] of ['Hello PDF page 1', 'Hello PDF page 2'].entries()) {
  const page = pdf.addPage([595, 842])
  page.drawText(text, { x: 72, y: 770, size: 24, font })
  page.drawText(`(page ${i + 1})`, { x: 72, y: 730, size: 14, font })
}
await writeFile(new URL('test.pdf', outDir), await pdf.save())

// ---- EPUB3：单章，正文含唯一标记字符串 ----
const zip = new JSZip()
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file(
  'META-INF/container.xml',
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
)
zip.file(
  'OEBPS/content.opf',
  `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:oll-e2e-0001</dc:identifier>
    <dc:title>E2E 测试 EPUB</dc:title>
    <dc:creator>Hermes</dc:creator>
    <dc:language>zh</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
)
zip.file(
  'OEBPS/nav.xhtml',
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">第 1 章</a></li></ol></nav></body>
</html>`,
)
zip.file(
  'OEBPS/chapter1.xhtml',
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第 1 章</title></head>
<body><h1>第 1 章</h1><p>Hello EPUB 正文内容 HELLO-EPUB-MARKER</p></body>
</html>`,
)
await writeFile(new URL('test.epub', outDir), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

console.log('fixtures written to e2e/.fixtures/')
```

3. 生成并验证：

```bash
node scripts/make-fixtures.mjs
ls -la e2e/.fixtures/
head -c 4 e2e/.fixtures/test.pdf; echo
head -c 4 e2e/.fixtures/test.epub | od -An -tx1 | tr -d ' \n'; echo
```

预期：`fixtures written to e2e/.fixtures/`；两个文件都存在且非空；PDF 头输出 `%PDF`；EPUB 头输出 `504b0304`（PK\x03\x04）。

4. commit：

```bash
git add -A && git commit -m "test(e2e): add fixture generator for pdf and epub"
```

### T35 Playwright 配置与全局清理

**文件**：`playwright.config.ts`、`e2e/global-setup.ts`

**步骤**：

1. 创建 `e2e/global-setup.ts`：

```ts
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

export default function globalSetup() {
  const dir = path.resolve('e2e/.data')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}
```

2. 创建 `playwright.config.ts`：

```ts
import path from 'node:path'
import { defineConfig } from '@playwright/test'

const e2eDataDir = path.resolve('e2e/.data')

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'pnpm --filter @oll/server dev',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      env: { PORT: '8787', DATA_DIR: e2eDataDir, COOKIE_SECURE: 'false' },
    },
    {
      command: 'pnpm --filter @oll/web dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```

注意：`reuseExistingServer` 本地为真 —— **跑 E2E 前先确认 8787/5173 端口没有残留的手工 dev 进程**（否则会复用它和它背后的 `server/data`，导致"第一个用户"逻辑撞车）。最稳妥的跑法：

```bash
CI=1 pnpm test:e2e   # CI=1 → 强制由 Playwright 自己拉起干净的 server（DATA_DIR=e2e/.data）
```

3. 验证配置可加载：

```bash
pnpm exec playwright --version
```

预期：打印 `Version 1.x.y`。

4. commit：

```bash
git add -A && git commit -m "test(e2e): add playwright config and global setup"
```

### T36 三幕 E2E 场景（注册上传 / PDF 阅读 / EPUB 阅读）

**文件**：`e2e/journey.spec.ts`

**步骤**：

1. 创建 `e2e/journey.spec.ts`：

```ts
import { test, expect } from '@playwright/test'
import path from 'node:path'

test.describe.configure({ mode: 'serial' }) // 三个场景共享同一后端数据，顺序执行

const FIXTURE_PDF = path.resolve('e2e/.fixtures/test.pdf')
const FIXTURE_EPUB = path.resolve('e2e/.fixtures/test.epub')
const ADMIN = { username: 'e2eadmin', password: 'e2epassword' }

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByTestId('login-username').fill(ADMIN.username)
  await page.getByTestId('login-password').fill(ADMIN.password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByRole('heading', { name: '书架' })).toBeVisible()
}

test('第一幕：注册首用户（管理员）并上传 PDF 与 EPUB', async ({ page }) => {
  await page.goto('/register')
  await page.getByTestId('register-username').fill(ADMIN.username)
  await page.getByTestId('register-password').fill(ADMIN.password)
  await page.getByTestId('register-submit').click()
  await expect(page.getByTestId('empty-state')).toBeVisible()

  await page.getByTestId('upload-button').click()
  await page.getByTestId('upload-input').setInputFiles(FIXTURE_PDF)
  await expect(page.getByTestId('book-card').filter({ hasText: 'E2E 测试 PDF' })).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('upload-button').click()
  await page.getByTestId('upload-input').setInputFiles(FIXTURE_EPUB)
  await expect(page.getByTestId('book-card').filter({ hasText: 'E2E 测试 EPUB' })).toBeVisible({ timeout: 30_000 })

  // PDF 封面（首页渲染为 JPEG）应出现在卡片上
  await expect(page.getByTestId('cover-img').first()).toBeVisible()
})

test('第二幕：PDF 阅读、翻页、进度跨刷新恢复', async ({ page }) => {
  await login(page)
  await page.getByTestId('book-card').filter({ hasText: 'E2E 测试 PDF' }).click()

  await expect(page.getByTestId('reader-title')).toHaveText('E2E 测试 PDF')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('page-next').click()
  await expect(page.getByTestId('page-input')).toHaveValue('2')

  // 进度防抖 2s 落库，留一点余量再刷新
  await page.waitForTimeout(3_000)
  await page.reload()
  await expect(page.getByTestId('page-input')).toHaveValue('2', { timeout: 30_000 })
})

test('第三幕：EPUB 正文渲染 + 目录面板', async ({ page }) => {
  await login(page)
  await page.getByTestId('book-card').filter({ hasText: 'E2E 测试 EPUB' }).click()

  await expect(page.getByTestId('reader-title')).toHaveText('E2E 测试 EPUB')
  // epub.js 把正文渲染在 iframe 里
  const frame = page.frameLocator('iframe')
  await expect(frame.getByText('HELLO-EPUB-MARKER')).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('toc-button').click()
  await expect(page.getByTestId('toc-panel')).toBeVisible()
  await expect(page.getByTestId('toc-item').first()).toContainText('第 1 章')
})
```

2. 运行（确保 8787/5173 无残留进程）：

```bash
CI=1 pnpm test:e2e
```

预期：`3 passed`（见 `3 passed (3)` 汇总行）。

3. 若失败：先看 `playwright-report/`（`pnpm exec playwright show-report`）。常见三类：
   - `page.getByTestId('...')` 找不到 → 组件里漏了对应 `data-testid`（对照附录 C 清单）。
   - PDF 画布超时 → worker 配置问题（见风险 R2）。
   - EPUB marker 不可见 → fixture 生成异常，重跑 `node scripts/make-fixtures.mjs`。
   修复后必须重跑至 `3 passed` 再 commit。

4. commit：

```bash
git add -A && git commit -m "test(e2e): add serial journey covering upload, pdf and epub reading"
```

---

## Phase 12 — 最终验收（T37）

### T37 全量验收 + 打标签

**步骤**：

1. 全量测试与静态检查：

```bash
pnpm -r test && pnpm -r typecheck && pnpm -r build
```

预期：三连全绿（server 约 57 条、shared 3 条、web 2 条约定义务单元测试通过；三个包 dist 产出）。

2. E2E 复跑：

```bash
CI=1 pnpm test:e2e
```

预期：`3 passed`。

3. Docker 冒烟复跑（T33 步骤 1–4）：

```bash
docker compose up -d --build && sleep 5
curl -s http://localhost:3000/api/health
docker compose down
```

预期：`{"ok":true}`。

4. 验收对照（逐项打勾，全部满足才算 v1 完成）：

```markdown
- [ ] 首个用户注册即管理员；后续用户必须邀请码（E2E 第一幕 + T11 单测）
- [ ] 管理员上传 EPUB/PDF，自动提取标题/作者/封面（E2E 第一幕）
- [ ] 非管理员无法上传/删除/看管理页（T14/T19/T17 单测 + UI 条件渲染）
- [ ] 所有登录用户可看书架与书籍文件（T15/T16 单测）
- [ ] EPUB 在线阅读：分页、目录、字号、深浅色、进度恢复（E2E 第三幕 + 手工）
- [ ] PDF 在线阅读：翻页、页码跳转、缩放、目录(有 outline 时)、进度恢复（E2E 第二幕）
- [ ] 进度按用户隔离（T18 单测）
- [ ] 管理员生成邀请码、重置用户密码并使旧会话失效（T17 单测）
- [ ] Docker Compose 一条命令部署 + 数据卷持久化（T33）
- [ ] 深色模式（书架/阅读器）可用（手工 + E2E 未覆盖的部分手工点一遍）
```

5. 打版本标签：

```bash
git add -A && git commit -m "chore: v1 acceptance checklist documented" --allow-empty
git tag -a v0.1.0 -m "v1: self-hosted epub/pdf reading platform"
```

预期：`git tag` 输出 `v0.1.0`。

---

## 风险、权衡与开放问题

### 风险与对策（R1–R12）

| # | 风险 | 影响面 | 对策 / 触发条件 |
|---|---|---|---|
| R1 | `node:sqlite` 在 Node 24 上仍标 Release Candidate（26 上已转正） | 全部 DB 代码 | 计划只使用最小子集 API（`DatabaseSync`/`prepare`/`run`/`get`/`all`/`exec`）。若遇到 API 缺失，换 `better-sqlite3`（API 几乎同形，只需改 `db.ts` 打开方式 + Docker 构建无需特殊处理，它是常见预编译包） |
| R2 | react-pdf worker 配置有已知坑：必须在 `<Document>` 同一模块设置 workerSrc；Vite ≥ 7.1 对**多行** `new URL(...)` 有回归 | PDF 阅读/封面提取 | 计划中两处（`extract.ts` 与 `PdfReader.tsx`）都按官方推荐写法且**单行**。若见 `Setting up fake worker failed`：确认 `web/node_modules/pdfjs-dist/build/pdf.worker.min.mjs` 存在；确认 react-pdf 与 pdfjs-dist 大版本匹配（R2 的排查命令在 T26/T29） |
| R3 | epub.js 对中文（无空格文本）的 CFI/位置映射存在历史性偏差，进度百分比可能不准 | EPUB 进度 | 若出现"中文书进度跳变/恢复偏移"，候选替换为社区修复 fork `@tianz/epubjs`（仅需改两个文件的 import）。v1 不预设替换 |
| R4 | 上传走 `parseBody()` 整文件进内存 | 进程内存 | 默认上限 200MB（`MAX_UPLOAD_MB` 可调小）；v2 若需大文件流式落盘再引入 busboy 类方案 |
| R5 | scrypt 同步哈希会短暂阻塞事件循环（登录路径 ~几十 ms） | 登录响应 | 自托管小规模可接受；v2 可移线程池（`crypto.scrypt` 异步版） |
| R6 | 无 HTTPS 时 Cookie 不 Secure；公网直连有被嗅探风险 | 安全 | compose 默认 `COOKIE_SECURE=false` 面向反代场景；README 已写明：公网务必 HTTPS 反代 + 改 true |
| R7 | 登录限流仅按用户名，不含 IP | 安全 | 代理后真实 IP 难取，先保实现最简；v2 可加 IP 维度或失败锁定期 |
| R8 | 进度最多丢 2 秒（防抖窗）+ 硬关标签页时补存可能被浏览器取消 | 阅读体验 | 可接受；v2 可换 `navigator.sendBeacon` |
| R9 | EPUB `locations.generate()` 后台生成期间百分比显示 0 | EPUB 进度 | 不阻塞阅读；生成完成后自动正常 |
| R10 | EPUB 仅校验 ZIP 魔数，伪造 .epub 的普通 ZIP 也能上传成功，阅读时才报错 | 数据质量 | v1 有意为之（零服务端解包依赖）；v2 可加服务端解包校验 mimetype |
| R11 | Tailwind v4 的 `@custom-variant dark` 写法是版本敏感项 | 样式 | 计划中已标注：语法以官方 dark-mode 文档为准（唯一允许的语法替换点） |
| R12 | Playwright 依赖下载（chromium ~150MB）与端口占用 | CI/本地 | T34 安装一次；E2E 用 `CI=1` 强制干净启动 webServer |

### 主要权衡（Tradeoffs）

- **单进程 + SQLite + 同步 API**：不追求高并发，换零运维、零外部依赖、一条命令部署。自托管个人/小团队场景是正确取舍。
- **服务端不做 EPUB 解析**（标题/封面在浏览器端提取后随上传提交）：后端保持"文件 + 元数据"的薄形态，代价是 CLI-only 上传无自动元数据（v1 无 CLI 上传需求）。
- **无 CSRF token**：依赖 `SameSite=Lax` Cookie + JSON `content-type` 前置校验。自托管场景够用；若未来开放跨站嵌入需重评。
- **无 ESLint/Prettier**：`tsc` 严格模式兜底类型，风格靠本计划代码块统一。

### 开放问题（Open Questions）

| # | 问题 | 暂定处理 |
|---|---|---|
| OQ1 | 公网部署是否内置 HTTPS（Caddy sidecar 自动证书）？ | v1 不做，README 指引外部反代；v1.1 候选 |
| OQ2 | 中文 EPUB 进度若真的出现 R3 症状，是否切 `@tianz/epubjs`？ | 出现问题再切（两个 import） |
| OQ3 | 书内全文搜索 / 批注高亮 / 笔记 | v2 候选，v1 明确不做 |
| OQ4 | 默认 200MB 上限是否合适（漫画 PDF 动辄 1GB+） | 可配 `MAX_UPLOAD_MB`；默认值上线后可调 |
| OQ5 | 多管理员 / 管理员转让 | v1 明确不做（角色不可变更）；v2 候选 |

---

## 附录

### A. 常用命令速查

```bash
pnpm install                                  # 装依赖（修改 package.json 后）
pnpm dev                                      # 同时起 server(8787) + web(5173)
pnpm -r test                                  # 全部单元/接口测试
pnpm -r typecheck                             # 全部类型检查
pnpm -r build                                 # 全部构建
CI=1 pnpm test:e2e                            # 端到端（需先 node scripts/make-fixtures.mjs）
node scripts/make-fixtures.mjs                # 生成 e2e fixtures
docker compose up -d --build                  # 部署
docker compose logs -f app                    # 看容器日志
docker compose down                           # 停部署
```

### B. 决策 → 计划落点（追溯表）

| 决策 | 落点 |
|---|---|
| D1 TS 全家桶 monorepo | T02（workspace）、T03（shared）、T04（server）、T06（web） |
| D2 多用户 + 邀请码 + 管理员重置密码 | T07（schema）、T11（注册/邀请码/首用户 admin）、T17（管理接口）、T12/T24（登录注册 UI）、T30（管理页） |
| D3 公共书库 + 预留 owner_id/visibility | T07（books 表字段）、T13（上传时写 owner_id + 'public'）、T15（列表过滤 public） |
| D4 Docker Compose | T31–T33 |
| D5 pdf.js 自绘 | T29（PdfReader）、T26（首页渲染封面） |
| D6 深色模式/字号/目录/封面 | T25（封面卡片）、T28（EPUB 目录/字号/主题）、T29（PDF 目录/缩放/主题）、T23（全局主题） |
| 多用户进度隔离 | T18（单测覆盖跨用户隔离） |

### C. data-testid 清单（E2E 选择器契约，实现时不得改名）

| testid | 所在组件 |
|---|---|
| `login-username` `login-password` `login-submit` `login-error` | LoginPage |
| `register-username` `register-password` `register-invite` `register-submit` `register-error` | RegisterPage |
| `upload-button` `admin-link` `theme-toggle` `logout-button` `empty-state` | LibraryPage |
| `book-card` `cover-img` `progress-bar` | BookCard |
| `upload-dialog` `upload-input` `upload-status` `upload-error` | UploadDialog |
| `back-to-library` `reader-title` | ReaderPage |
| `toc-button` `toc-panel` `toc-item` `reader-theme-toggle` `progress-text` | Toc / 两个 Reader |
| `epub-prev` `epub-next` `font-increase` `font-decrease` | EpubReader |
| `page-prev` `page-next` `page-input` `pdf-viewer` | PdfReader |
| `invite-generate` `invite-code` `user-row` `reset-start` `reset-input` `reset-submit` `admin-message` | AdminPage |

### D. v1 完成定义（Definition of Done）

1. `pnpm -r test && pnpm -r typecheck && pnpm -r build` 全绿。
2. `CI=1 pnpm test:e2e` → 3 passed。
3. T37 验收清单逐项打勾。
4. `docker compose up -d --build` 在干净机器（有 Docker 即可）能一条命令拉起，注册/上传/阅读闭环可用，重启数据不丢。
5. git tag `v0.1.0` 已打。
