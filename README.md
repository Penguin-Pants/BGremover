# BGremover

BGremover removes the background from an image. All processing runs on your own machine. No image is uploaded to a server.

The idea and the interface follow [bg-gone](https://bentossell.com/bg-gone/) by [Ben Tossell](https://bentossell.com). This repository is a separate, original implementation. It uses the same class of open model (BiRefNet lite, MIT license) through [transformers.js](https://github.com/huggingface/transformers.js).

BGremover has two parts:
- A browser app. It runs in your browser tab, on your GPU.
- A CLI tool. It runs in Node, on your CPU.

## Browser app

Serve the `web/` folder over local HTTP, then open it in a browser:

```
npx serve web
```

Opening `web/index.html` directly from disk (a `file://` URL) does not work. Browsers block ES module scripts, which this app relies on, from loading over `file://`.

**Manual use**
1. Open the served page.
2. Drop an image on the page, or click the drop zone to choose a file.
3. Wait for the status line to show the result size and time.
4. Click **Download PNG**.

**Automated use**

Add query parameters to the URL to process an image without clicking anything:
- `?src=<image-url>` loads and processes that image on page load.
- `&bg=white`, `&bg=black`, `&bg=<css-colour-name>` or `&bg=<hex-without-the-hash>` fills the background with a solid colour instead of leaving it transparent.

Example: `http://localhost:3000/index.html?src=https://example.com/photo.jpg&bg=white`

The page exposes a fixed set of elements and behaviour for automation:
- The cutout renders into `canvas#cv`.
- `#status` reads `WxH · Ns` when the cutout is done, or starts with `failed` if it could not process the image.
- Read the result with `document.querySelector('#cv').toDataURL('image/png')`, or click `#dl` to download `<name>-no-bg.png`.
- The model runs in a Web Worker, off the main thread. Headless Chrome can poll `#status` while it waits. Launch Chrome with `--enable-unsafe-webgpu` for GPU support in headless mode.

The first run downloads the model (about 110MB) to the browser cache. Later runs reuse it. A GPU with WebGPU support gives about 5 seconds per image after that. Without WebGPU, the page falls back to a slower CPU path in the browser.

## CLI tool

Requires Node 20 or later.

```
npm install
node bin/bgremover.mjs photo.jpg
node bin/bgremover.mjs a.jpg b.png --bg white --out ./cut
```

- `bgremover <image...>` writes `<name>-no-bg.png` next to each input file.
- `--bg <color>` fills the background with a solid colour (name or hex) instead of alpha.
- `--out <dir>` writes all output files to this folder instead.

The first run downloads the model (about 210MB) to `~/.cache/huggingface`. Later runs reuse it. Processing takes about 15 seconds per image on an M-series Mac, since the CLI runs on CPU only.

## How it works

Both parts use the `background-removal` pipeline from [`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers) with the [`onnx-community/BiRefNet_lite-ONNX`](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) model. The browser app loads a half-precision (fp16) copy of the model on the GPU through WebGPU, or falls back to WASM on the CPU. The CLI loads the full-precision (fp32) copy on the CPU, using [`sharp`](https://sharp.pixelplumbing.com/) for the optional solid-background fill.

No part of this tool sends an image, a URL or a result to any server other than the one hosting the model weights on first download.
