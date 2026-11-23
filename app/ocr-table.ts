import { IMPORT_LIMIT, NAME_LIMIT, NOTE_LIMIT } from "./model";
import type { Draft } from "./model";
import { loadTableRecognizer } from "./ocr-recognizer";
import type { LineResult } from "./ocr-recognizer";

export type OcrWorker = {
  setParameters: (parameters: { tessedit_pageseg_mode: string }) => Promise<unknown>;
  recognize: (image: File | HTMLCanvasElement, options?: object, output?: { tsv: true }) =>
    Promise<{ data: { text: string; confidence: number; tsv?: string | null } }>;
  terminate: () => Promise<void>;
};
type Box = { x: number; y: number; width: number; height: number };
type Word = Box & { text: string };
export type OcrResult = { text: string; table?: Draft[] };

const compact = (text: string) => text.replace(/\s+/g, "");
const category = (text: string): Draft["kind"] => {
  const label = compact(text);
  const red = /红榜|好评|推荐/.test(label);
  const black = /黑榜|避雷|差评/.test(label);
  return red === black ? "" : black ? "black" : "red";
};
const cleanText = (text: string) => text.trim().replace(/\s*\r?\n\s*/g, "\n")
  .replace(/(?<=[\p{Script=Han}\d]) +(?=[\p{Script=Han}\d])/gu, "")
  .replace(/([《「『（]) +/g, "$1")
  .replace(/ *(?=[，。！？：；、）》）])/g, "");

function crop(source: HTMLCanvasElement, bounds: Box, scale: number, padding: number, contrast = true) {
  const area = document.createElement("canvas");
  area.width = Math.ceil(bounds.width * scale) + padding * 2;
  area.height = Math.ceil(bounds.height * scale) + padding * 2;
  const context = area.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, area.width, area.height);
  if (contrast) context.filter = "grayscale(1) contrast(1.25)";
  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height,
    padding, padding, bounds.width * scale, bounds.height * scale);
  return area;
}

function horizontalRules(gray: Uint8Array, width: number, height: number) {
  const lines: number[] = [];
  const start = Math.floor(width * 0.04), end = Math.ceil(width * 0.96);
  const step = Math.max(1, Math.floor(width / 140)), offset = Math.max(2, Math.round(width * 0.003));
  let group: { y: number; strength: number } | null = null;
  // Compare with neighboring pixels so alternating row backgrounds do not count as rules.
  for (let y = offset; y < height - offset; y++) {
    let votes = 0;
    for (let x = start; x < end; x += step) {
      const value = gray[y * width + x];
      if (value > 155 && value < 252 && Math.max(gray[(y - offset) * width + x], gray[(y + offset) * width + x]) - value >= 4) votes++;
    }
    if (votes >= (end - start) / step * 0.77) {
      if (!group || votes >= group.strength) group = { y, strength: votes };
    } else if (group) {
      lines.push(group.y);
      group = null;
    }
  }
  if (group) lines.push(group.y);
  return lines;
}

function wordsFrom(tsv: string, scale: number): Word[] {
  return tsv.split("\n").flatMap(row => {
    const cols = row.split("\t");
    if (cols[0] !== "5" || !cols[11]?.trim()) return [];
    const [x, y, width, height] = cols.slice(6, 10).map(value => Number(value) / scale);
    const text = compact(cols[11]);
    return [{ text, x, y, width, height }];
  });
}

function findLabels(words: Word[], pattern: RegExp, gap: number) {
  return words.flatMap(first => {
    let text = first.text;
    let right = first.x + first.width;
    const nearby = words.filter(word => word.x > first.x &&
      Math.abs((word.y + word.height / 2) - (first.y + first.height / 2)) <= Math.max(word.height, first.height) * 0.55)
      .sort((a, b) => a.x - b.x);
    for (const next of [first, ...nearby]) {
      if (next !== first) {
        if (next.x - right > gap) break;
        text += next.text;
        right = next.x + next.width;
      }
      if (pattern.test(text)) return [{ ...first, width: right - first.x }];
      if (text.length > 6) break;
    }
    return [];
  });
}

function inkBounds(gray: Uint8Array, width: number, box: Box): Box | null {
  let left = box.x + box.width, right = box.x - 1, top = box.y + box.height, bottom = box.y - 1;
  let count = 0;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      if (gray[y * width + x] >= 174) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      count++;
    }
  }
  return count >= 5 ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null;
}

function textLines(gray: Uint8Array, width: number, box: Box) {
  const lines: Box[] = [];
  const maxGap = Math.max(2, Math.round(width * 0.002));
  let start = box.y, last = -1;
  function collect() {
    if (last < start) return;
    const ink = inkBounds(gray, width, { ...box, y: start, height: last - start + 1 });
    if (ink) lines.push(ink);
  }
  for (let y = box.y; y < box.y + box.height; y++) {
    let ink = false;
    for (let x = box.x; x < box.x + box.width; x++) {
      if (gray[y * width + x] < 174) { ink = true; break; }
    }
    if (!ink) continue;
    if (y - last > maxGap) { collect(); start = y; }
    last = y;
  }
  collect();
  return lines;
}

function hasOneAddedHan(text: string, longer: string) {
  const glyphs = [...longer];
  return glyphs.length === [...text].length + 1 && glyphs.some((char, i) =>
    /\p{Script=Han}/u.test(char) && glyphs.slice(0, i).concat(glyphs.slice(i + 1)).join("") === text);
}

export async function readMarkedTable(
  image: File, worker: OcrWorker, progress: (text: string, value: number) => void,
): Promise<OcrResult | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(image).catch(() => null);
  if (!bitmap) return null;
  const source = document.createElement("canvas");
  const resize = Math.min(1, 1700 / bitmap.width, 4500 / bitmap.height);
  source.width = Math.round(bitmap.width * resize);
  source.height = Math.round(bitmap.height * resize);
  const { width, height } = source;
  try {
    if (width < 290 || height < 140) return null;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
  } finally { bitmap.close(); }

  const pixels = source.getContext("2d")!.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = (pixels[i * 4] * 3 + pixels[i * 4 + 1] * 6 + pixels[i * 4 + 2]) / 10;
  const rules = horizontalRules(gray, width, height);
  if (rules.length < 2 || rules[0] > width * 0.29) return null;

  progress("正在读取名单表头", 0.46);
  const scale = width < 1250 ? 2 : 1.5;
  const headerHeight = Math.min(height, Math.round(Math.max(rules[0] + width * 0.13, width * 0.2)));
  await worker.setParameters({ tessedit_pageseg_mode: "11" });
  const { data } = await worker.recognize(crop(source, { x: 0, y: 0, width, height: headerHeight }, scale, 0), {}, { tsv: true });
  const words = wordsFrom(data.tsv ?? "", scale);
  const gap = width * 0.018;
  const markers = findLabels(words, /^标记人$/, gap);
  const reasons = findLabels(words, /^(原因|理由)$/, gap);
  const targets = findLabels(words, /^(目标|对象)$/, gap);
  const indexes = findLabels(words, /^(序号|编号)$/, gap);
  const header = targets.map(target => {
    const sameRow = (word: Word) => Math.abs((word.y + word.height / 2) - (target.y + target.height / 2)) < width * 0.018;
    const marker = markers.find(word => sameRow(word) && word.x > target.x);
    const reason = reasons.find(word => sameRow(word) && marker && word.x > marker.x);
    const index = indexes.find(word => sameRow(word) && word.x < target.x);
    return marker && reason && index ? { target, reason, marker, index } : null;
  }).find(Boolean);
  if (!header) return null;

  const { target, reason, marker, index } = header;
  const kind = category(words.filter(word => word.y + word.height <= target.y).map(word => word.text).join(""));
  const markType = findLabels(words, /^标记类型$/, gap)
    .find(word => Math.abs(word.y - target.y) < width * 0.018 && word.x < target.x);
  const firstRule = rules.findIndex(y => y >= target.y + target.height - 1 && y <= target.y + width * 0.07);
  if (firstRule < 0) return null;
  const pad = Math.max(2, Math.round(width * 0.007));
  const columns = {
    index: [Math.max(0, Math.floor(index.x - pad)), Math.ceil(index.x + index.width + pad)],
    name: [Math.floor(target.x - pad), Math.floor(marker.x - pad)],
    note: [Math.floor(reason.x - pad), width],
    mark: markType ? [Math.floor(markType.x - pad), Math.ceil(markType.x + markType.width + width * 0.035)] : null,
  };
  const rows: { name: Box | null; note: Box | null; mark: Box | null }[] = [];
  const inset = Math.max(2, Math.round(width * 0.002));
  for (let i = firstRule; i + 1 < rules.length && rows.length < IMPORT_LIMIT; i++) {
    const top = rules[i] + inset, bottom = rules[i + 1] - inset;
    if (bottom - top < width * 0.014) continue;
    const ink = ([left, right]: number[]) => inkBounds(gray, width, {
      x: Math.max(0, left), width: Math.min(width, right) - Math.max(0, left), y: top, height: bottom - top,
    });
    if (bottom - top > width * 0.6 || !ink(columns.index)) break;
    rows.push({ name: ink(columns.name), note: ink(columns.note), mark: columns.mark ? ink(columns.mark) : null });
  }
  if (!rows.length) return null;

  progress("正在加载名单表格识别模型", 0.49);
  const recognizeLine = await loadTableRecognizer().catch(() => null);
  async function readCell(box: Box | null): Promise<LineResult> {
    if (!box) return { text: "", confidence: 0 };
    const margin = Math.max(1, Math.round(width * 0.0015));
    const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin);
    const bounds = { x, y, width: Math.min(width, box.x + box.width + margin) - x, height: Math.min(height, box.y + box.height + margin) - y };
    const cellScale = Math.min(4, Math.max(1.5, 2600 / width));
    const result = await worker.recognize(crop(source, bounds, cellScale, 12));
    return { text: cleanText(result.data.text), confidence: result.data.confidence / 100 };
  }

  async function readLine(box: Box, stretch = 1) {
    if (!recognizeLine) return null;
    let region = box;
    let padding = Math.max(2, Math.round(box.height * 0.16));
    if (stretch !== 1) {
      const margin = Math.round(box.height * 0.67);
      const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin);
      region = {
        x, y,
        width: Math.min(width, box.x + box.width + margin) - x,
        height: Math.min(height, box.y + box.height + margin) - y,
      };
      padding = 0;
    }
    return recognizeLine(crop(source, region, 1, padding, false), stretch)
      .then(result => ({ ...result, text: cleanText(result.text) })).catch(() => null);
  }
  await worker.setParameters({ tessedit_pageseg_mode: "7" });
  const names: (LineResult & { differs?: boolean })[] = [];
  const categories: Draft["kind"][] = [];
  for (const [i, row] of rows.entries()) {
    progress(`正在识别目标 ${i + 1} / ${rows.length}`, 0.5 + i / rows.length * 0.19);
    const name = row.name ? await readLine(row.name) : null;
    let selected = name?.text ? name : await readCell(row.name);
    const alternative = row.name && row.name.width >= row.name.height * 5.5
      ? await readLine(row.name, 1.3) : null;
    const differs = Boolean(alternative?.text && alternative.text !== selected.text);
    // A wider pass can recover a Chinese character that the first pass dropped.
    if (alternative && alternative.confidence >= 0.9 && hasOneAddedHan(selected.text, alternative.text)) selected = alternative;
    names.push({ ...selected, differs });
    categories.push(kind || category((await readCell(row.mark)).text));
  }

  await worker.setParameters({ tessedit_pageseg_mode: "6" });
  const table: Draft[] = [];
  for (const [i, row] of rows.entries()) {
    progress(`正在识别原因 ${i + 1} / ${rows.length}`, 0.7 + i / rows.length * 0.29);
    let note: LineResult = { text: "", confidence: 1 };
    if (row.note) {
      const boxes = recognizeLine ? textLines(gray, width, row.note) : [];
      const lines: LineResult[] = [];
      for (const line of boxes) {
        const recognized = await readLine(line);
        if (!recognized?.text) break;
        lines.push(recognized);
      }
      note = lines.length && lines.length === boxes.length
        ? { text: lines.map(line => line.text).join("\n"), confidence: Math.min(...lines.map(line => line.confidence)) }
        : await readCell(row.note);
    }
    const name = names[i].text.replace(/\n/g, "").slice(0, NAME_LIMIT);
    if (name || note.text) table.push({
      name, note: note.text.slice(0, NOTE_LIMIT), kind: categories[i],
      needsReview: names[i].differs || names[i].confidence < 0.93 || note.confidence < 0.88 || !categories[i],
    });
  }
  if (!table.length) return null;
  const text = table.map(row => {
    const tag = row.kind === "black" ? "避雷：" : row.kind === "red" ? "好评：" : "";
    // Keep the name and its reason on one logical line in the editable transcript.
    return tag + row.name + (row.note ? "｜" + row.note.replace(/\n/g, "") : "");
  }).join("\n");
  return { text, table };
}
