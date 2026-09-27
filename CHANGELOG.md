# Changelog

本文件按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式维护，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
版本号的单一事实来源是根 [package.json](package.json)：`pnpm version:set x.y.z` 同步四个包；`pnpm version:check`（挂载于 `pnpm build`）校验一致性并检查本文件是否已有对应条目。

## [0.1.0] - 2026-09-27

首个发布版本（产品阶段 **v1**），tag 为 `v0.1.0`。

### Added

- 认证：首个注册用户自动成为管理员，此后注册必须邀请码；登录限流（10 次/10 分钟/用户名）；密码 scrypt 哈希；会话 cookie HttpOnly + SameSite=Lax（30 天）
- 书库：管理员上传 EPUB/PDF（服务端魔数嗅探格式，浏览器端提取标题/作者/封面），所有登录用户可读
- 阅读器：EPUB（分页、目录、字号、深浅色、进度恢复）与 PDF（翻页、跳页、缩放、目录、进度恢复）
- 阅读进度：按用户隔离、防抖自动保存（`PUT /api/books/:id/progress`）
- 管理：邀请码生成、用户列表、重置密码（旧会话全部失效）
- 部署：多阶段 Dockerfile（`pnpm deploy` 独立运行目录）+ Docker Compose 一条命令，数据落宿主机 `./data`
- 接口：`GET /api/health`；书籍文件流支持 Range 请求（206）
