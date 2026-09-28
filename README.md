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

## 部署

预构建镜像发布在 `ghcr.io/bingo888-lab/onlinelearninglab`（匿名拉取，无需登录）。两种方式二选一：

### 方式 A：docker run（不克隆仓库，最快）

```bash
docker pull ghcr.io/bingo888-lab/onlinelearninglab:latest
docker run -d --name oll \
  -p 3000:3000 \
  -v ./data:/data \
  --restart unless-stopped \
  ghcr.io/bingo888-lab/onlinelearninglab:latest
```

- 端口冲突时改 `-p` 左侧（如 `-p 8080:3000`）；数据落盘在命令执行目录的 `./data/`。
- 升级：`docker pull ghcr.io/bingo888-lab/onlinelearninglab:latest && docker rm -f oll` 后重跑上面的 `docker run`（`./data/` 不受影响）。
- 日志：`docker logs -f oll`。

### 方式 B：docker compose（推荐：升级、配置、备份都在仓库里）

```bash
git clone https://github.com/Bingo888-Lab/OnlineLearningLab.git
cd OnlineLearningLab
docker compose pull && docker compose up -d
```

升级：`git pull && docker compose pull && docker compose up -d`。
本地构建部署（开发/自定义）：`docker compose up -d --build`。

### 锁定版本（生产建议）

`latest` 跟随最新发布；锁版本就把镜像换成具体发布号（不可变标签，如 `0.1.0`）：方式 A 改命令里的 `:latest`；方式 B 改 `docker-compose.yml` 的 `image:`。发布号列表见 [Packages 页](https://github.com/orgs/Bingo888-Lab/packages/container/onlinelearninglab)。

### 首次使用

打开 `http://<主机>:3000`，注册页**第一个注册用户自动成为管理员**；此后注册需要邀请码（管理页生成）。

### 数据与备份

数据全部落在宿主机 `./data/`（SQLite 数据库 + 上传文件 + 封面）：

- 备份：`docker stop oll && tar czf oll-backup-$(date +%F).tgz data/ && docker start oll`（方式 B：把两条 docker 命令换成 `docker compose stop` / `docker compose start`）。
- 恢复：停容器后把备份里的 `data/` 解回原位置，再启动。

### 公开到公网

建议（属于部署者职责，不内含）：容器前面加一层 HTTPS 反向代理（如 Caddy），并把 `COOKIE_SECURE` 改为 `"true"`——方式 A 在 `docker run` 里加 `-e COOKIE_SECURE=true`；方式 B 改 `docker-compose.yml` 对应环境变量。

已验证：2026-09-27 GHCR 匿名拉取 + `docker run`（`/api/health` 正常）与 Docker Compose（本地构建路径 + 预构建镜像路径）均通过。

## 许可证

[MIT](LICENSE)

