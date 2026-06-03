from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO


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


def recognize_sudoku_image(image_bytes: bytes, filename: str) -> OcrResult:
    try:
        return _recognize_with_tesseract(image_bytes)
    except Exception as exc:  # noqa: BLE001 - optional OCR dependencies can fail many ways.
        return OcrResult(
            cells=_empty_cells(),
            warnings=[
                f"Local OCR could not read {filename or 'the upload'}: {exc}",
                "The image was accepted; review and enter the puzzle manually in the correction grid.",
            ],
        )


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
