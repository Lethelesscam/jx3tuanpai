import { assetPath } from "./board-client";

export type LineResult = { text: string; confidence: number };

type Tensor = { data: Float32Array; dims: readonly number[]; dispose?: () => void };
type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run: (feeds: Record<string, Tensor>) => Promise<Record<string, Tensor>> };
type Ort = {
  env: { wasm: { numThreads: number; wasmPaths: string } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => Tensor;
  InferenceSession: { create: (model: ArrayBuffer, options: { executionProviders: string[] }) => Promise<Session> };
};
type Recognizer = (canvas: HTMLCanvasElement, stretch?: number) => Promise<LineResult>;

let loading: Promise<Recognizer> | null = null;
export function loadTableRecognizer() {
  if (!loading) loading = initialize().catch(error => { loading = null; throw error; });
  return loading;
}

async function initialize(): Promise<Recognizer> {
  const base = new URL(assetPath("ocr/table/"), window.location.href).href;
  const script = base + "ort.wasm.min.mjs";
  const [ort, dict, model] = await Promise.all([
    import(/* @vite-ignore */ script) as Promise<Ort>,
    fetch(base + "ppocr_keys_v1.txt").then(response => {
      if (!response.ok) throw new Error("无法读取 OCR 字表");
      return response.text();
    }),
    fetch(base + "ppocr-v4.onnx", { signal: AbortSignal.timeout(40000) }).then(response => {
      if (!response.ok) throw new Error("无法读取名单识别模型");
      return response.arrayBuffer();
    }),
  ]);
  const alphabet = ["", ...dict.trimEnd().split(/\r?\n/), " "];
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = base;
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  return async (line, stretch = 1) => {
    const data = preprocess(line, stretch);
    const input = new ort.Tensor("float32", data.values, [1, 3, data.height, data.width]);
    try {
      const outputs = await session.run({ [session.inputNames[0]]: input });
      const output = outputs[session.outputNames[0]];
      const [, steps, classes] = output.dims;
      let previous = 0, score = 0;
      const characters: string[] = [];
      for (let step = 0; step < steps; step++) {
        let winner = 0;
        const offset = step * classes;
        for (let i = 1; i < classes; i++) {
          if (output.data[offset + i] > output.data[offset + winner]) winner = i;
        }
        if (winner !== previous && winner && alphabet[winner] !== undefined) {
          characters.push(alphabet[winner]);
          score += output.data[offset + winner];
        }
        previous = winner;
      }
      output.dispose?.();
      return { text: characters.join("").trim(), confidence: characters.length ? score / characters.length : 0 };
    } finally { input.dispose?.(); }
  };
}

function preprocess(line: HTMLCanvasElement, stretch: number) {
  const height = 48;
  const contentWidth = Math.min(1008, Math.max(1, Math.ceil(line.width * height / line.height * stretch)));
  const width = Math.max(320, Math.ceil(contentWidth / 8) * 8);
  const sample = document.createElement("canvas");
  sample.width = contentWidth;
  sample.height = height;
  const context = sample.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(line, 0, 0, contentWidth, height);
  const rgba = context.getImageData(0, 0, contentWidth, height).data;
  const size = width * height;
  const values = new Float32Array(3 * size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < contentWidth; x++) {
      const source = (y * contentWidth + x) * 4;
      const target = y * width + x;
      values[target] = rgba[source + 2] / 127.5 - 1;
      values[size + target] = rgba[source + 1] / 127.5 - 1;
      values[2 * size + target] = rgba[source] / 127.5 - 1;
    }
  }
  return { values, width, height };
}
