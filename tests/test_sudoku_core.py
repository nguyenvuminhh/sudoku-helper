import unittest

from backend.app.sudoku.grid import parse_grid, validate_grid
from backend.app.sudoku.solver import next_hint


REFERENCE_GRID = (
    "000694832"
    "004357196"
    "090002745"
    "070035004"
    "040008600"
    "031046000"
    "400000078"
    "000000420"
    "900400560"
)


class SudokuCoreTests(unittest.TestCase):
    def test_parse_grid_accepts_zeroes_and_dots(self):
        grid = parse_grid("1" + "." * 79 + "0")

        self.assertEqual(grid[0], 1)
        self.assertEqual(grid[1], 0)
        self.assertEqual(grid[80], 0)
        self.assertEqual(len(grid), 81)

    def test_validate_grid_reports_row_column_and_box_conflicts(self):
        row_conflict = parse_grid("11" + "0" * 79)
        column_conflict = parse_grid("1" + "0" * 8 + "1" + "0" * 71)
        box_conflict = parse_grid("1" + "0" * 9 + "1" + "0" * 70)

        self.assertFalse(validate_grid(row_conflict).valid)
        self.assertFalse(validate_grid(column_conflict).valid)
        self.assertFalse(validate_grid(box_conflict).valid)

    def test_next_hint_returns_layered_hidden_single(self):
        hint = next_hint(parse_grid(REFERENCE_GRID))

        self.assertEqual(hint.technique.id, "hidden_single")
        self.assertEqual(hint.action.type, "place")
        self.assertEqual(hint.action.cell, {"row": 5, "col": 9})
        self.assertEqual(hint.action.digit, 3)
        self.assertIn("box 6", hint.summary.lower())
        self.assertGreaterEqual(len(hint.explanation), 3)
        self.assertIn({"row": 5, "col": 9}, hint.highlights.primary_cells)


if __name__ == "__main__":
    unittest.main()
