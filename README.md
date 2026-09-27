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

已验证：2026-09-27 Docker Compose 冒烟通过。

## 许可证

[MIT](LICENSE)

