import unittest

from backend.app.sudoku.grid import parse_grid, validate_grid


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


if __name__ == "__main__":
    unittest.main()
