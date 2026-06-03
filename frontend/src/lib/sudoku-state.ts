export type CellValue = number | null;
export type SudokuGrid = CellValue[];

export type ValidationConflict = {
  unit: "row" | "col" | "box";
  unitNumber: number;
  digit: number;
  cells: Array<{ row: number; col: number }>;
};

export type ValidationResponse = {
  valid: boolean;
  conflicts: ValidationConflict[];
  candidates: Record<string, number[]>;
};

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

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

export function validateSudokuGrid(grid: SudokuGrid): ValidationResponse {
  const conflicts = collectValidationConflicts(grid);
  return {
    valid: conflicts.length === 0,
    conflicts,
    candidates: conflicts.length === 0 ? collectCandidates(grid) : {}
  };
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

function collectValidationConflicts(grid: SudokuGrid): ValidationConflict[] {
  const conflicts: ValidationConflict[] = [];

  for (const [unit, unitNumber, indexes] of allUnits()) {
    const seen = new Map<number, number[]>();
    for (const index of indexes) {
      const digit = grid[index];
      if (digit !== null) {
        seen.set(digit, [...(seen.get(digit) ?? []), index]);
      }
    }

    for (const [digit, locations] of seen.entries()) {
      if (locations.length > 1) {
        conflicts.push({
          unit,
          unitNumber: unitNumber + 1,
          digit,
          cells: locations.map(indexToCell)
        });
      }
    }
  }

  return conflicts;
}

function collectCandidates(grid: SudokuGrid): Record<string, number[]> {
  const candidates: Record<string, number[]> = {};
  for (const [index, value] of grid.entries()) {
    if (value !== null) {
      continue;
    }
    const used = usedDigits(grid, index);
    candidates[String(index)] = DIGITS.filter((digit) => !used.has(digit));
  }
  return candidates;
}

function usedDigits(grid: SudokuGrid, index: number): Set<number> {
  return new Set(relatedIndexes(index).map((peer) => grid[peer]).filter((value): value is number => value !== null));
}

function relatedIndexes(index: number): number[] {
  return Array.from(new Set([...unitIndexes("row", rowOf(index)), ...unitIndexes("col", colOf(index)), ...unitIndexes("box", boxOf(index))]));
}

function allUnits(): Array<["row" | "col" | "box", number, number[]]> {
  return [
    ...DIGITS.map((_, unitNumber): ["row", number, number[]] => ["row", unitNumber, unitIndexes("row", unitNumber)]),
    ...DIGITS.map((_, unitNumber): ["col", number, number[]] => ["col", unitNumber, unitIndexes("col", unitNumber)]),
    ...DIGITS.map((_, unitNumber): ["box", number, number[]] => ["box", unitNumber, unitIndexes("box", unitNumber)])
  ];
}

function unitIndexes(unit: "row" | "col" | "box", number: number): number[] {
  if (unit === "row") {
    return DIGITS.map((_, col) => number * 9 + col);
  }
  if (unit === "col") {
    return DIGITS.map((_, row) => row * 9 + number);
  }

  const startRow = Math.floor(number / 3) * 3;
  const startCol = (number % 3) * 3;
  return [0, 1, 2].flatMap((rowOffset) => [0, 1, 2].map((colOffset) => (startRow + rowOffset) * 9 + startCol + colOffset));
}

function rowOf(index: number): number {
  return Math.floor(index / 9);
}

function colOf(index: number): number {
  return index % 9;
}

function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
}
