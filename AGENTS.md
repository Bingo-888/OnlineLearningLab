# AGENTS.md

面向 AI 编码代理（人类同样适用）的项目开发指南。**开始任何任务前先读本文件。**
更深的设计决策、风险清单与验收标准见完整计划：`.hermes/plans/2026-09-27_131002-online-learning-platform.md`（本地历史档案，已在 `.gitignore` 不入库；只读不改）。

## 项目概览

自托管在线学习平台（产品阶段 **v1**，发布号与发布流程见「版本与发布」；首个 tag `v0.1.0`）：管理员上传 EPUB/PDF 进入公共书库，登录用户在线阅读，阅读进度自动保存；Docker Compose 一条命令部署。

设计取舍：单进程 + SQLite（`node:sqlite` 同步 API）+ 零外部服务，面向个人/小团队自托管。

## 技术栈与版本（实测，Node 26.7.0 / pnpm 12.5.1）

| 区域 | 技术 |
|---|---|
| 仓库 | pnpm workspace monorepo：`shared` / `server` / `web`（+ 根级 `e2e/`、`scripts/`） |
| 语言 | TypeScript 7.0（严格模式，`verbatimModuleSyntax` + `noUnusedLocals`；无 ESLint/Prettier，`tsc` 是唯一风格/类型门禁） |
| 服务端 | Hono 4.13 + `@hono/node-server` 2.1，`node:sqlite`，zod 4.6，tsx（dev） |
| 前端 | React 19.3 + react-router 8.4（data router）+ @tanstack/react-query 5.104 + Tailwind CSS 4.3（v4 `@custom-variant dark`）+ Vite 8.3 |
| 阅读器 | epub.js 0.3.93（自带类型）；react-pdf 11 + pdfjs-dist 6.3（版本由 react-pdf 锁定，勿单方面升级） |
| 测试 | Vitest 5（单元/接口，测试文件与源码同目录）＋ Playwright 1.63（E2E） |
| 运行时要求 | Node ≥ 24（`engines`；`node:sqlite` 在 24 为 RC、26 已稳定，本机用 26） |

## 快速命令（含预期输出）

```bash
pnpm install                    # 依赖变更后
pnpm dev                        # 交互终端：api→8787，web→5173（vite 代理 /api）
pnpm -r test                    # 预期：shared 3 + server 57 + web 2 = 62 passed
pnpm -r typecheck               # 预期：三个包全 Done 无错误
pnpm build                      # 预期：先过版本一致性校验，再三包 dist 产出（web 有 chunk 体积 warning，正常）
pnpm version:check              # 预期：[version] OK v0.1.0：4 个 package.json 一致，CHANGELOG 有条目
node scripts/make-fixtures.mjs  # 生成 e2e/.fixtures/test.{pdf,epub}（gitignored）
CI=1 pnpm test:e2e              # 预期：3 passed（CI=1 强制 Playwright 自拉干净服务）
docker compose up -d --build    # 部署 → http://localhost:3000（数据在 ./data）
docker compose logs -f app && docker compose down
```

## 仓库结构

```
shared/           # 契约层：zod 请求 schema + DTO 类型（server 校验与 web 表单共用）
  src/index.ts    #   全部契约都在这里
server/           # Hono API + 静态托管（生产时同容器托管 SPA）
  src/app.ts      #   createApp(opts) 依赖注入工厂（db/dataDir/maxUploadMb/cookieSecure/webRoot）
  src/index.ts    #   入口：loadEnvFile → openDb → ensureDataDirs → serve
  src/db.ts       #   openDb + PRAGMA user_version 迁移（当前 = 1）
  src/schema.ts   #   5 张表 DDL：users / sessions / invites / books / progress
  src/auth.ts     #   scrypt 哈希、会话、requireAuth/requireAdmin、登录限流器
  src/files.ts    #   魔数嗅探（%PDF / PK）、Range 解析、数据目录工具
  src/version.ts  #   运行时读取自身 package.json 的应用版本（health / 启动日志用）
  src/routes/     #   auth.ts / books.ts / admin.ts（每带一个 *.test.ts）
web/              # React SPA
  src/api/client.ts       # fetch 封装（api.get/post/postForm/put/delete + ApiError）
  src/auth/               # LoginPage / RegisterPage / RequireAuth（含 useMe）
  src/pages/              # LibraryPage / ReaderPage / AdminPage
  src/reader/             # EpubReader / PdfReader / extract.ts（客户端元数据+封面提取）
  src/components/         # BookCard / UploadDialog / Toc
e2e/              # Playwright：journey.spec.ts（三幕）+ global-setup.ts
scripts/          # make-fixtures.mjs / reset-e2e-data.mjs / set-version.mjs / check-version.mjs
```

## API 速查（全部 JSON；会话 cookie `oll_session`）

| 方法与路径 | 权限 | 说明 |
|---|---|---|
| `GET /api/health` | 公开 | `{"ok":true,"version":"0.1.0"}`（version 运行时来自服务端 package.json） |
| `POST /api/auth/register` | 公开* | 首个用户自动 admin；之后必须邀请码（body: username/password/inviteCode） |
| `POST /api/auth/login` / `logout`，`GET /api/auth/me` | 公开 / 登录 | 登录限流 10 次/10 分钟/用户名（内存实现） |
| `GET/POST /api/admin/invites` | admin | 邀请码列表 / 生成 |
| `GET /api/admin/users`，`POST /api/admin/users/:id/password` | admin | 用户列表 / 重置密码（旧会话全部失效） |
| `POST /api/books` | admin | multipart：`file` + `title`/`author` + 可选 `cover`；format 由服务端魔数嗅探，`hasCover` 由服务端计算 |
| `GET /api/books` | 登录 | 列表（LEFT JOIN 本人 progress，上传时间倒序） |
| `GET /api/books/:id` / `:id/file` / `:id/cover` | 登录 | 详情 / 文件流（支持 Range 206）/ 封面（max-age=86400） |
| `PUT /api/books/:id/progress` | 登录 | `{locator, percent}` upsert，按用户隔离 |
| `DELETE /api/books/:id` | admin | 删库行 + 删文件（progress 级联） |

\* 记录数=0 时的首次注册。错误体统一 `{"error":"<code>"}`。

## 关键产品行为（改代码前必须知道）

- **首个注册用户 = 管理员**；此后注册必须邀请码（管理页生成）。
- **公共书库**：所有登录用户可读；仅 admin 可上传/删除（books 表已预留 `owner_id`/`visibility` 供 v2 私有书）。
- **注册路由校验顺序**：`username_taken`(409) 先于邀请码校验(400)——有意为之，测试锁定（`server/src/routes/auth.test.ts`）。
- 密码 scrypt（N=16384）；会话存 `sha256(token)`；cookie HttpOnly + SameSite=Lax + 30 天；`COOKIE_SECURE=true` 仅用于 HTTPS 反代场景。

## 版本与发布

- **单一事实来源 = 根 `package.json` 的 `version`**：四个 package.json（根 + shared/server/web）必须一致（子包均为私有包，随根版本走）。代码/文档里不硬编码版本号：服务端运行时读自身 `package.json`（`server/src/version.ts`；dev=`src/`、构建=`dist/`、Docker=`pnpm deploy` 产物三种布局下 `../package.json` 均有效），web 由 Vite `define` 注入 `__APP_VERSION__`（改版本号后需重启 dev server）。
- **升级/发布流程**：`pnpm version:set x.y.z`（同步四个 package.json）→ `CHANGELOG.md` 顶部补 `## [x.y.z] - YYYY-MM-DD` → `pnpm build` 自校验（`scripts/check-version.mjs`：版本一致 + CHANGELOG 有条目，失败即中断，Docker 构建同样经过）→ commit → `git tag -a vx.y.z -m "..."` → push（**tag 推送后不要改写**）→ 需要时在 GitHub 为该 tag 建 Release（说明用 CHANGELOG 对应段落）。
- **构建入口**：用根 `pnpm build`（先校验再递归构建）；直接 `pnpm -r build` 会跳过版本门禁。
- **术语**：`v1 / v2…` 是产品功能阶段名（README/注释里的惯用法）；**发布号**是 semver `vX.Y.Z`、与 git tag 一一对应，首个为 `v0.1.0`。两者不要混用。当前发布线为 `0.x`（不承诺 API 稳定）。
- **别联动**：数据库 `PRAGMA user_version`（当前 1）是 schema 迁移版本，与应用版本无关。

## 测试与验收门禁（Definition of Done）

1. `pnpm -r test` → **62 passed**（shared 3 / server 57 / web 2）
2. `pnpm -r typecheck` → 全 Done
3. `node scripts/make-fixtures.mjs && CI=1 pnpm test:e2e` → **3 passed**
4. 改动涉及 Docker/README 时：`docker compose config --quiet` + 冒烟（`/api/health` → `{"ok":true,"version":"..."}`；`docker compose logs` 启动行含版本号）

工作方式：**TDD**（先补/改 `*.test.ts` 看到红 → 最小实现 → 绿 → commit）；提交信息用 conventional commits（`feat|fix|test|chore|docs(scope): ...`）。

## data-testid 是 E2E 契约（不得改名）

全表见计划附录 C。按页面速查：`login-*`、`app-version`（登录页页脚版本号）、`register-*`、`upload-button|admin-link|theme-toggle|logout-button|empty-state`、`book-card|cover-img|progress-bar`、`upload-dialog|upload-input|upload-status`、`reader-title|back-to-library`、`toc-button|toc-panel|toc-item|reader-theme-toggle|progress-text`、`epub-prev|epub-next|font-increase|font-decrease`、`page-prev|page-next|page-input|pdf-viewer`、`invite-generate|invite-code|user-row|reset-start|reset-input|reset-submit|admin-message`。

新增可交互 UI：同步加 testid；若 E2E 该走的新路径重要，在 `e2e/journey.spec.ts` 加断言。

## 已知坑（都真实踩过；先看这里再动手）

1. **shared 通过 `dist` 消费**：改 `shared/src` 后必须 `pnpm --filter @oll/shared build`（或 `pnpm -r build`），否则 server/web 用的还是旧构建。
2. **epub.js 必须 `ePub(url, { openAs: 'epub' })`**：文件路由无扩展名，默认按扩展名判断会走"解压目录"分支导致白屏卡死。
3. **pdfjs worker 三原则**：`workerSrc` 必须在 `<Document>` 同一模块设置；`new URL(...)` 保持**单行**（Vite ≥7.1 对多行有回归）；pdfjs-dist v6 的 `destroy()` 在 loading task 上（`PDFDocumentProxy.destroy` 已移除）。
4. **`tsx watch` 在管道 stdin 下阻塞**：Playwright webServer 场景用 `pnpm --filter @oll/server exec tsx src/index.ts`（见 playwright.config.ts）；交互终端里 `pnpm dev` 不受影响。
5. **Playwright 先起 webServer 才跑 globalSetup**：E2E 数据清理必须放在 server 启动命令前置（`scripts/reset-e2e-data.mjs`），放 globalSetup 里在 Windows 上必然 EPERM。
6. **邀请码 ≥ 4 字符**（shared zod `min(4)`）：测试无效邀请码要用语法合法值（如 `'badcode'`），`'bad'` 会被契约层拦成 `invalid_input`。
7. **`pnpm-workspace.yaml` 的 `allowBuilds` 是有意配置**（esbuild 允许，core-js/es5-ext 显式禁），别删——否则每次 `pnpm add` 又会出占位符噪音。
8. **Windows/MSYS（git-bash）注意**：杀进程 `taskkill //F //PID <pid>`；`/tmp` 是 MSYS 私有目录，临时文件放 `$LOCALAPPDATA/Temp` 或 Hermes scratch；git 的 LF/CRLF warning 是正常现象；`curl -F` 传中文会因控制台编码损坏，测 UTF-8 multipart 用 Python/Node 客户端。
9. **端口排查**：8787（API dev）/ 5173（web dev）/ 3000（Docker）。起服务前 `netstat -ano | grep :8787` 查残留；E2E 一律 `CI=1` 强制干净启动。
10. **数据目录 = 状态**：`server/data`（dev）、`./data`（Docker）、`e2e/.data`（测试）。整个删掉即重置；均在 `.gitignore`，不要提交。注意重置后"首用户=管理员"逻辑会重新生效。
11. **上传校验只有魔数**：EPUB 只要 ZIP 头（`PK`）、PDF 只要 `%PDF`；伪造文件能上传、打开才报错——v1 有意为之（零服务端解包依赖）。上限 `MAX_UPLOAD_MB=200`。
12. **Tailwind v4 语法敏感点**：dark 模式用 `@custom-variant dark`（web/src/index.css 已配）；升级 Tailwind 时这是首要回归点（计划 R11）。

## 边界与红线

- `.hermes/**` 是本地档案、不入库（`.gitignore` 已忽略）：不修改 `plans/**`；新决策写进 AGENTS.md 或新文档。
- 不提交：`node_modules/`、`*/dist/`、`data/`、`server/data/`、`e2e/.data/`、`e2e/.fixtures/`、`*.env`、`playwright-report/`。
- `pnpm-lock.yaml` 只由 pnpm 命令更新，不手改。
- 服务端测试必须用 `server/src/test-helpers.ts`（`makeTestApp` 临时目录 + 内存级隔离），不得依赖真实 `server/data`。

## 环境变量（server）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3000（dev 用 8787，见 server/.env） | 监听端口 |
| `DATA_DIR` | `./data` | 数据库/books/covers 落盘位置 |
| `MAX_UPLOAD_MB` | 200 | 上传大小上限 |
| `COOKIE_SECURE` | false | HTTPS 反代时置 true |
| `WEB_DIST` | 无 | 存在且目录有效时启用 SPA 静态托管 + 回退 |

---

维护者注意：当功能、命令、契约或坑位变化时，**同步更新本文件**——它是下一个代理（和未来的你）的第一入口。
