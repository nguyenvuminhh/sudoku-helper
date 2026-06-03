from __future__ import annotations

import os
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Protocol

from backend.app.sudoku.grid import parse_grid, validate_grid

WARPED_GRID_SIZE = 450
CLASSIFIER_SIZE = 28
DEFAULT_DIGIT_MODEL_REPO = "onnxmodelzoo/mnist-8"
DEFAULT_DIGIT_MODEL_FILENAME = "mnist-8.onnx"
DEFAULT_DIGIT_MODEL_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "models" / "onnx-mnist" / DEFAULT_DIGIT_MODEL_FILENAME
)


@dataclass(frozen=True)
class OcrCell:
    row: int
    col: int
    value: int | None
    confidence: float


@dataclass(frozen=True)
class OcrResult:
    cells: list[OcrCell]
    warnings: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "cells": [cell.__dict__ for cell in self.cells],
            "warnings": self.warnings,
        }


@dataclass(frozen=True)
class ExtractedCell:
    row: int
    col: int
    image: object
    has_ink: bool
    ink_ratio: float


@dataclass(frozen=True)
class DigitPrediction:
    value: int | None
    confidence: float


class DigitClassifier(Protocol):
    def predict(self, cell_image: object) -> DigitPrediction:
        """Return a blank/1-9 prediction for one pre-segmented Sudoku cell."""


def recognize_sudoku_image(image_bytes: bytes, filename: str) -> OcrResult:
    warnings: list[str] = []
    try:
        cells = extract_sudoku_cells(image_bytes)
        classifier = load_digit_classifier()
        ocr_cells = [_classify_cell(cell, classifier) for cell in cells]
        warnings.extend(_grid_consistency_warnings(ocr_cells))

        digit_count = sum(1 for cell in ocr_cells if cell.value is not None)
        if digit_count == 0:
            warnings.append("Grid was detected, but no digits were classified. Review the correction grid manually.")
        else:
            warnings.append("Grid detected with OpenCV. Review the classified digits before asking for a hint.")
        return OcrResult(cells=ocr_cells, warnings=warnings)
    except Exception as exc:  # noqa: BLE001 - optional CV dependencies and arbitrary uploads can fail many ways.
        try:
            fallback = _recognize_with_tesseract(image_bytes)
            return OcrResult(
                cells=fallback.cells,
                warnings=[
                    f"OpenCV grid parser could not read {filename or 'the upload'}: {exc}",
                    "Used generic OCR fallback. Review every digit before asking for a hint.",
                    *fallback.warnings,
                ],
            )
        except Exception as fallback_exc:  # noqa: BLE001
            return OcrResult(
                cells=_empty_cells(),
                warnings=[
                    f"Could not find a Sudoku grid in {filename or 'the upload'}.",
                    "Use a clean crop with the full outer border visible, or enter the puzzle manually in the correction grid.",
                ],
            )


def extract_sudoku_cells(image_bytes: bytes) -> list[ExtractedCell]:
    cv2, np = _cv2_np()
    raw = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(raw, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError("upload is not a readable image")

    warped = _extract_warped_grid(image)
    cell_size = WARPED_GRID_SIZE // 9
    extracted: list[ExtractedCell] = []

    for row in range(9):
        for col in range(9):
            top = row * cell_size
            left = col * cell_size
            cell = warped[top : top + cell_size, left : left + cell_size]
            digit_area = _crop_cell_center(cell)
            normalized, ink_ratio = _normalize_digit_image(digit_area)
            extracted.append(
                ExtractedCell(
                    row=row + 1,
                    col=col + 1,
                    image=normalized,
                    has_ink=ink_ratio >= 0.018,
                    ink_ratio=ink_ratio,
                )
            )

    return extracted


def load_digit_classifier() -> DigitClassifier:
    model_path = os.getenv("SUDOKU_DIGIT_MODEL")
    if model_path:
        return OnnxDigitClassifier(model_path)
    downloaded_model = default_digit_model_path()
    if downloaded_model.exists():
        return OnnxDigitClassifier(downloaded_model)
    return TemplateDigitClassifier()


def default_digit_model_path() -> Path:
    return DEFAULT_DIGIT_MODEL_PATH


class TemplateDigitClassifier:
    def __init__(self) -> None:
        self._templates = _build_digit_templates()

    def predict(self, cell_image: object) -> DigitPrediction:
        cv2, np = _cv2_np()
        image = _ensure_uint8_cell(cell_image)
        if _ink_ratio(image) < 0.018:
            return DigitPrediction(value=None, confidence=0.96)

        _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        best_digit: int | None = None
        best_score = float("inf")

        for digit, template in self._templates.items():
            score = float(np.mean((binary.astype("float32") - template.astype("float32")) ** 2))
            if score < best_score:
                best_digit = digit
                best_score = score

        confidence = max(0.05, min(0.99, 1.0 - best_score / 18000.0))
        if confidence < 0.22:
            return DigitPrediction(value=None, confidence=confidence)
        return DigitPrediction(value=best_digit, confidence=confidence)


class OnnxDigitClassifier:
    def __init__(self, model_path: str | Path) -> None:
        import onnxruntime as ort  # type: ignore[import-not-found]

        self._session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self._input = self._session.get_inputs()[0]
        self._output_name = self._session.get_outputs()[0].name

    @classmethod
    def from_session(cls, session: object) -> "OnnxDigitClassifier":
        instance = cls.__new__(cls)
        instance._session = session
        instance._input = session.get_inputs()[0]
        instance._output_name = session.get_outputs()[0].name
        return instance

    def predict(self, cell_image: object) -> DigitPrediction:
        _, np = _cv2_np()
        image = _ensure_uint8_cell(cell_image)
        if _ink_ratio(image) < 0.018:
            return DigitPrediction(value=None, confidence=0.96)

        sample = image.astype("float32") / 255.0
        sample = _shape_onnx_sample(sample, self._input.shape)
        output = self._session.run([self._output_name], {self._input.name: sample})[0][0]
        probabilities = _as_probabilities(output)
        label = int(np.argmax(probabilities))
        confidence = float(probabilities[label])
        return DigitPrediction(value=None if label == 0 else label, confidence=confidence)


def _classify_cell(cell: ExtractedCell, classifier: DigitClassifier) -> OcrCell:
    if not cell.has_ink:
        return OcrCell(row=cell.row, col=cell.col, value=None, confidence=0.96)

    prediction = classifier.predict(cell.image)
    return OcrCell(
        row=cell.row,
        col=cell.col,
        value=prediction.value,
        confidence=prediction.confidence,
    )


def _extract_warped_grid(image: object) -> object:
    cv2, np = _cv2_np()
    blurred = cv2.GaussianBlur(image, (7, 7), 0)
    threshold = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11,
        2,
    )
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("no Sudoku grid contour found")

    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    outline = None
    for contour in contours[:12]:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) == 4 and cv2.contourArea(approx) > image.shape[0] * image.shape[1] * 0.15:
            outline = approx.reshape(4, 2)
            break

    if outline is None:
        raise ValueError("no square Sudoku grid outline found")

    ordered = _order_points(outline)
    target = np.array(
        [
            [0, 0],
            [WARPED_GRID_SIZE - 1, 0],
            [WARPED_GRID_SIZE - 1, WARPED_GRID_SIZE - 1],
            [0, WARPED_GRID_SIZE - 1],
        ],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(ordered, target)
    warped = cv2.warpPerspective(image, matrix, (WARPED_GRID_SIZE, WARPED_GRID_SIZE))
    return warped


def _crop_cell_center(cell: object) -> object:
    height, width = cell.shape[:2]
    margin_y = int(height * 0.18)
    margin_x = int(width * 0.18)
    return cell[margin_y : height - margin_y, margin_x : width - margin_x]


def _normalize_digit_image(image: object) -> tuple[object, float]:
    cv2, np = _cv2_np()
    blurred = cv2.GaussianBlur(image, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    large_contours = _large_digit_contours(contours, image.shape[:2])

    if not large_contours:
        return np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8), 0.0

    x, y, w, h = cv2.boundingRect(np.vstack(large_contours))
    digit = binary[y : y + h, x : x + w]
    ink_ratio = float(np.count_nonzero(digit)) / float(binary.size)
    scale = min(20 / max(w, 1), 20 / max(h, 1))
    resized = cv2.resize(digit, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)
    top = (CLASSIFIER_SIZE - resized.shape[0]) // 2
    left = (CLASSIFIER_SIZE - resized.shape[1]) // 2
    canvas[top : top + resized.shape[0], left : left + resized.shape[1]] = resized
    return canvas, ink_ratio


def _large_digit_contours(contours: object, image_shape: tuple[int, int]) -> list[object]:
    cv2, _ = _cv2_np()
    height, width = image_shape
    large_contours: list[object] = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 10:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        is_tall_digit = h >= height * 0.42
        is_substantial = area >= height * width * 0.025
        not_grid_noise = w <= width * 0.92 and h <= height
        if is_tall_digit and is_substantial and not_grid_noise:
            large_contours.append(contour)

    return large_contours


def _build_digit_templates() -> dict[int, object]:
    cv2, np = _cv2_np()
    templates: dict[int, object] = {}
    font = cv2.FONT_HERSHEY_SIMPLEX
    for digit in range(1, 10):
        canvas = np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)
        text = str(digit)
        text_size, _ = cv2.getTextSize(text, font, 0.9, 2)
        x = (CLASSIFIER_SIZE - text_size[0]) // 2
        y = (CLASSIFIER_SIZE + text_size[1]) // 2
        cv2.putText(canvas, text, (x, y), font, 0.9, 255, 2, cv2.LINE_AA)
        templates[digit] = canvas
    return templates


def _grid_consistency_warnings(cells: list[OcrCell]) -> list[str]:
    payload = "".join(str(cell.value or 0) for cell in cells)
    validation = validate_grid(parse_grid(payload))
    if validation.valid:
        return []
    return ["Classified digits contain Sudoku conflicts. Fix highlighted cells before asking for a hint."]


def _order_points(points: object) -> object:
    _, np = _cv2_np()
    rect = np.zeros((4, 2), dtype="float32")
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1)
    rect[0] = points[np.argmin(sums)]
    rect[2] = points[np.argmax(sums)]
    rect[1] = points[np.argmin(diffs)]
    rect[3] = points[np.argmax(diffs)]
    return rect


def _ensure_uint8_cell(cell_image: object) -> object:
    _, np = _cv2_np()
    image = np.asarray(cell_image)
    if image.shape != (CLASSIFIER_SIZE, CLASSIFIER_SIZE):
        raise ValueError("digit classifier expects a 28x28 cell image")
    return image.astype("uint8")


def _shape_onnx_sample(sample: object, input_shape: object) -> object:
    _, np = _cv2_np()
    shape = list(input_shape or [])
    if len(shape) == 4 and shape[1] == 1:
        return sample.reshape((1, 1, CLASSIFIER_SIZE, CLASSIFIER_SIZE)).astype("float32")
    return sample.reshape((1, CLASSIFIER_SIZE, CLASSIFIER_SIZE, 1)).astype("float32")


def _as_probabilities(output: object) -> object:
    _, np = _cv2_np()
    values = np.asarray(output, dtype="float32").reshape(-1)
    total = float(np.sum(values))
    if len(values) == 10 and np.all(values >= 0) and 0.98 <= total <= 1.02:
        return values

    shifted = values - np.max(values)
    exp_values = np.exp(shifted)
    return exp_values / np.sum(exp_values)


def _ink_ratio(image: object) -> float:
    _, np = _cv2_np()
    return float(np.count_nonzero(image)) / float(image.size)


def _cv2_np() -> tuple[object, object]:
    import cv2  # type: ignore[import-not-found]
    import numpy as np  # type: ignore[import-not-found]

    return cv2, np


def _recognize_with_tesseract(image_bytes: bytes) -> OcrResult:
    from PIL import Image, ImageOps  # type: ignore[import-not-found]
    import pytesseract  # type: ignore[import-not-found]

    image = Image.open(BytesIO(image_bytes)).convert("L")
    image = ImageOps.autocontrast(image)
    width, height = image.size
    if width < 90 or height < 90:
        raise ValueError("image is too small to contain a readable Sudoku grid")

    cell_width = width / 9
    cell_height = height / 9
    cells: list[OcrCell] = []
    warnings: list[str] = []

    for row in range(9):
        for col in range(9):
            left = int(col * cell_width + cell_width * 0.15)
            top = int(row * cell_height + cell_height * 0.15)
            right = int((col + 1) * cell_width - cell_width * 0.15)
            bottom = int((row + 1) * cell_height - cell_height * 0.15)
            crop = image.crop((left, top, right, bottom))
            crop = crop.resize((96, 96))
            text = pytesseract.image_to_string(
                crop,
                config="--psm 10 --oem 3 -c tessedit_char_whitelist=123456789",
            )
            digit = _first_digit(text)
            cells.append(OcrCell(row=row + 1, col=col + 1, value=digit, confidence=0.78 if digit else 0.25))

    if all(cell.value is None for cell in cells):
        warnings.append("No digits were detected. Use a clean crop of the Sudoku grid or enter the puzzle manually.")
    else:
        warnings.append("Review the detected digits before asking for a hint.")

    return OcrResult(cells=cells, warnings=warnings)


def _first_digit(text: str) -> int | None:
    for char in text:
        if char in "123456789":
            return int(char)
    return None


def _empty_cells() -> list[OcrCell]:
    return [OcrCell(row=row, col=col, value=None, confidence=0.0) for row in range(1, 10) for col in range(1, 10)]
