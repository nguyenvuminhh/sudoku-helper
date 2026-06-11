import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_NAME = "puzzle-hint-backend";
const TAURI_BINARIES_RELATIVE_DIR = "desktop/src-tauri/binaries";
const MODEL_DATA_DESTINATION = "data/models/sudoku-digits";
const MODEL_RELATIVE_PATHS = [
  "data/models/sudoku-digits/sudoku-digits.onnx",
  "data/models/sudoku-digits/sudoku-digits.onnx.data"
];
const TRAINING_ONLY_MODULES = ["torch", "torchvision", "PIL", "onnx", "onnxscript", "onnx_ir"];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const rootDir = path.resolve(desktopDir, "..");
const binariesDir = path.join(rootDir, TAURI_BINARIES_RELATIVE_DIR);
const extension = process.platform === "win32" ? ".exe" : "";
const pyinstallerDataSeparator = process.platform === "win32" ? ";" : ":";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
    env: { ...process.env, PYTHONPATH: rootDir, ...options.env }
  });
}

function pythonExecutable() {
  return process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
}

function targetTriple() {
  const hostTuple = tryRun("rustc", ["--print", "host-tuple"]);
  if (hostTuple) {
    return hostTuple.trim();
  }

  const rustVersion = tryRun("rustc", ["-Vv"]);
  if (rustVersion) {
    const hostLine = rustVersion.split(/\r?\n/).find((line) => line.startsWith("host:"));
    if (hostLine) {
      return hostLine.replace("host:", "").trim();
    }
  }

  const inferred = inferTargetTriple();
  console.warn(`rustc was not found; inferred Tauri target triple as ${inferred}.`);
  return inferred;
}

function tryRun(command, args) {
  try {
    return run(command, args);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function inferTargetTriple() {
  const host = `${process.platform}:${process.arch}`;
  switch (host) {
    case "darwin:arm64":
      return "aarch64-apple-darwin";
    case "darwin:x64":
      return "x86_64-apple-darwin";
    case "win32:x64":
      return "x86_64-pc-windows-msvc";
    case "win32:arm64":
      return "aarch64-pc-windows-msvc";
    default:
      throw new Error(`Could not infer Tauri target triple for ${host}. Install Rust and make rustc available.`);
  }
}

function assertExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} was not created at ${filePath}`);
  }
}

const pyinstaller = pythonExecutable();
const modelPaths = MODEL_RELATIVE_PATHS.map((relativePath) => path.join(rootDir, relativePath));
for (const modelPath of modelPaths) {
  assertExists(modelPath, "Required ONNX digit model");
}

console.log(`Building ${BACKEND_NAME} with PyInstaller...`);
execFileSync(
  pyinstaller,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    BACKEND_NAME,
    ...modelPaths.flatMap((modelPath) => [
      "--add-data",
      `${modelPath}${pyinstallerDataSeparator}${MODEL_DATA_DESTINATION}`
    ]),
    ...TRAINING_ONLY_MODULES.flatMap((moduleName) => ["--exclude-module", moduleName]),
    path.join("backend", "app", "desktop_server.py")
  ],
  {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, PYTHONPATH: rootDir }
  }
);

const builtBinary = path.join(rootDir, "dist", `${BACKEND_NAME}${extension}`);
assertExists(builtBinary, "PyInstaller backend sidecar");

mkdirSync(binariesDir, { recursive: true });
const triple = targetTriple();
const tauriBinary = path.join(binariesDir, `${BACKEND_NAME}-${triple}${extension}`);
copyFileSync(builtBinary, tauriBinary);

if (process.platform !== "win32") {
  chmodSync(tauriBinary, 0o755);
}

console.log(`Copied sidecar to ${path.relative(rootDir, tauriBinary)}`);
