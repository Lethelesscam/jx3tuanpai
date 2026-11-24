# 部署团牌红黑榜

## Cloudflare Worker

使用 Wrangler 登录 Cloudflare，复制根目录的 `wrangler.pages-api.jsonc` 为 `wrangler.pages-api.local.json`。在 `vars.PAGES_ORIGIN` 填入前端站点的来源，例如 `https://lethelesscam.github.io`。

### D1

在 `d1_databases` 中填写数据库名称和 ID，绑定名使用 `DB`。新空库可用 `npx wrangler d1 migrations apply DB --remote --config wrangler.pages-api.local.json` 建表。已有数据库先核对表结构与迁移记录。

### MySQL

新空库使用 [`drizzle/mysql/board.sql`](../drizzle/mysql/board.sql) 建表。在 Cloudflare 创建指向 MySQL 的 Hyperdrive 配置，关闭查询缓存，让提交后紧接的读取可以反映最新数据。数据库凭证由 Hyperdrive 管理。

把 Wrangler 配置中的 `d1_databases` 删掉，加入以下绑定，并保留 `nodejs_compat`。

```json
{
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "替换为 Hyperdrive 配置 ID" }
  ]
}
```

### 发布

运行 `npx wrangler deploy --config wrangler.pages-api.local.json`。数据库切换时可将 `vars.BOARD_READ_ONLY` 临时设为 `"1"`，让榜单保持可读，待核对数据后恢复提交。

## GitHub Pages

1. 在仓库设置中将 Pages 的来源设为 GitHub Actions。
2. 将 Worker 的 HTTPS 地址设为仓库变量 `BOARD_API_URL`，地址填写到域名即可。
3. 运行 **Publish GitHub Pages** 工作流。

页面通过 Worker 的 `/api/board` 读取和提交数据。OCR 资源随静态站发布，在浏览器端运行。
