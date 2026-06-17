import type { GeneratedLevel } from "./constants";
import { gridToPayload, type GivenMask, type SudokuGrid } from "./sudoku-state";

export type LeaderboardDifficulty = GeneratedLevel | "custom";

export type BuildSolveRecordArgs = {
  userId: string;
  givensGrid: SudokuGrid;
  givenMask: GivenMask;
  difficulty: LeaderboardDifficulty;
  elapsedSeconds: number;
  hintsUsed: number;
  checksUsed: number;
  techniques: string[];
};

export type SolveRecordInput = {
  user_id: string;
  puzzle_fingerprint: string;
  difficulty: LeaderboardDifficulty;
  elapsed_seconds: number;
  hints_used: number;
  checks_used: number;
  givens: number;
  filled_by_user: number;
  techniques: string[];
};

export async function buildPuzzleFingerprint(
  givens: SudokuGrid,
  difficulty: LeaderboardDifficulty
): Promise<string> {
  return hashText(`${difficulty}:${gridToPayload(givens)}`);
}

export async function buildSolveRecordInput(args: BuildSolveRecordArgs): Promise<SolveRecordInput> {
  const givens = args.givenMask.filter(Boolean).length;
  return {
    user_id: args.userId,
    puzzle_fingerprint: await buildPuzzleFingerprint(args.givensGrid, args.difficulty),
    difficulty: args.difficulty,
    elapsed_seconds: safeCount(args.elapsedSeconds),
    hints_used: safeCount(args.hintsUsed),
    checks_used: safeCount(args.checksUsed),
    givens,
    filled_by_user: Math.max(0, 81 - givens),
    techniques: [...args.techniques]
  };
}

export function formatLeaderboardTime(total: number): string {
  const safe = safeCount(total);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

async function hashText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
