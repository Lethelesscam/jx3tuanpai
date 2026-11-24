# 团牌红黑榜

公开访客可以浏览和搜索共享榜单。设置昵称后，可以在当前浏览器发布团牌、投票、评分和编辑自己的评价。支持截图 OCR 和 CSV 导入，确认前可校对识别结果。

[打开团牌红黑榜](https://lethelesscam.github.io/jx3tuanpai/)

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| [`web/`](web/) | GitHub Pages 静态站入口 |
| [`app/`](app/) | 榜单界面、OCR 和导入逻辑、榜单 API 及存储接口 |
| [`worker/`](worker/) | Cloudflare Worker 入口 |
| [`db/`](db/) 和 [`drizzle/`](drizzle/) | D1 表定义和迁移、MySQL 建表脚本 |
| [`public/ocr/`](public/ocr/) | 浏览器下载的 OCR 模型和运行库 |
| [`.github/workflows/`](.github/workflows/) | GitHub Pages 构建与部署 |

## 本地预览

需要 Node.js 22.13 或更新版本及 npm。

1. 运行 `npm run install:ci` 和 `npm run build`。
2. 使用 Wrangler 把 `drizzle/0000_nosy_the_santerians.sql` 应用到本地 D1 绑定 `DB`，配置文件为 `dist/server/wrangler.json`，本地状态目录为 `.wrangler/state`。
3. 运行 `npm start`，打开终端显示的地址。

## 维护文档

- [部署 GitHub Pages 和 Cloudflare Worker](docs/deployment.md)
- [OCR 识别逻辑、模型和许可证](docs/ocr.md)
