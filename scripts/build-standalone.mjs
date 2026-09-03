#!/usr/bin/env node
// Generates bgremover-standalone.html: a single self-contained file with the
// same behavior as web/index.html, but that opens directly from disk
// (file://) with no local server.
//
// Browsers refuse to load a `<script type="module" src="...">` or a module
// Worker's script *file* over file://, so the multi-file web/ app can't just
// be opened directly. This works around that by inlining app.js on the page
// as a classic (non-module) script, and inlining worker.js as a string that
// gets turned into a Worker via a Blob URL instead of a file path. Blob
// URLs are exempt from that restriction.
//
// Run this after changing anything under web/; it is not run automatically.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webDir = path.join(rootDir, "web");
const outputPath = path.join(rootDir, "bgremover-standalone.html");

const SHARED_IMPORT_IN_APP = 'import { normalizeColor } from "./shared.mjs";\n\n';
const SHARED_IMPORT_IN_WORKER = 'import { MODEL_ID } from "./shared.mjs";\n';
const WORKER_CONSTRUCTOR = 'const worker = new Worker("./worker.js", { type: "module" });';
const APP_SCRIPT_TAG = '<script type="module" src="./app.js"></script>';

function stripExports(source) {
  return source.replace(/^export\s+/gm, "");
}

function requireReplace(source, target, replacement, label) {
  if (!source.includes(target)) {
    throw new Error(`build-standalone: expected to find ${label}, but web/ has changed shape; update this script`);
  }
  return source.replace(target, replacement);
}

async function main() {
  const [html, appJs, workerJs, sharedMjs] = await Promise.all([
    readFile(path.join(webDir, "index.html"), "utf8"),
    readFile(path.join(webDir, "app.js"), "utf8"),
    readFile(path.join(webDir, "worker.js"), "utf8"),
    readFile(path.join(webDir, "shared.mjs"), "utf8"),
  ]);

  const sharedInline = stripExports(sharedMjs).trim();

  const workerSource = requireReplace(
    workerJs,
    SHARED_IMPORT_IN_WORKER,
    `const MODEL_ID = ${JSON.stringify(extractConst(sharedMjs, "MODEL_ID"))};\n`,
    "the shared.mjs import in worker.js",
  );

  const workerBlobStatement = [
    `const workerBlob = new Blob([${JSON.stringify(workerSource)}], { type: "text/javascript" });`,
    `const worker = new Worker(URL.createObjectURL(workerBlob), { type: "module" });`,
  ].join("\n");

  let appSource = requireReplace(
    appJs,
    SHARED_IMPORT_IN_APP,
    sharedInline + "\n\n",
    "the shared.mjs import in app.js",
  );
  appSource = requireReplace(appSource, WORKER_CONSTRUCTOR, workerBlobStatement, "the Worker constructor in app.js");

  const combinedScript = `<script>\n(function () {\n"use strict";\n\n${appSource}\n})();\n</script>`;

  const standaloneHtml = requireReplace(html, APP_SCRIPT_TAG, combinedScript, "the app.js script tag in index.html");

  await writeFile(outputPath, standaloneHtml);
  console.log(`wrote ${path.relative(rootDir, outputPath)}`);
}

function extractConst(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  if (!match) throw new Error(`build-standalone: could not find ${name} in shared.mjs`);
  return match[1];
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
