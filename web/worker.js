import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm";
import { MODEL_ID } from "./shared.mjs";

const MODEL_LOAD_TIMEOUT_MS = 120_000;
const INFERENCE_TIMEOUT_MS = 60_000;

let segmenterPromise = null;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = withTimeout(createSegmenter(), MODEL_LOAD_TIMEOUT_MS, "loading model").catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
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
    const cutout = await withTimeout(segmenter(source), INFERENCE_TIMEOUT_MS, "processing");
    const seconds = (performance.now() - start) / 1000;

    const { data, width, height } = cutout;
    const buffer = data.buffer;
    postMessage({ type: "result", width, height, buffer, seconds }, [buffer]);
  } catch (err) {
    postMessage({ type: "error", message: err?.message ?? String(err) });
  }
};
