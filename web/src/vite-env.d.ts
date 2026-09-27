/// <reference types="vite/client" />

/** 启动/构建期由 vite.config.ts 的 `define` 注入：web/package.json 的 version（经 `pnpm version:set` 与根 package.json 保持同步） */
declare const __APP_VERSION__: string
