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
