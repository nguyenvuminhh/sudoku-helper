import unittest

from backend.app.ocr import recognize_sudoku_image


class OcrTests(unittest.TestCase):
    def test_recognize_sudoku_image_returns_editable_grid_shape(self):
        result = recognize_sudoku_image(b"not-a-real-image", "bad-upload.txt")

        self.assertEqual(len(result.cells), 81)
        self.assertTrue(all(0 <= cell.confidence <= 1 for cell in result.cells))
        self.assertTrue(all(cell.value is None or 1 <= cell.value <= 9 for cell in result.cells))
        self.assertGreaterEqual(len(result.warnings), 1)


if __name__ == "__main__":
    unittest.main()
