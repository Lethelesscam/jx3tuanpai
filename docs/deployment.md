# 部署团牌红黑榜

## Cloudflare Worker

生产站通过 Cloudflare Hyperdrive 连接 SQLPub 的 MySQL 数据库。使用 Wrangler 登录 Cloudflare 后运行 `npm run deploy:api`，命令会使用根目录的 [`wrangler.pages-api.json`](../wrangler.pages-api.json)。

配置中的 `HYPERDRIVE` 已指向该项目的生产连接，数据库密码由 Cloudflare 保存。另行部署时，用 [`database/schema.sql`](../database/schema.sql) 初始化目标 MySQL 8.4 数据库，创建关闭查询缓存的 Hyperdrive 配置，更新绑定 ID 和 `vars.PAGES_ORIGIN`。

在浏览器开发者工具的网络面板中，成功读取 `/api/board` 时会返回响应头 `X-Board-Storage: mysql`。

## GitHub Pages

1. 在仓库设置中将 Pages 的来源设为 GitHub Actions。
2. 将 Worker 的 HTTPS 地址设为仓库变量 `BOARD_API_URL`，地址填写到域名即可。
3. 运行 **Publish GitHub Pages** 工作流。

页面通过 Worker 的 `/api/board` 读取和提交数据。OCR 资源随静态站发布，在浏览器端运行。
