import unittest

from backend.app.ocr import (
    TemplateDigitClassifier,
    extract_sudoku_cells,
    recognize_sudoku_image,
)


class OcrTests(unittest.TestCase):
    def test_recognize_sudoku_image_returns_editable_grid_shape(self):
        result = recognize_sudoku_image(b"not-a-real-image", "bad-upload.txt")

        self.assertEqual(len(result.cells), 81)
        self.assertTrue(all(0 <= cell.confidence <= 1 for cell in result.cells))
        self.assertTrue(all(cell.value is None or 1 <= cell.value <= 9 for cell in result.cells))
        self.assertGreaterEqual(len(result.warnings), 1)

    def test_extract_sudoku_cells_finds_positions_from_grid_image(self):
        image_bytes = make_synthetic_sudoku_image({(1, 1): 5, (5, 5): 9, (9, 9): 2})

        cells = extract_sudoku_cells(image_bytes)

        self.assertEqual(len(cells), 81)
        self.assertEqual(cells[0].row, 1)
        self.assertEqual(cells[0].col, 1)
        self.assertEqual(cells[40].row, 5)
        self.assertEqual(cells[40].col, 5)
        self.assertEqual(cells[80].row, 9)
        self.assertEqual(cells[80].col, 9)
        self.assertTrue(cells[0].has_ink)

    def test_template_digit_classifier_recognizes_isolated_digit(self):
        image_bytes = make_synthetic_sudoku_image({(1, 1): 7})
        cell = extract_sudoku_cells(image_bytes)[0]

        prediction = TemplateDigitClassifier().predict(cell.image)

        self.assertEqual(prediction.value, 7)
        self.assertGreater(prediction.confidence, 0.5)


if __name__ == "__main__":
    unittest.main()


def make_synthetic_sudoku_image(digits: dict[tuple[int, int], int]) -> bytes:
    import cv2
    import numpy as np

    size = 450
    cell = size // 9
    image = np.full((size, size), 255, dtype=np.uint8)

    for line in range(10):
        thickness = 4 if line % 3 == 0 else 1
        offset = line * cell
        cv2.line(image, (offset, 0), (offset, size), 0, thickness)
        cv2.line(image, (0, offset), (size, offset), 0, thickness)

    for (row, col), digit in digits.items():
        text = str(digit)
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 1.35
        thickness = 3
        text_size, _ = cv2.getTextSize(text, font, scale, thickness)
        x = (col - 1) * cell + (cell - text_size[0]) // 2
        y = (row - 1) * cell + (cell + text_size[1]) // 2
        cv2.putText(image, text, (x, y), font, scale, 0, thickness, cv2.LINE_AA)

    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("failed to encode synthetic Sudoku image")
    return encoded.tobytes()
