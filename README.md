# 团牌红黑榜

公开访客可以浏览和搜索共享榜单。设置昵称后，可以在当前浏览器发布团牌、投票、评分和编辑自己的评价。支持截图 OCR 和 CSV 导入，确认前可校对识别结果。

[打开团牌红黑榜](https://lethelesscam.github.io/jx3tuanpai/)

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| [`web/`](web/) | GitHub Pages 静态站入口 |
| [`app/`](app/) | 榜单界面、OCR 和导入逻辑、榜单 API 及存储接口 |
| [`worker/`](worker/) | Cloudflare Worker 入口 |
| [`database/`](database/) | MySQL 建表脚本 |
| [`public/ocr/`](public/ocr/) | 浏览器下载的 OCR 模型和运行库 |
| [`.github/workflows/`](.github/workflows/) | GitHub Pages 构建与部署 |

## 本地预览

需要 Node.js 22.13 或更新版本及 npm。

1. 运行 `npm run install:ci`。
2. 用 [`database/schema.sql`](database/schema.sql) 初始化一个 MySQL 8.4 开发库，在终端设置 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` 为该库的连接 URI。
3. 运行 `npm run dev`，打开终端显示的地址。

## 维护文档

- [部署 GitHub Pages 和 Cloudflare Worker](docs/deployment.md)
- [OCR 识别逻辑、模型和许可证](docs/ocr.md)
