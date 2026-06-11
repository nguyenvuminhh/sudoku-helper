"use client";

import { Grid3X3, RotateCcw } from "lucide-react";

import { HintPanel } from "../components/HintPanel";
import { HistoryPanel } from "../components/HistoryPanel";
import { Keypad } from "../components/Keypad";
import { LoadingControls } from "../components/LoadingControls";
import { ShortcutsPanel } from "../components/ShortcutsPanel";
import { SolvingControls } from "../components/SolvingControls";
import { StatusPanel } from "../components/StatusPanel";
import { SudokuBoard } from "../components/SudokuBoard";
import { TopBar } from "../components/TopBar";
import { useImageImport } from "../hooks/useImageImport";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSudokuGame } from "../hooks/useSudokuGame";
import { useTheme } from "../hooks/useTheme";

export default function SudokuTutorPage() {
  const game = useSudokuGame();
  const { theme, toggleTheme } = useTheme();
  const imageImport = useImageImport(game);
  useKeyboardShortcuts(game);

  return (
    <main className="workspace">
      <TopBar theme={theme} onToggleTheme={toggleTheme} />

      <section className="content-grid">
        <section className="board-zone" aria-label="Sudoku board">
          <div className="board-header">
            <div>
              <p className="eyebrow">Board</p>
              <h2>
                R{game.selectedCell.row}C{game.selectedCell.col}
              </h2>
            </div>
            <div className="meter" aria-label={`${game.filledCount} filled cells`}>
              <span style={{ width: `${(game.filledCount / 81) * 100}%` }} />
            </div>
          </div>

          <SudokuBoard
            grid={game.grid}
            notes={game.notes}
            givenMask={game.givenMask}
            isSolving={game.isSolving}
            selectedIndex={game.selectedIndex}
            editingNotes={game.editingNotes}
            activeHighlightDigit={game.activeHighlightDigit}
            lowConfidence={game.lowConfidence}
            hintPreview={game.hintPreview}
            highlights={{
              conflictIndexes: game.conflictIndexes,
              incorrectIndexes: game.incorrectIndexes,
              primaryIndexes: game.primaryIndexes,
              relatedIndexes: game.relatedIndexes,
              eliminationIndexes: game.eliminationIndexes,
              matchingValueIndexes: game.matchingHighlights.valueIndexes,
              matchingNoteIndexes: game.matchingHighlights.noteIndexes
            }}
            onCellClick={game.clickCell}
          />

          <Keypad
            digitCounts={game.digitCounts}
            selectedNotes={game.selectedNotes}
            quickFillDigit={game.quickFillDigit}
            quickFillMode={game.quickFillMode}
            editingNotes={game.editingNotes}
            isSolving={game.isSolving}
            selectedIsGiven={game.selectedIsGiven}
            selectedCellFilled={game.grid[game.selectedIndex] !== null}
            onDigit={game.pressDigit}
          />
        </section>

        <aside className="inspector" aria-label="Hint explanation">
          <div className="actions-panel" aria-label="Sudoku controls">
            <div className="controls-header">
              <div className="panel-title">
                <Grid3X3 size={19} />
                <h2>Controls</h2>
              </div>
              <button className="reset-icon-button" type="button" onClick={game.reset} aria-label="Reset puzzle">
                <RotateCcw size={17} />
              </button>
            </div>
            <div className="action-grid">
              {game.phase === "loading" ? (
                <LoadingControls
                  puzzleText={game.puzzleText}
                  puzzleTextLength={game.puzzleText.replace(/[^0-9.]/g, "").length}
                  generatedLevel={game.generatedLevel}
                  busyLabel={game.busyLabel}
                  canConfirm={game.filledCount > 0 && game.validation.valid}
                  isDraggingImage={imageImport.isDraggingImage}
                  onPuzzleTextChange={game.setPuzzleText}
                  onGeneratedLevelChange={game.setGeneratedLevel}
                  onGeneratePuzzle={() => void game.generatePuzzle()}
                  onLoadPuzzleText={game.loadPuzzleFromText}
                  onLoadSample={game.loadSample}
                  onUploadClick={imageImport.openFilePicker}
                  onConfirm={game.startSolving}
                  onDragOver={imageImport.handleDragOver}
                  onDragLeave={imageImport.handleDragLeave}
                  onDrop={imageImport.handleDrop}
                />
              ) : (
                <SolvingControls
                  busyLabel={game.busyLabel}
                  canUndo={game.undoStack.length > 0}
                  editingNotes={game.editingNotes}
                  quickFillMode={game.quickFillMode}
                  isValid={game.validation.valid}
                  filledCount={game.filledCount}
                  onUndo={game.undo}
                  onToggleNotes={game.toggleNotesMode}
                  onToggleQuickFill={game.toggleQuickFillMode}
                  onFillAllNotes={game.fillAllNotes}
                  onRemoveAllNotes={game.clearAllNotes}
                  onCheck={game.check}
                  onHint={() => void game.hint()}
                />
              )}
            </div>
            <input
              ref={imageImport.fileInputRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              onChange={(event) => void imageImport.handleUpload(event)}
            />
          </div>

          <StatusPanel busyLabel={game.busyLabel} messages={game.statusMessages} />

          <HintPanel canApplyHint={game.canApplyCurrentHint} hint={game.currentHint} onApplyHint={game.applyHint} />

          <HistoryPanel history={game.history} />

          <ShortcutsPanel />
        </aside>
      </section>
    </main>
  );
}
