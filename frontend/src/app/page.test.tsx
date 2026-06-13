// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HintResponse } from "../lib/api";

import SudokuTutorPage from "./page";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    requestHint: vi.fn(),
    requestGeneratedPuzzle: vi.fn(),
    recognizeImage: vi.fn()
  };
});

const api = await import("../lib/api");
const requestHintMock = vi.mocked(api.requestHint);
const requestGeneratedPuzzleMock = vi.mocked(api.requestGeneratedPuzzle);

function cell(row: number, col: number): HTMLElement {
  return screen.getByRole("gridcell", { name: new RegExp(`^Row ${row}, column ${col}(,|$)`) });
}

async function loadSampleAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /sample/i }));
  await user.click(screen.getByRole("button", { name: /confirm/i }));
}

function makePlaceHint(row: number, col: number, digit: number): HintResponse {
  return {
    technique: { id: "naked_single", name: "Naked Single", rank: 1 },
    action: { type: "place", cell: { row, col }, digit, eliminations: [] },
    summary: `R${row}C${col} must be ${digit}.`,
    explanation: ["Only one candidate remains in this cell."],
    highlights: { primary_cells: [{ row, col }], related_cells: [], eliminations: [] }
  };
}

function rightClick(target: HTMLElement): boolean {
  fireEvent.pointerDown(target, { button: 2 });
  const wasNotCanceled = fireEvent.contextMenu(target, { button: 2 });
  fireEvent.pointerUp(target, { button: 2 });
  return wasNotCanceled;
}

describe("SudokuTutorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("starts in the loading phase with entry guidance", () => {
    render(<SudokuTutorPage />);

    expect(screen.getByRole("grid", { name: /sudoku grid/i })).toBeDefined();
    expect(screen.getByText(/enter a puzzle on the board or upload/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /confirm/i }).hasAttribute("disabled")).toBe(true);
  });

  it("types digits into the board and advances to the next empty cell", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await user.keyboard("5");

    expect(within(cell(1, 1)).getByText("5")).toBeDefined();
    // Selection advanced to the next empty cell (R1C2 on an empty board).
    expect(cell(1, 2).className).toContain("selected");
  });

  it("loads the sample puzzle and locks givens after confirming", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);

    expect(screen.getByText(/solving phase started/i)).toBeDefined();
    // R1C4 holds the sample given 6 and is announced as a loaded clue.
    expect(cell(1, 4).getAttribute("aria-label")).toContain("loaded clue");
    expect(screen.getByRole("button", { name: /^quick fill$/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("adds corner notes in corner mode", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    // Turn quick fill off so digit presses become notes, then pick the mode.
    await user.click(screen.getByRole("button", { name: /^quick fill$/i }));
    await user.click(screen.getByRole("button", { name: /^corner$/i }));
    await user.click(cell(1, 1));
    await user.click(screen.getByRole("button", { name: "5" }));

    expect(cell(1, 1).getAttribute("aria-label")).toContain("corner notes 5");
  });

  it("adds center notes in center mode", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^quick fill$/i }));
    await user.click(screen.getByRole("button", { name: /^center$/i }));
    await user.click(cell(1, 1));
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "7" }));

    expect(cell(1, 1).getAttribute("aria-label")).toContain("notes 5 7");
  });

  it("paints and clears cell colors in color mode", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^quick fill$/i }));
    await user.click(screen.getByRole("button", { name: /^color$/i }));
    await user.click(cell(1, 1));
    await user.click(screen.getByRole("button", { name: /paint green/i }));

    expect(cell(1, 1).getAttribute("aria-label")).toContain("green highlight");

    // Painting the same color again clears it.
    await user.click(screen.getByRole("button", { name: /paint green/i }));
    expect(cell(1, 1).getAttribute("aria-label")).not.toContain("green highlight");
  });

  it("erases a cell color with the eraser in color mode under quick fill", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user); // quick fill stays on by default
    await user.click(screen.getByRole("button", { name: /^color$/i }));
    await user.click(screen.getByRole("button", { name: /paint green/i })); // lock the color
    await user.click(cell(1, 1)); // paint it via quick fill
    expect(cell(1, 1).getAttribute("aria-label")).toContain("green highlight");

    await user.click(screen.getByRole("button", { name: /erase cell/i }));
    expect(cell(1, 1).getAttribute("aria-label")).not.toContain("green highlight");
  });

  it("applies a digit to every cell of an alt-click multi-selection", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^quick fill$/i }));

    await user.click(cell(1, 1));
    await user.keyboard("[AltLeft>]");
    await user.click(cell(2, 1));
    await user.keyboard("[/AltLeft]");
    await user.keyboard("5");

    expect(within(cell(1, 1)).getByText("5")).toBeDefined();
    expect(within(cell(2, 1)).getByText("5")).toBeDefined();
  });

  it("marks every cell of a kept multi-selection on a single click", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    // Corner-note mode; quick fill stays on by default after confirming.
    await user.click(screen.getByRole("button", { name: /^corner$/i }));

    // Build the group with Alt-click, lock the digit, then a plain click inside
    // the group marks all of it at once.
    await user.click(cell(1, 1));
    await user.keyboard("[AltLeft>]");
    await user.click(cell(1, 2));
    await user.keyboard("[/AltLeft]");
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(cell(1, 1));

    expect(cell(1, 1).getAttribute("aria-label")).toContain("corner notes 5");
    expect(cell(1, 2).getAttribute("aria-label")).toContain("corner notes 5");
  });

  it("clears the cell selection when clicking outside the board", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await user.click(cell(2, 3));
    expect(cell(2, 3).className).toContain("selected");

    await user.click(document.body);
    expect(cell(2, 3).className).not.toContain("selected");
  });

  it("shows remaining digit counts and hides them via settings", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    const five = screen.getByRole("button", { name: "5" });
    expect(five.querySelector(".remaining-count")?.textContent).toBe("9");

    await user.click(screen.getByRole("switch", { name: /show remaining digit counts/i }));

    expect(five.querySelector(".remaining-count")).toBeNull();
  });

  it("places the quick fill digit by clicking cells", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(cell(1, 1));

    expect(within(cell(1, 1)).getByText("5")).toBeDefined();
  });

  it("uses right-click for the opposite quick-fill note and fill action", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: "5" }));

    expect(rightClick(cell(1, 1))).toBe(false);
    expect(cell(1, 1).getAttribute("aria-label")).toContain("corner notes 5");

    await user.keyboard("{Tab}");
    await user.click(cell(1, 2));
    expect(cell(1, 2).getAttribute("aria-label")).toContain("corner notes 5");

    expect(rightClick(cell(2, 1))).toBe(false);
    expect(within(cell(2, 1)).getByText("5")).toBeDefined();
  });

  it("reports progress when checking a valid board", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /check the puzzle/i }));

    expect(screen.getByText(/no mistakes so far/i)).toBeDefined();
  });

  it("requests a hint and applies the suggested placement", async () => {
    const user = userEvent.setup();
    requestHintMock.mockResolvedValue(makePlaceHint(1, 1, 7));
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^hint$/i }));

    // The technique name shows in both the hint panel and the history panel.
    expect((await screen.findAllByText("Naked Single")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("R1C1 must be 7.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(within(cell(1, 1)).getByText("7")).toBeDefined();
    expect(screen.getByText(/applied 7 at r1c1/i)).toBeDefined();
  });

  it("undoes the last board change with the undo button", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(cell(1, 1));
    expect(within(cell(1, 1)).getByText("5")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /undo last board change/i }));

    expect(within(cell(1, 1)).queryByText("5")).toBeNull();
    expect(screen.getByText(/undid the last board change/i)).toBeDefined();
  });

  it("loads a generated puzzle into the board", async () => {
    const user = userEvent.setup();
    const puzzle = `${"123456789".repeat(1)}${"0".repeat(72)}`;
    requestGeneratedPuzzleMock.mockResolvedValue({
      puzzle,
      solution: "0".repeat(81),
      level: { id: "easy", name: "Easy", description: "", techniques: [] },
      requested_level: { id: "easy", name: "Easy", description: "", techniques: [] },
      se_rating: 1.2,
      techniques: [],
      technique_profile: {},
      attribution: { name: "Ukodus", url: "", license: "", copyright: "" }
    });
    render(<SudokuTutorPage />);

    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText(/generated easy puzzle/i)).toBeDefined();
    expect(within(cell(1, 1)).getByText("1")).toBeDefined();
    expect(within(cell(1, 9)).getByText("9")).toBeDefined();
  });

  it("tints the selected cell's row, column, and box peers", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await user.click(cell(1, 1));

    expect(cell(1, 9).className).toContain("peer-cell");
    expect(cell(9, 1).className).toContain("peer-cell");
    expect(cell(3, 3).className).toContain("peer-cell");
    expect(cell(5, 5).className).not.toContain("peer-cell");
  });

  it("redoes an undone change", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(cell(1, 1));
    await user.click(screen.getByRole("button", { name: /undo last board change/i }));
    expect(within(cell(1, 1)).queryByText("5")).toBeNull();

    await user.click(screen.getByRole("button", { name: /redo last undone change/i }));

    expect(within(cell(1, 1)).getByText("5")).toBeDefined();
    expect(screen.getByText(/redid the last undone change/i)).toBeDefined();
  });

  it("pauses the clock, hides input, and resumes", async () => {
    const user = userEvent.setup();
    render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /pause the solve clock/i }));

    expect(screen.getByText("Paused")).toBeDefined();
    // Cell clicks are ignored while paused.
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(cell(1, 1));
    expect(within(cell(1, 1)).queryByText("5")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(screen.queryByText("Paused")).toBeNull();
  });

  it("auto-advances the quick fill digit and shows finish stats on solve", async () => {
    const user = userEvent.setup();
    const solution =
      "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
    // Blank R9C1 (a 3) and R9C9 (a 9) so two placements finish the board.
    const puzzle = `${solution.slice(0, 72)}0${solution.slice(73, 80)}0`;
    render(<SudokuTutorPage />);

    await user.click(screen.getByLabelText(/81-character puzzle/i));
    await user.paste(puzzle);
    await user.click(screen.getByRole("button", { name: /load puzzle/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    // Completing the 9s moves quick fill to the only incomplete digit, 3.
    await user.click(screen.getByRole("button", { name: "9" }));
    await user.click(cell(9, 9));
    expect(screen.getByText(/all 9s are placed\. quick fill moved to 3/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "3" }).className).toContain("quick-fill-active");

    // Finishing the board opens the stats dialog.
    await user.click(cell(9, 1));
    const dialog = screen.getByRole("dialog", { name: /puzzle solved/i });
    expect(within(dialog).getByText(/time/i)).toBeDefined();
    expect(within(dialog).getByText(/hints used/i)).toBeDefined();
    expect(within(dialog).getByText(/cells you filled/i)).toBeDefined();

    // Closing the dialog keeps the board and shows the solve banner.
    await user.click(within(dialog).getByRole("button", { name: /keep the board/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/solved in/i)).toBeDefined();
    expect(screen.getByText(/solved! you completed the puzzle/i)).toBeDefined();
  });

  it("restores the saved session after a reload", async () => {
    const user = userEvent.setup();
    const first = render(<SudokuTutorPage />);

    await loadSampleAndConfirm(user);
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(cell(1, 1));
    expect(within(cell(1, 1)).getByText("5")).toBeDefined();

    first.unmount();
    render(<SudokuTutorPage />);

    expect(await screen.findByText(/restored your previous session/i)).toBeDefined();
    expect(within(cell(1, 1)).getByText("5")).toBeDefined();
    // Givens stay locked after the restore.
    expect(cell(1, 4).getAttribute("aria-label")).toContain("loaded clue");
  });

  it("keeps controls in the right rail above the strategy note", () => {
    render(<SudokuTutorPage />);

    const rail = screen.getByRole("complementary", { name: /hint explanation/i });
    const sections = Array.from(rail.children).map((child) => child.getAttribute("aria-label") ?? child.className);
    const controlsIndex = sections.findIndex((label) => label.includes("Sudoku controls"));
    const statusIndex = sections.findIndex((label) => label.includes("status-panel"));

    expect(controlsIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(controlsIndex);
  });
});
