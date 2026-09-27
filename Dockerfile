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
