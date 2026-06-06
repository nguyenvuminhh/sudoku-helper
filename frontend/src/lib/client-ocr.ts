import type { OcrResponse } from "./api";

const WARPED_GRID_SIZE = 450;
const CLASSIFIER_SIZE = 28;
const CELL_COUNT = 9;
const CELL_SIZE = WARPED_GRID_SIZE / CELL_COUNT;
const MODEL_TARGET_SIZE = 18;
const DIGIT_INK_THRESHOLD = 0.018;
const DEFAULT_MODEL_PATH = "/models/mnist-12.onnx";
const OPENCV_SCRIPT_PATH = "/vendor/opencv.js";

type Cv = Record<string, any>;
type CvMat = any;
type CvMatVector = any;
type CvRect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type DigitCandidate = {
  image: Uint8Array;
  inkRatio: number;
  score: number;
};
type DigitPrediction = {
  value: number | null;
  confidence: number;
};

let cvPromise: Promise<Cv> | null = null;
let classifierPromise: Promise<ClientDigitClassifier> | null = null;

declare global {
  interface Window {
    cv?: Cv;
  }
}

export async function recognizeImageInBrowser(file: File): Promise<OcrResponse> {
  const [cv, classifier] = await Promise.all([loadOpenCv(), loadClientDigitClassifier()]);
  const source = await imageFileToMat(cv, file);
  const mats: CvMat[] = [source];

  try {
    const gray = new cv.Mat();
    mats.push(gray);
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);

    const warped = extractWarpedGrid(cv, gray);
    mats.push(warped);

    const cells = [];
    for (let row = 0; row < CELL_COUNT; row += 1) {
      for (let col = 0; col < CELL_COUNT; col += 1) {
        const normalized = normalizeDigitCell(cv, warped, row, col);
        const prediction = normalized.inkRatio >= DIGIT_INK_THRESHOLD ? await classifier.predict(normalized.image) : { value: null, confidence: 0.96 };
        cells.push({
          row: row + 1,
          col: col + 1,
          value: prediction.value,
          confidence: prediction.confidence
        });
      }
    }

    return {
      cells,
      warnings: ["Grid detected in the browser. Review the classified digits before asking for a hint."]
    };
  } finally {
    deleteMats(mats);
  }
}

export function preloadBrowserOcr(): void {
  void Promise.allSettled([loadOpenCv(), loadClientDigitClassifier()]);
}

export function resolveClientOcrModelPath(basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "", configuredPath = process.env.NEXT_PUBLIC_SUDOKU_DIGIT_MODEL_PATH ?? ""): string {
  const explicitPath = configuredPath.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "");
  return normalizedBasePath ? `/${normalizedBasePath}${DEFAULT_MODEL_PATH}` : DEFAULT_MODEL_PATH;
}

export function applyDigitShapeGuards(label: number, image: Uint8Array): number {
  const features = collectDigitShapeFeatures(image);
  if (!features) {
    return label;
  }

  if (label === 7 && features.topRowMax <= 8) {
    return 1;
  }

  if (label === 6 && features.rightInkRatio - features.leftInkRatio >= 0.025 && features.centerY >= 13.55) {
    return 9;
  }

  return label;
}

async function loadOpenCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = loadOpenCvScript();
  }
  return cvPromise;
}

async function loadOpenCvScript(): Promise<Cv> {
  if (window.cv?.Mat) {
    return window.cv;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-client-ocr-opencv="true"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("OpenCV.js failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.clientOcrOpencv = "true";
    script.src = resolvePublicAssetPath(OPENCV_SCRIPT_PATH);
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("OpenCV.js failed to load.")), { once: true });
    document.head.append(script);
  });

  const cv = window.cv;
  if (!cv) {
    throw new Error("OpenCV.js did not expose a cv runtime.");
  }
  if (cv.Mat) {
    return cv;
  }

  await new Promise<void>((resolve) => {
    cv.onRuntimeInitialized = () => resolve();
  });
  return cv;
}

async function loadClientDigitClassifier(): Promise<ClientDigitClassifier> {
  if (!classifierPromise) {
    classifierPromise = ClientDigitClassifier.create(resolveClientOcrModelPath());
  }
  return classifierPromise;
}

class ClientDigitClassifier {
  private constructor(
    private readonly ort: typeof import("onnxruntime-web/wasm"),
    private readonly session: import("onnxruntime-web/wasm").InferenceSession,
    private readonly inputName: string,
    private readonly outputName: string
  ) {}

  static async create(modelPath: string): Promise<ClientDigitClassifier> {
    const ort = await import("onnxruntime-web/wasm");
    const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["wasm"] });
    return new ClientDigitClassifier(ort, session, session.inputNames[0], session.outputNames[0]);
  }

  async predict(image: Uint8Array): Promise<DigitPrediction> {
    const sample = Float32Array.from(image, (value) => value / 255);
    const tensor = new this.ort.Tensor("float32", sample, [1, 1, CLASSIFIER_SIZE, CLASSIFIER_SIZE]);
    const outputs = await this.session.run({ [this.inputName]: tensor });
    const output = outputs[this.outputName].data;
    const probabilities = asProbabilities(Array.from(output as Iterable<number>));
    const rawLabel = probabilities.indexOf(Math.max(...probabilities));
    const label = applyDigitShapeGuards(rawLabel, image);
    return {
      value: label === 0 ? null : label,
      confidence: probabilities[rawLabel] ?? 0
    };
  }
}

async function imageFileToMat(cv: Cv, file: File): Promise<CvMat> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Browser image canvas is unavailable.");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return cv.matFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
}

function extractWarpedGrid(cv: Cv, image: CvMat): CvMat {
  const blurred = new cv.Mat();
  const threshold = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const temporaries: CvMat[] = [blurred, threshold, hierarchy];
  const vectors: CvMatVector[] = [contours];

  try {
    cv.GaussianBlur(image, blurred, new cv.Size(7, 7), 0);
    cv.adaptiveThreshold(blurred, threshold, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
    cv.findContours(threshold, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const outline = findGridOutline(cv, contours, image.rows * image.cols * 0.15);
    if (!outline) {
      throw new Error("Could not find a Sudoku grid outline.");
    }

    const ordered = orderPoints(outline);
    const source = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]));
    const target = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, WARPED_GRID_SIZE - 1, 0, WARPED_GRID_SIZE - 1, WARPED_GRID_SIZE - 1, 0, WARPED_GRID_SIZE - 1]);
    const matrix = cv.getPerspectiveTransform(source, target);
    const warped = new cv.Mat();
    temporaries.push(source, target, matrix);
    cv.warpPerspective(image, warped, matrix, new cv.Size(WARPED_GRID_SIZE, WARPED_GRID_SIZE));
    return warped;
  } finally {
    deleteMats(temporaries);
    deleteVectors(vectors);
  }
}

function findGridOutline(cv: Cv, contours: CvMatVector, minimumArea: number): Point[] | null {
  const indexes = Array.from({ length: contours.size() }, (_, index) => index).sort((left, right) => {
    const leftContour = contours.get(left);
    const rightContour = contours.get(right);
    const difference = cv.contourArea(rightContour) - cv.contourArea(leftContour);
    leftContour.delete();
    rightContour.delete();
    return difference;
  });

  for (const index of indexes.slice(0, 12)) {
    const contour = contours.get(index);
    const approximation = new cv.Mat();
    try {
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approximation, 0.02 * perimeter, true);
      if (approximation.rows === 4 && cv.contourArea(approximation) > minimumArea) {
        return pointsFromApproximation(approximation);
      }
    } finally {
      contour.delete();
      approximation.delete();
    }
  }

  return null;
}

function normalizeDigitCell(cv: Cv, warpedGrid: CvMat, row: number, col: number): { image: Uint8Array; inkRatio: number } {
  const cell = warpedGrid.roi(new cv.Rect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE));
  const cropMargin = Math.floor(CELL_SIZE * 0.1);
  const digitArea = cell.roi(new cv.Rect(cropMargin, cropMargin, CELL_SIZE - cropMargin * 2, CELL_SIZE - cropMargin * 2));
  const candidates: DigitCandidate[] = [];

  try {
    for (const thresholdType of [cv.THRESH_BINARY_INV, cv.THRESH_BINARY]) {
      const candidate = normalizeDigitPolarity(cv, digitArea, thresholdType);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  } finally {
    deleteMats([digitArea, cell]);
  }

  if (candidates.length === 0) {
    return { image: new Uint8Array(CLASSIFIER_SIZE * CLASSIFIER_SIZE), inkRatio: 0 };
  }

  const best = candidates.reduce((current, next) => (next.score > current.score ? next : current));
  return { image: best.image, inkRatio: best.inkRatio };
}

function normalizeDigitPolarity(cv: Cv, image: CvMat, thresholdType: number): DigitCandidate | null {
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.GaussianBlur(image, blurred, new cv.Size(3, 3), 0);
    cv.threshold(blurred, binary, 0, 255, thresholdType | cv.THRESH_OTSU);
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const bounds = largeDigitBounds(cv, contours, image.rows, image.cols);
    if (!bounds) {
      return null;
    }

    const digit = binary.roi(new cv.Rect(bounds.x, bounds.y, bounds.width, bounds.height));
    try {
      const inkRatio = cv.countNonZero(digit) / (binary.rows * binary.cols);
      return {
        image: resizeDigitToClassifierInput(cv, digit, bounds.width, bounds.height),
        inkRatio,
        score: inkRatio + (bounds.height / image.rows) * 0.03
      };
    } finally {
      digit.delete();
    }
  } finally {
    deleteMats([blurred, binary, hierarchy]);
    deleteVectors([contours]);
  }
}

function largeDigitBounds(cv: Cv, contours: CvMatVector, imageHeight: number, imageWidth: number): CvRect | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;
  let found = false;

  for (let index = 0; index < contours.size(); index += 1) {
    const contour = contours.get(index);
    try {
      const area = cv.contourArea(contour);
      if (area < 10) {
        continue;
      }

      const rect = cv.boundingRect(contour) as CvRect;
      const isTallDigit = rect.height >= imageHeight * 0.42;
      const isSubstantial = area >= imageHeight * imageWidth * 0.025;
      const isNotGridNoise = rect.width <= imageWidth * 0.92 && rect.height <= imageHeight;
      if (!isTallDigit || !isSubstantial || !isNotGridNoise) {
        continue;
      }

      left = Math.min(left, rect.x);
      top = Math.min(top, rect.y);
      right = Math.max(right, rect.x + rect.width);
      bottom = Math.max(bottom, rect.y + rect.height);
      found = true;
    } finally {
      contour.delete();
    }
  }

  return found ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

function resizeDigitToClassifierInput(cv: Cv, digit: CvMat, width: number, height: number): Uint8Array {
  const scale = Math.min(MODEL_TARGET_SIZE / Math.max(width, 1), MODEL_TARGET_SIZE / Math.max(height, 1));
  const resizedWidth = Math.max(1, Math.round(width * scale));
  const resizedHeight = Math.max(1, Math.round(height * scale));
  const resized = new cv.Mat();
  const output = new Uint8Array(CLASSIFIER_SIZE * CLASSIFIER_SIZE);

  try {
    cv.resize(digit, resized, new cv.Size(resizedWidth, resizedHeight), 0, 0, cv.INTER_AREA);
    const top = Math.floor((CLASSIFIER_SIZE - resizedHeight) / 2);
    const left = Math.floor((CLASSIFIER_SIZE - resizedWidth) / 2);
    for (let y = 0; y < resizedHeight; y += 1) {
      for (let x = 0; x < resizedWidth; x += 1) {
        output[(top + y) * CLASSIFIER_SIZE + left + x] = resized.ucharPtr(y, x)[0];
      }
    }
    return output;
  } finally {
    resized.delete();
  }
}

function pointsFromApproximation(approximation: CvMat): Point[] {
  const data = Array.from(approximation.data32S as Int32Array);
  const points: Point[] = [];
  for (let index = 0; index < data.length; index += 2) {
    points.push({ x: data[index], y: data[index + 1] });
  }
  return points;
}

function orderPoints(points: Point[]): Point[] {
  const topLeft = points.reduce((best, point) => (point.x + point.y < best.x + best.y ? point : best));
  const bottomRight = points.reduce((best, point) => (point.x + point.y > best.x + best.y ? point : best));
  const topRight = points.reduce((best, point) => (point.x - point.y > best.x - best.y ? point : best));
  const bottomLeft = points.reduce((best, point) => (point.x - point.y < best.x - best.y ? point : best));
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function asProbabilities(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length === 10 && values.every((value) => value >= 0) && total >= 0.98 && total <= 1.02) {
    return values;
  }

  const max = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - max));
  const exponentialTotal = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / exponentialTotal);
}

function collectDigitShapeFeatures(image: Uint8Array): { topRowMax: number; leftInkRatio: number; rightInkRatio: number; centerY: number } | null {
  let ink = 0;
  let topRowMax = 0;
  let leftInk = 0;
  let rightInk = 0;
  let weightedY = 0;

  for (let row = 0; row < CLASSIFIER_SIZE; row += 1) {
    let rowInk = 0;
    for (let col = 0; col < CLASSIFIER_SIZE; col += 1) {
      if (image[row * CLASSIFIER_SIZE + col] === 0) {
        continue;
      }
      ink += 1;
      rowInk += 1;
      weightedY += row;
      if (col <= 10) {
        leftInk += 1;
      }
      if (col >= 17) {
        rightInk += 1;
      }
    }
    if (row < 10) {
      topRowMax = Math.max(topRowMax, rowInk);
    }
  }

  if (ink === 0) {
    return null;
  }

  return {
    topRowMax,
    leftInkRatio: leftInk / ink,
    rightInkRatio: rightInk / ink,
    centerY: weightedY / ink
  };
}

function resolvePublicAssetPath(assetPath: string): string {
  const normalizedBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
  return normalizedBasePath ? `/${normalizedBasePath}${assetPath}` : assetPath;
}

function deleteMats(mats: CvMat[]): void {
  for (const mat of mats) {
    mat.delete();
  }
}

function deleteVectors(vectors: CvMatVector[]): void {
  for (const vector of vectors) {
    vector.delete();
  }
}
