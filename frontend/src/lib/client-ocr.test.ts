import { describe, expect, it } from "vitest";

import { applyDigitShapeGuards, resolveClientOcrModelPath } from "./client-ocr";

function digitImage(points: Array<[number, number]>): Uint8Array {
  const image = new Uint8Array(28 * 28);
  for (const [row, col] of points) {
    image[row * 28 + col] = 255;
  }
  return image;
}

describe("client OCR helpers", () => {
  it("resolves the default model path under a normalized base path", () => {
    expect(resolveClientOcrModelPath("/tools/puzzle-hint/")).toBe("/tools/puzzle-hint/models/mnist-12.onnx");
    expect(resolveClientOcrModelPath("")).toBe("/models/mnist-12.onnx");
  });

  it("keeps an explicitly configured absolute model URL unchanged", () => {
    expect(resolveClientOcrModelPath("", "https://cdn.example.test/mnist.onnx")).toBe("https://cdn.example.test/mnist.onnx");
  });

  it("corrects a narrow one that the model reports as seven", () => {
    const image = digitImage(Array.from({ length: 18 }, (_, index) => [5 + index, 14]));

    expect(applyDigitShapeGuards(7, image)).toBe(1);
  });

  it("does not correct a seven that has a top bar", () => {
    const topBar = Array.from({ length: 12 }, (_, index) => [5, 8 + index] as [number, number]);
    const diagonal = Array.from({ length: 17 }, (_, index) => [6 + index, 19 - Math.floor(index / 2)] as [number, number]);
    const image = digitImage([...topBar, ...diagonal]);

    expect(applyDigitShapeGuards(7, image)).toBe(7);
  });

  it("corrects a right-heavy top-loop nine that the model reports as six", () => {
    const loop = [
      ...Array.from({ length: 8 }, (_, index) => [5, 11 + index] as [number, number]),
      ...Array.from({ length: 8 }, (_, index) => [12, 11 + index] as [number, number]),
      ...Array.from({ length: 7 }, (_, index) => [6 + index, 18] as [number, number]),
      ...Array.from({ length: 17 }, (_, index) => [10 + index, 19] as [number, number]),
      ...Array.from({ length: 8 }, (_, index) => [18 + index, 18] as [number, number])
    ];

    expect(applyDigitShapeGuards(6, digitImage(loop))).toBe(9);
  });
});
