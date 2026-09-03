import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm";

const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";

let segmenterPromise = null;

function loadSegmenter() {
  segmenterPromise ??= createSegmenter();
  return segmenterPromise;
}

async function createSegmenter() {
  const progress_callback = (info) => {
    if (info.status === "progress") {
      postMessage({ type: "status", text: `loading model… ${Math.round(info.progress)}%` });
    }
  };

  if ("gpu" in navigator) {
    try {
      return await pipeline("background-removal", MODEL_ID, {
        device: "webgpu",
        dtype: "fp16",
        progress_callback,
      });
    } catch (err) {
      console.warn("WebGPU pipeline failed, falling back to WASM:", err);
    }
  }

  return pipeline("background-removal", MODEL_ID, { device: "wasm", progress_callback });
}

self.onmessage = async (event) => {
  const { source } = event.data;
  try {
    postMessage({ type: "status", text: "loading model…" });
    const segmenter = await loadSegmenter();

    postMessage({ type: "status", text: "processing…" });
    const start = performance.now();
    const cutout = await segmenter(source);
    const seconds = (performance.now() - start) / 1000;

    const { data, width, height } = cutout;
    const buffer = data.buffer;
    postMessage({ type: "result", width, height, buffer, seconds }, [buffer]);
  } catch (err) {
    postMessage({ type: "error", message: err?.message ?? String(err) });
  }
};
