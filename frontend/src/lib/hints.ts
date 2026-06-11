import type { GeneratedPuzzleResponse, HintResponse } from "./api";
import { cellToIndex, type CheckResult, type SudokuGrid, type ValidationConflict } from "./sudoku-state";

export type HintCellKind = "primary" | "related" | "elimination";

export type HintPreview = { index: number; digit: number };

export function collectConflictIndexes(conflicts: ValidationConflict[]): Set<number> {
  return new Set(conflicts.flatMap((conflict) => conflict.cells.map(cellToIndex)));
}

export function collectHintCells(hint: HintResponse | null, kind: HintCellKind): Set<number> {
  if (!hint) {
    return new Set();
  }
  if (kind === "primary") {
    return new Set(hint.highlights.primary_cells.map(cellToIndex));
  }
  if (kind === "related") {
    return new Set(hint.highlights.related_cells.map(cellToIndex));
  }
  return new Set(hint.highlights.eliminations.map((item) => cellToIndex(item.cell)));
}

export function collectHintPreview(hint: HintResponse | null, grid: SudokuGrid): HintPreview | null {
  if (hint?.action.type !== "place" || !hint.action.cell || !hint.action.digit) {
    return null;
  }

  const index = cellToIndex(hint.action.cell);
  if (index < 0 || index > 80 || grid[index] !== null) {
    return null;
  }

  return { index, digit: hint.action.digit };
}

export function checkResultMessage(result: CheckResult): string {
  if (result.status === "solved") {
    return "Solved! Every cell matches the solution.";
  }
  if (result.status === "incorrect") {
    const count = result.incorrectIndexes.length;
    return `Found ${count} wrong number${count === 1 ? "" : "s"}. Highlighted cells do not match the solution.`;
  }
  if (result.status === "unsolvable") {
    return "The locked givens have no valid solution, so the board cannot be checked.";
  }
  return "No mistakes so far. Some cells are still empty—keep going.";
}

export function generatedPuzzleMessage(generated: GeneratedPuzzleResponse): string {
  const requested = generated.requested_level.name;
  const rated = generated.level.name;
  const seRating = generated.se_rating ? `, SE ${generated.se_rating.toFixed(1)}` : "";
  return `Generated ${requested} puzzle. Rated ${rated}${seRating} by ${generated.attribution.name}. Review it, then confirm to lock the givens.`;
}
