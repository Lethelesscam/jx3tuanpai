# 团牌红黑榜

公开访客可以浏览和搜索共享榜单。设置昵称后，当前浏览器的会话可用于发布团牌、投票、评分和编辑自己的评价。数据存放在独立的 Cloudflare D1 数据库中，迁移只建立表结构。

图片 OCR 在浏览器内运行。普通截图按文本解析，带有「序号、目标、标记人、原因」表头的名单按表格识别。名单导入逐行读取目标和原因，保留原因的换行。置信度较低的条目会提示核对。识别结果可在提交前校对，CSV 导入使用相同的候选列表。

## GitHub Pages 与 Cloudflare 部署

1. 使用 Wrangler 登录 Cloudflare。复制 `wrangler.pages-api.jsonc` 为 `wrangler.pages-api.local.json`，将其中的 D1 名称和 ID 改为目标数据库。
2. 核对 D1 表结构。新空库使用 `npx wrangler d1 migrations apply DB --remote --config wrangler.pages-api.local.json` 初始化。已使用的数据库按现有 schema 和迁移记录决定后续操作。
3. 使用 `npx wrangler deploy --config wrangler.pages-api.local.json` 发布 Worker。
4. 在 GitHub 仓库设置中将 Pages 的来源设为 GitHub Actions，并把 Worker 的 HTTPS 地址设为仓库变量 `BOARD_API_URL`。运行 **Publish GitHub Pages** 工作流。Pages 通过 Worker 的 `/api/board` 访问 D1，浏览器在本地加载 OCR 资源。

## 本地预览

需要 Node.js 22.13 或更新版本及 npm。

1. 运行 `npm run install:ci` 和 `npm run build`。
2. 使用 Wrangler 把 `drizzle/0000_nosy_the_santerians.sql` 应用到本地 D1 绑定 `DB`，配置文件为 `dist/server/wrangler.json`，本地状态目录为 `.wrangler/state`。
3. 运行 `npm start`，打开终端显示的地址。

## OCR 资源

`public/ocr/` 包括 Tesseract.js 6.0.1、Tesseract.js Core 6.0.0 和 Tesseract.js Data 的简体中文与英文模型。许可证随资源提供。

`public/ocr/table/` 提供名单表格使用的 PaddleOCR PP-OCRv4 中文识别模型、字表和 ONNX Runtime Web 1.20.1。模型取自 Guten OCR 1.4.2 的模型包，PaddleOCR 使用 Apache-2.0 许可证，ONNX Runtime 使用 MIT 许可证。

- https://github.com/naptha/tesseract.js
- https://github.com/naptha/tesseract.js-core
- https://github.com/naptha/tessdata
- https://github.com/PaddlePaddle/PaddleOCR
- https://github.com/gutenye/ocr
- https://github.com/microsoft/onnxruntime
