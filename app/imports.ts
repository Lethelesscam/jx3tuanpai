import { IMPORT_LIMIT, NAME_LIMIT, NOTE_LIMIT } from "./model";
import type { Draft, Kind } from "./model";
import { readMarkedTable } from "./ocr-table";
import type { OcrResult, OcrWorker } from "./ocr-table";
import { assetPath } from "./board-client";

const labels = /^(?:【|\[)?(红榜|黑榜|好评|避雷|推荐|差评)(?:】|\])?\s*[:：|｜\-]?\s*/;
const labelKind = (label: string): Kind => /黑榜|避雷|差评/.test(label) ? "black" : "red";
const draft = (name: string, kind: Draft["kind"], note: string): Draft =>
  ({ name: name.trim().slice(0, NAME_LIMIT), kind, note: note.trim().slice(0, NOTE_LIMIT) });

export function fromText(text: string): Draft[] {
  let kind: Draft["kind"] = "";
  const rows: Draft[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^(?:[-•·*]+|\d+[.、)．])\s*/, "")
      .replace(/(?<=\p{Script=Han}) +(?=\p{Script=Han})/gu, "");
    if (!line) continue;
    const category = line.match(labels);
    if (category) {
      kind = labelKind(category[1]);
      line = line.slice(category[0].length).trim();
      if (!line) continue;
    }
    const noteOnly = line.match(/^(?:备注|评价)\s*[:：]\s*(.+)$/);
    if (noteOnly && rows.length) {
      const last = rows[rows.length - 1];
      last.note = [last.note, noteOnly[1]].filter(Boolean).join("\n").slice(0, NOTE_LIMIT);
      continue;
    }
    line = line.replace(/^(?:团牌名称|团牌|团名)\s*[:：]\s*/, "");
    const split = /\s*(?:[|｜：:]|\s+[-–—]\s+)\s*/.exec(line);
    const row = split
      ? draft(line.slice(0, split.index), kind, line.slice(split.index + split[0].length))
      : draft(line, kind, "");
    if (row.name) rows.push(row);
    if (rows.length === IMPORT_LIMIT) break;
  }
  return rows;
}

export function fromCsv(text: string): Draft[] {
  const records: string[][] = [];
  let quoted = false, cell = "", row: string[] = [];
  const data = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === '"' && quoted && data[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ",") { row.push(cell); cell = ""; }
    else if (!quoted && c === "\n") { records.push([...row, cell]); row = []; cell = ""; }
    else cell += c;
  }
  if (quoted) throw new Error("CSV 有未闭合的引号");
  if (row.length || cell) records.push([...row, cell]);
  const header = records[0] ?? [];
  const nameIndex = header.indexOf("团牌名称");
  const noteIndex = header.findIndex(value => /评价|备注/.test(value));
  return (nameIndex >= 0 ? records.slice(1) : records)
    .map(cells => {
      const label = cells[0]?.trim() ?? "";
      const unclassified = !/红榜|黑榜|好评|避雷|推荐|差评|^red$|^black$/i.test(label);
      const kind = unclassified ? "" : label.toLowerCase() === "black" ? "black" : labelKind(label);
      const note = nameIndex >= 0 ? cells[noteIndex] : cells[2];
      return draft(cells[nameIndex >= 0 ? nameIndex : 1] ?? "", kind, note ?? "");
    })
    .filter(row => row.name)
    .slice(0, IMPORT_LIMIT);
}

type Engine = {
  createWorker: (languages: string[], mode: number, options: {
    logger: (result: { status: string; progress: number }) => void;
    workerPath: string;
    workerBlobURL: boolean;
    corePath: string;
    langPath: string;
  }) => Promise<OcrWorker>;
};
let enginePromise: Promise<Engine> | null = null;
function loadEngine() {
  if (!enginePromise) {
    enginePromise = new Promise<Engine>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = assetPath("ocr/tesseract.min.js");
      const timer = window.setTimeout(() => fail(), 25000);
      function fail() {
        window.clearTimeout(timer);
        enginePromise = null;
        script.remove();
        reject(new Error("未能加载 OCR 引擎，请检查网络后重试"));
      }
      script.onload = () => {
        window.clearTimeout(timer);
        const engine = (window as Window & { Tesseract?: Engine }).Tesseract;
        if (engine) resolve(engine);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return enginePromise;
}

export async function recognizeImage(image: File, progress: (text: string, value: number) => void): Promise<OcrResult> {
  progress("正在加载识别引擎和中文模型", 0.05);
  const engine = await loadEngine();
  const assets = new URL(assetPath("ocr/"), window.location.href).href;
  let readingFreeText = false;
  const worker = await engine.createWorker(["chi_sim", "eng"], 1, {
    workerPath: assets + "worker.min.js",
    workerBlobURL: false,
    corePath: assets,
    langPath: assets,
    logger: message => {
      if (readingFreeText && message.status === "recognizing text") progress("正在识别图片文字", 0.48 + 0.52 * message.progress);
      if (message.status === "loading language traineddata") progress("正在加载中文模型", 0.12 + 0.3 * message.progress);
    },
  });
  try {
    const table = await readMarkedTable(image, worker, progress);
    if (table) return table;
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    readingFreeText = true;
    const result = await worker.recognize(image);
    return { text: result.data.text };
  } finally { await worker.terminate(); }
}
