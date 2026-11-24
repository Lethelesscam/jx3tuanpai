# 团牌红黑榜

公开访客可以浏览和搜索共享榜单。设置昵称后，可以在当前浏览器发布团牌、投票、评分和编辑自己的评价。支持截图 OCR 和 CSV 导入，确认前可校对识别结果。

[打开团牌红黑榜](https://lethelesscam.github.io/jx3tuanpai/)

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| [`web/`](web/) | GitHub Pages 静态站入口 |
| [`app/`](app/) | 榜单界面、OCR 和导入逻辑 |
| [`server/`](server/) | Render API、榜单业务逻辑和 MySQL 连接 |
| [`database/`](database/) | MySQL 建表脚本 |
| [`public/ocr/`](public/ocr/) | 浏览器下载的 OCR 模型和运行库 |
| [`.github/workflows/`](.github/workflows/) | GitHub Pages 构建与部署 |

## 本地预览

需要 Node.js 22.13 或更新版本及 npm。

1. 运行 `npm ci`。用 [`database/schema.sql`](database/schema.sql) 初始化 MySQL 8.4 开发库。
2. 新建 `.env.local`，填写部署文档列出的 `MYSQL_*` 环境变量，并设置 `PAGES_ORIGIN=http://localhost:5173` 和 `VITE_BOARD_API_URL=http://localhost:10000`。使用其他 MySQL 服务器时，通过 `MYSQL_CA_FILE` 指定其 TLS CA 文件。
3. 运行 `npm run build:api` 和 `npm start`。在另一个终端运行 `npm run dev`，打开它显示的网页地址。

## 维护文档

- [部署 GitHub Pages 和榜单 API](docs/deployment.md)
- [OCR 识别逻辑、模型和许可证](docs/ocr.md)
