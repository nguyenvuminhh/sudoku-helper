// shell.jsx — AppShell (topbar + board + contextual panel) and PhoneFrame.
// Exports: AppShell, PhoneFrame (to window).

function EntryToolbar() {
  const tools = [
    { name: "pencil", label: "Normal" },
    { name: "corner", label: "Corner", on: true },
    { name: "center", label: "Center" },
    { name: "palette", label: "Color" },
  ];
  return (
    <div className="entry-bar">
      <div className="eb-group">
        <button type="button" className="eb-btn" aria-label="Undo"><Icon name="undo" size={16} /></button>
        <button type="button" className="eb-btn" aria-label="Redo"><Icon name="redo" size={16} /></button>
      </div>
      <div className="eb-div" />
      <div className="eb-group modes">
        {tools.map((t) => (
          <button key={t.label} type="button" className={"eb-btn mode" + (t.on ? " on" : "")}>
            <Icon name={t.name} size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="eb-div" />
      <button type="button" className="eb-btn more" aria-label="More tools"><Icon name="more" size={16} /></button>
    </div>
  );
}

function BoardStatus() {
  return (
    <div className="board-status">
      <span className="bs-ok"><Icon name="check" size={14} /> No conflicts</span>
      <span className="bs-timer"><Icon name="clock" size={14} /> 7:47</span>
    </div>
  );
}

function boardForPhase(phase, size) {
  if (phase === "start" || phase === "import") {
    return <SudokuBoard puzzle={"0".repeat(81)} ghost size={size} />;
  }
  if (phase === "review") {
    return <SudokuBoard puzzle={window.SAMPLE_PUZZLE} size={size} />;
  }
  // solving
  return (
    <SudokuBoard
      puzzle={window.SAMPLE_PUZZLE}
      size={size}
      selected={22}
      hintPrimary={18}
      hintRelated={[19, 25, 26]}
      userCells={{ 0: 5, 1: 7 }}
      cornerNotes={{ 2: [1, 3], 9: [2, 8], 10: [2, 8], 21: [1, 3, 5] }}
    />
  );
}

function AppShell({ phase = "start", theme = "light", mobile = false, boardSize }) {
  const size = boardSize || (mobile ? 330 : 468);
  const solving = phase === "solving";
  return (
    <div className={"shell" + (mobile ? " mobile" : "")} data-theme={theme}>
      <header className="top">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">Sudoku strategy desk</span>
        </div>
        <button type="button" className="theme-pill">
          <Icon name={theme === "dark" ? "moon" : "sun"} size={15} />
          <span>{theme === "dark" ? "Dark" : "Light"}</span>
        </button>
      </header>
      <div className="stage">
        <div className="board-col">
          <div className="board-stack" style={{ width: size }}>
            {solving && <BoardStatus />}
            {boardForPhase(phase, size)}
            {solving && <EntryToolbar />}
            {solving && <Keypad active={3} mini={mobile} />}
          </div>
        </div>
        <aside className="panel-col">
          <ContextPanel phase={phase} />
        </aside>
      </div>
    </div>
  );
}

function PhoneFrame({ children, w = 360, h = 740 }) {
  return (
    <div className="phone" style={{ width: w, height: h }}>
      <div className="phone-notch" />
      <div className="phone-screen">{children}</div>
    </div>
  );
}

Object.assign(window, { AppShell, PhoneFrame, EntryToolbar });
