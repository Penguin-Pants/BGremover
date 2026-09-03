import { normalizeColor } from "./shared.mjs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const params = new URLSearchParams(location.search);
const bgParam = params.get("bg");
const srcParam = params.get("src");

const canvas = document.querySelector("#cv");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const downloadBtn = document.querySelector("#dl");
const dropzone = document.querySelector("#dropzone");
const fileInput = document.querySelector("#file-input");

const worker = new Worker("./worker.js", { type: "module" });

let downloadName = "image";

function baseName(nameOrUrl) {
  const last = nameOrUrl.split("/").pop().split("?")[0].split("#")[0];
  return last.replace(/\.[^.]+$/, "") || "image";
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(busy) {
  fileInput.disabled = busy;
  dropzone.classList.toggle("disabled", busy);
  if (busy) downloadBtn.disabled = true;
}

function process(source, name) {
  if (source instanceof File && source.size > MAX_FILE_BYTES) {
    setStatus(`failed: file too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB)`);
    return;
  }
  downloadName = name;
  setBusy(true);
  worker.postMessage({ source });
}

worker.onerror = (event) => {
  setStatus(`failed: ${event.message ?? "worker could not start"}`);
  setBusy(false);
};

worker.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "status") {
    setStatus(msg.text);
    return;
  }
  if (msg.type === "result") {
    const { width, height, buffer, seconds } = msg;
    canvas.width = width;
    canvas.height = height;
    canvas.classList.add("visible");

    const offscreen = new OffscreenCanvas(width, height);
    offscreen.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);

    ctx.clearRect(0, 0, width, height);
    const bgColor = normalizeColor(bgParam);
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(offscreen, 0, 0);

    setStatus(`${width}x${height} · ${seconds.toFixed(1)}s`);
    setBusy(false);
    downloadBtn.disabled = false;
    return;
  }
  if (msg.type === "error") {
    setStatus(`failed: ${msg.message}`);
    setBusy(false);
  }
};

downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `${downloadName}-no-bg.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) process(file, baseName(file.name));
});

for (const evt of ["dragover", "dragleave", "drop"]) {
  dropzone.addEventListener(evt, (e) => e.preventDefault());
}
dropzone.addEventListener("dragover", () => dropzone.classList.add("dragover"));
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) process(file, baseName(file.name));
});

if (srcParam) {
  setStatus("loading image…");
  process(srcParam, baseName(srcParam));
}
