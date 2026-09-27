# OnlineLearningLab

[![CI](https://github.com/Bingo888-Lab/OnlineLearningLab/actions/workflows/ci.yml/badge.svg)](https://github.com/Bingo888-Lab/OnlineLearningLab/actions/workflows/ci.yml)

自托管在线学习平台（版本号与发布历史见 [CHANGELOG](CHANGELOG.md)）：管理员上传 EPUB/PDF，登录用户在线阅读，进度自动保存。

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

快速部署（拉取预构建镜像，无需本地构建）：

```bash
# 在仓库根目录
docker compose pull && docker compose up -d
```

升级：`git pull && docker compose pull && docker compose up -d`。

也可本地构建部署（开发/自定义）：

```bash
docker compose up -d --build
```

预构建镜像发布在 `ghcr.io/bingo888-lab/onlinelearninglab`：`latest` 跟随最新发布；也可把 `docker-compose.yml` 的 `image:` 换成具体发布号（如 `0.1.0`）锁定版本。匿名拉取无需登录。

服务运行在 `http://<主机>:3000`。首次打开注册页，**第一个注册用户自动成为管理员**。

数据全部落在宿主机 `./data/`（SQLite 数据库 + 上传文件 + 封面）：

- 备份：`docker compose stop && tar czf oll-backup-$(date +%F).tgz data/ && docker compose start`
- 恢复：停容器后把 `data/` 解回去再启动。

公开到公网的建议（不内含，属于部署者职责）：在容器前面加一层 HTTPS 反向代理（如 Caddy），并把 `COOKIE_SECURE` 改为 `"true"`。

已验证：2026-09-27 Docker Compose 冒烟通过。

## 许可证

[MIT](LICENSE)

