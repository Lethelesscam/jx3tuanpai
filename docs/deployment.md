# 部署团牌红黑榜

## Render 免费 API

使用 [在 Render 部署本项目](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FLethelesscam%2Fjx3tuanpai) 打开部署页面，登录后连接 GitHub 仓库。根目录的 [`render.yaml`](../render.yaml) 会创建位于新加坡的 **Free Web Service**。

首次部署时，在 Render 的表单分别填写 SQLPub 控制台里的主机名、端口、数据库名、用户名和密码。对应字段为 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE`、`MYSQL_USER` 和 `MYSQL_PASSWORD`。数据库通过 TLS 连接，应用信任仓库里的 SQLPub CA 证书。

服务显示 **Live** 后，访问 Render 分配的 HTTPS 域名并在路径加上 `/api/board`，确认返回现有榜单 JSON。通过目标地区拨测后，将 Render 域名填入后文的 `BOARD_API_URL`，重新发布 GitHub Pages。换 API 域名后，在同一网页和浏览器保存的昵称会话会自动沿用。

免费实例无流量 15 分钟后会休眠，下一次请求可能需要等待约一分钟。

## Cloudflare Worker

生产站通过 Cloudflare Hyperdrive 连接 SQLPub 的 MySQL 数据库。使用 Wrangler 登录 Cloudflare 后运行 `npm run deploy:api`，命令会使用根目录的 [`wrangler.pages-api.json`](../wrangler.pages-api.json)。

配置中的 `HYPERDRIVE` 已指向该项目的生产连接，数据库密码由 Cloudflare 保存。另行部署时，用 [`database/schema.sql`](../database/schema.sql) 初始化目标 MySQL 8.4 数据库，创建关闭查询缓存的 Hyperdrive 配置，更新绑定 ID 和 `vars.PAGES_ORIGIN`。

在浏览器开发者工具的网络面板中，成功读取 `/api/board` 时会返回响应头 `X-Board-Storage: mysql`。

## GitHub Pages

1. 在仓库设置中将 Pages 的来源设为 GitHub Actions。
2. 将 API 的 HTTPS 地址设为仓库变量 `BOARD_API_URL`，地址填写到域名即可。
3. 运行 **Publish GitHub Pages** 工作流。

页面通过 `/api/board` 读取和提交数据。OCR 资源随静态站发布，在浏览器端运行。
