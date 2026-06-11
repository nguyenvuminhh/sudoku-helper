import type { TutorPhase } from "./constants";
import type { GivenMask, NotesGrid, SudokuGrid } from "./sudoku-state";

export const SESSION_STORAGE_KEY = "sudoku-session-v1";

export type SavedSession = {
  version: 1;
  grid: SudokuGrid;
  notes: NotesGrid;
  givenMask: GivenMask;
  phase: TutorPhase;
  selectedIndex: number;
  lowConfidence: number[];
  elapsedSeconds: number;
};

export function serializeSession(session: Omit<SavedSession, "version">): string {
  return JSON.stringify({ version: 1, ...session });
}

/**
 * Parses a stored session, returning null for malformed or empty boards so a
 * corrupt localStorage entry can never break the app on load.
 */
export function parseSavedSession(raw: string | null): SavedSession | null {
  if (!raw) {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) {
    return null;
  }
  const session = data as Record<string, unknown>;

  if (session.version !== 1) {
    return null;
  }
  if (!isGrid(session.grid) || !isNotes(session.notes) || !isMask(session.givenMask)) {
    return null;
  }
  if (session.phase !== "loading" && session.phase !== "solving") {
    return null;
  }
  if (!isCellIndex(session.selectedIndex)) {
    return null;
  }
  if (!Array.isArray(session.lowConfidence) || !session.lowConfidence.every(isCellIndex)) {
    return null;
  }
  if (typeof session.elapsedSeconds !== "number" || !Number.isFinite(session.elapsedSeconds) || session.elapsedSeconds < 0) {
    return null;
  }

  const grid = session.grid as SudokuGrid;
  if (grid.every((value) => value === null)) {
    return null;
  }

  return {
    version: 1,
    grid,
    notes: session.notes as NotesGrid,
    givenMask: session.givenMask as GivenMask,
    phase: session.phase,
    selectedIndex: session.selectedIndex,
    lowConfidence: session.lowConfidence as number[],
    elapsedSeconds: Math.floor(session.elapsedSeconds)
  };
}

function isGrid(value: unknown): value is SudokuGrid {
  return (
    Array.isArray(value) &&
    value.length === 81 &&
    value.every((cell) => cell === null || (Number.isInteger(cell) && cell >= 1 && cell <= 9))
  );
}

function isNotes(value: unknown): value is NotesGrid {
  return (
    Array.isArray(value) &&
    value.length === 81 &&
    value.every(
      (cellNotes) =>
        Array.isArray(cellNotes) && cellNotes.every((note) => Number.isInteger(note) && note >= 1 && note <= 9)
    )
  );
}

function isMask(value: unknown): value is GivenMask {
  return Array.isArray(value) && value.length === 81 && value.every((flag) => typeof flag === "boolean");
}

function isCellIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 80;
}
