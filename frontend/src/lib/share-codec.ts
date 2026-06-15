import { gridToPayload, parsePuzzleText, type SudokuGrid } from "./sudoku-state";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const BASE = BigInt(ALPHABET.length);
const MASK_BITS = 81n;
const MASK_VALUE = (1n << MASK_BITS) - 1n;
const SHARE_ERROR = "Share link could not be loaded.";

const ALPHABET_INDEX = new Map([...ALPHABET].map((char, index) => [char, BigInt(index)]));

export function encodePuzzleParam(grid: SudokuGrid): string {
  const maskCode = `m${encodeBigInt(encodeMaskPuzzle(grid))}`;
  const denseCode = `b${encodeBigInt(encodeDensePuzzle(grid))}`;
  return maskCode.length <= denseCode.length ? maskCode : denseCode;
}

export function decodePuzzleParam(param: string): SudokuGrid {
  if (param.length < 2) {
    throw new Error(SHARE_ERROR);
  }

  const version = param[0];
  const body = param.slice(1);
  const value = decodeBigInt(body);

  if (version === "m") {
    return decodeMaskPuzzle(value);
  }
  if (version === "b") {
    return decodeDensePuzzle(value);
  }
  throw new Error(SHARE_ERROR);
}

function encodeMaskPuzzle(grid: SudokuGrid): bigint {
  let mask = 0n;
  let digits = 0n;

  grid.forEach((cell, index) => {
    if (cell === null) {
      return;
    }
    mask |= 1n << BigInt(index);
    digits = digits * 9n + BigInt(cell - 1);
  });

  return (digits << MASK_BITS) | mask;
}

function decodeMaskPuzzle(value: bigint): SudokuGrid {
  const mask = value & MASK_VALUE;
  let digits = value >> MASK_BITS;
  const grid: SudokuGrid = Array.from({ length: 81 }, () => null);
  const filledIndexes: number[] = [];

  for (let index = 0; index < 81; index += 1) {
    if (((mask >> BigInt(index)) & 1n) === 1n) {
      filledIndexes.push(index);
    }
  }

  const digitCodes = new Array<number>(filledIndexes.length);
  for (let index = filledIndexes.length - 1; index >= 0; index -= 1) {
    digitCodes[index] = Number(digits % 9n);
    digits /= 9n;
  }
  if (digits !== 0n) {
    throw new Error(SHARE_ERROR);
  }

  filledIndexes.forEach((cellIndex, index) => {
    grid[cellIndex] = digitCodes[index] + 1;
  });
  return grid;
}

function encodeDensePuzzle(grid: SudokuGrid): bigint {
  let value = 0n;
  for (const char of gridToPayload(grid)) {
    value = value * 10n + BigInt(Number(char));
  }
  return value;
}

function decodeDensePuzzle(value: bigint): SudokuGrid {
  const digits = new Array<string>(81).fill("0");
  for (let index = 80; index >= 0; index -= 1) {
    digits[index] = String(value % 10n);
    value /= 10n;
  }
  if (value !== 0n) {
    throw new Error(SHARE_ERROR);
  }
  return parsePuzzleText(digits.join(""));
}

function encodeBigInt(value: bigint): string {
  if (value === 0n) {
    return ALPHABET[0];
  }

  const chars: string[] = [];
  while (value > 0n) {
    chars.push(ALPHABET[Number(value % BASE)]);
    value /= BASE;
  }
  return chars.reverse().join("");
}

function decodeBigInt(value: string): bigint {
  if (!value) {
    throw new Error(SHARE_ERROR);
  }

  let decoded = 0n;
  for (const char of value) {
    const digit = ALPHABET_INDEX.get(char);
    if (digit === undefined) {
      throw new Error(SHARE_ERROR);
    }
    decoded = decoded * BASE + digit;
  }
  return decoded;
}
