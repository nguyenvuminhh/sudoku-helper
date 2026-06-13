"use client";

import { Grid3X3, Pause, PartyPopper, Play, RotateCcw, Timer } from "lucide-react";

import { FinishDialog } from "../components/FinishDialog";
import { HintPanel } from "../components/HintPanel";
import { HistoryPanel } from "../components/HistoryPanel";
import { Keypad } from "../components/Keypad";
import { LoadingControls } from "../components/LoadingControls";
import { SettingsPanel } from "../components/SettingsPanel";
import { ShortcutsPanel } from "../components/ShortcutsPanel";
import { SolvingControls } from "../components/SolvingControls";
import { StatusPanel } from "../components/StatusPanel";
import { SudokuBoard } from "../components/SudokuBoard";
import { TopBar } from "../components/TopBar";
import { useClickOutsideBoard } from "../hooks/useClickOutsideBoard";
import { useImageImport } from "../hooks/useImageImport";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSudokuGame } from "../hooks/useSudokuGame";
import { useTheme } from "../hooks/useTheme";
import { formatElapsedSeconds } from "../lib/time";

export default function SudokuTutorPage() {
  const game = useSudokuGame();
  const { theme, toggleTheme } = useTheme();
  const imageImport = useImageImport(game);
  useKeyboardShortcuts(game);
  useClickOutsideBoard(game);

  return (
    <main className="workspace">
      <TopBar theme={theme} onToggleTheme={toggleTheme} />

      <section className="content-grid">
        <section className="board-zone" aria-label="Sudoku board">
          <div className="board-header">
            <div>
              <p className="eyebrow">Board</p>
            </div>
            <div className="board-tools">
              {game.isSolving ? (
                <>
                  <span className="timer-chip" role="timer" aria-label={`Elapsed time ${formatElapsedSeconds(game.elapsedSeconds)}`}>
                    <Timer size={15} />
                    {formatElapsedSeconds(game.elapsedSeconds)}
                  </span>
                  <button
                    type="button"
                    className="pause-button"
                    onClick={game.togglePause}
                    disabled={game.isSolved}
                    aria-label={game.paused ? "Resume the solve clock" : "Pause the solve clock"}
                  >
                    {game.paused ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                </>
              ) : null}
              <div className="meter" aria-label={`${game.filledCount} filled cells`}>
                <span style={{ width: `${(game.filledCount / 81) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="board-wrap">
            <SudokuBoard
              grid={game.grid}
              marks={game.marks}
              givenMask={game.givenMask}
              isSolving={game.isSolving}
              selectedIndex={game.selectedIndex}
              selectedIndexSet={game.selectedIndexSet}
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
                peerIndexes: game.peerHighlightIndexes
              }}
              paused={game.paused}
              onCellPointerDown={game.beginCellSelection}
              onCellPointerEnter={game.dragCellSelection}
              onCellClick={game.clickCell}
              onCellContextMenu={game.rightClickCell}
            />
            {game.paused ? (
              <div className="board-overlay" role="status">
                <p>Paused</p>
                <button type="button" onClick={game.togglePause}>
                  <Play size={17} />
                  Resume
                </button>
              </div>
            ) : null}
            {game.isSolved && !game.showFinishDialog ? (
              <div className="solve-banner" role="status">
                <PartyPopper size={18} />
                Solved in {formatElapsedSeconds(game.elapsedSeconds)}
              </div>
            ) : null}
          </div>

          <Keypad
            digitCounts={game.digitCounts}
            selectedNotes={game.selectedNotes}
            quickFillDigit={game.quickFillDigit}
            quickFillMode={game.quickFillMode}
            entryMode={game.entryMode}
            isSolving={game.isSolving}
            selectionAllGiven={game.selectionAllGiven}
            selectionAllFilled={game.selectionAllFilled}
            showRemainingCounts={game.settings.showRemainingCounts}
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
                  canRedo={game.redoStack.length > 0}
                  entryMode={game.entryMode}
                  hasAnyNotes={game.hasAnyNotes}
                  quickFillMode={game.quickFillMode}
                  isValid={game.validation.valid}
                  filledCount={game.filledCount}
                  onUndo={game.undo}
                  onRedo={game.redo}
                  onEntryModeChange={game.changeEntryMode}
                  onToggleNoteMode={game.toggleNoteMode}
                  onToggleQuickFill={game.toggleQuickFillMode}
                  onToggleAllNotes={game.toggleAllNotes}
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

          <SettingsPanel settings={game.settings} onSettingChange={game.setSetting} />

          <ShortcutsPanel />
        </aside>
      </section>

      {game.showFinishDialog ? (
        <FinishDialog stats={game.finishStats} onNewPuzzle={game.reset} onClose={game.dismissFinish} />
      ) : null}
    </main>
  );
}
