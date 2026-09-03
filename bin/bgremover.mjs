#!/usr/bin/env node
import { pipeline } from "@huggingface/transformers";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";

function printUsage() {
  console.log(`bgremover - remove image backgrounds locally. Nothing is uploaded.

Usage:
  bgremover <image...> [--bg <color>] [--out <dir>]

Options:
  --bg <color>   Fill the background with a solid color (name or hex) instead of alpha.
  --out <dir>    Write output files here instead of next to each input.
  -h, --help     Show this help.

Examples:
  bgremover photo.jpg
  bgremover a.jpg b.png --bg white --out ./cut

The first run downloads the model (~210MB) to ~/.cache/huggingface and reuses it after that.`);
}

function parseArgs(argv) {
  const inputs = [];
  let bg = null;
  let outDir = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bg") {
      bg = argv[++i];
    } else if (arg === "--out") {
      outDir = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      return { help: true };
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      inputs.push(arg);
    }
  }
  return { inputs, bg, outDir };
}

function normalizeColor(bg) {
  if (!bg) return null;
  return /^[0-9a-fA-F]{3,8}$/.test(bg) ? `#${bg}` : bg;
}

function outputPathFor(inputPath, outDir) {
  const dir = outDir ?? path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}-no-bg.png`);
}

function computeOutputs(inputs, outDir) {
  const inputSet = new Set(inputs.map((p) => path.resolve(p)));
  const outputs = [];
  const seenBy = new Map();

  for (const input of inputs) {
    const outPath = outputPathFor(input, outDir);
    const resolved = path.resolve(outPath);

    if (inputSet.has(resolved)) {
      throw new Error(`refusing to run: output for ${input} would overwrite an input file (${outPath})`);
    }
    if (seenBy.has(resolved)) {
      throw new Error(
        `refusing to run: ${seenBy.get(resolved)} and ${input} would both write to ${outPath}`,
      );
    }
    seenBy.set(resolved, input);
    outputs.push(outPath);
  }

  return outputs;
}

function logProgress(info) {
  if (info.status === "progress" && info.file) {
    process.stdout.write(`\rdownloading model: ${info.file} ${info.progress.toFixed(0)}%   `);
  } else if (info.status === "ready") {
    process.stdout.write("\n");
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const { inputs, bg, outDir, help } = parsed;

  if (help || inputs.length === 0) {
    printUsage();
    process.exitCode = help ? 0 : 1;
    return;
  }

  const bgColor = normalizeColor(bg);

  let outputs;
  try {
    outputs = computeOutputs(inputs, outDir);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (outDir) {
    await mkdir(outDir, { recursive: true });
  }

  let segmenter;
  try {
    segmenter = await pipeline("background-removal", MODEL_ID, {
      device: "cpu",
      progress_callback: logProgress,
    });
  } catch (err) {
    console.error(`\nfailed to load model: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const outPath = outputs[i];
    const start = performance.now();
    try {
      await access(input);
      const cutout = await segmenter(input);
      if (bgColor) {
        await cutout.toSharp().flatten({ background: bgColor }).png().toFile(outPath);
      } else {
        await cutout.save(outPath);
      }
      const seconds = ((performance.now() - start) / 1000).toFixed(1);
      console.log(`${input} -> ${outPath} (${seconds}s)`);
    } catch (err) {
      failures++;
      console.error(`${input}: failed (${err.message})`);
    }
  }

  process.exitCode = failures > 0 ? 1 : 0;
}

main();
