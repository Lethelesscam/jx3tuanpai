# 图片识别与导入

图片 OCR 在浏览器内运行。普通截图按文本解析，带有「序号、目标、标记人、原因」表头的名单按表格识别。名单导入逐行读取目标和原因，保留原因的换行。置信度较低的条目会提示核对。识别结果可在提交前校对，CSV 导入使用相同的候选列表。

[`public/ocr/`](../public/ocr/) 包括 Tesseract.js 6.0.1、Tesseract.js Core 6.0.0 和 Tesseract.js Data 的简体中文与英文模型。许可证随资源提供。[Tesseract.js](https://github.com/naptha/tesseract.js) · [Tesseract.js Core](https://github.com/naptha/tesseract.js-core) · [语言模型](https://github.com/naptha/tessdata)

[`public/ocr/table/`](../public/ocr/table/) 提供名单表格使用的 PaddleOCR PP-OCRv4 中文识别模型、字表和 ONNX Runtime Web 1.20.1。模型取自 Guten OCR 1.4.2 的模型包，PaddleOCR 使用 Apache-2.0 许可证，ONNX Runtime 使用 MIT 许可证。[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) · [Guten OCR](https://github.com/gutenye/ocr) · [ONNX Runtime](https://github.com/microsoft/onnxruntime)
