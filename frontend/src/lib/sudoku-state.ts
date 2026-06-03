export type CellValue = number | null;
export type SudokuGrid = CellValue[];

export type OcrCell = {
  row: number;
  col: number;
  value: CellValue;
  confidence: number;
};

export function createEmptyGrid(): SudokuGrid {
  return Array.from({ length: 81 }, () => null);
}

export function parsePuzzleText(text: string): SudokuGrid {
  const compact = text.replace(/[^0-9.]/g, "");
  if (compact.length !== 81) {
    throw new Error("Puzzle text must contain exactly 81 digits, zeroes, or dots.");
  }

  return compact.split("").map((char) => {
    if (char === "." || char === "0") {
      return null;
    }
    const digit = Number(char);
    if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
      throw new Error("Only digits 1-9, zeroes, and dots are allowed.");
    }
    return digit;
  });
}

export function gridToPayload(grid: SudokuGrid): string {
  return grid.map((value) => value ?? 0).join("");
}

export function setCellValue(grid: SudokuGrid, index: number, value: CellValue): SudokuGrid {
  if (index < 0 || index > 80) {
    return grid;
  }
  if (value !== null && (value < 1 || value > 9)) {
    return grid;
  }
  const next = [...grid];
  next[index] = value;
  return next;
}

export function applyOcrCells(
  grid: SudokuGrid,
  cells: OcrCell[]
): { grid: SudokuGrid; lowConfidence: number[] } {
  const next = [...grid];
  const lowConfidence: number[] = [];

  for (const cell of cells) {
    if (cell.row < 1 || cell.row > 9 || cell.col < 1 || cell.col > 9) {
      continue;
    }
    const index = (cell.row - 1) * 9 + (cell.col - 1);
    next[index] = cell.value;
    if (cell.confidence < 0.5) {
      lowConfidence.push(index);
    }
  }

  return { grid: next, lowConfidence };
}

export function indexToCell(index: number): { row: number; col: number } {
  return { row: Math.floor(index / 9) + 1, col: (index % 9) + 1 };
}

export function cellToIndex(cell: { row: number; col: number }): number {
  return (cell.row - 1) * 9 + (cell.col - 1);
}

export function countFilledCells(grid: SudokuGrid): number {
  return grid.filter((value) => value !== null).length;
}

export function resolveKeyboardInput(key: string): CellValue | "ignored" {
  if (/^[1-9]$/.test(key)) {
    return Number(key);
  }
  if (key === " " || key === "0" || key === "Backspace" || key === "Delete") {
    return null;
  }
  return "ignored";
}

export function findNextInputIndex(grid: SudokuGrid, currentIndex: number): number {
  for (let offset = 1; offset <= 81; offset += 1) {
    const index = (currentIndex + offset) % 81;
    if (grid[index] === null) {
      return index;
    }
  }
  return currentIndex;
}
