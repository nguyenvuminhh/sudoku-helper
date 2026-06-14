// board.jsx — minimalist Sudoku board + keypad for the redesign storyboard.
// Renders an 81-char puzzle string. Givens in ink, user entries in accent blue.
// Exports: SudokuBoard, Keypad  (to window).

const SAMPLE =
  "000694832004357196090002745070035004040008600031046000400000078000000420900400560";

function peersOf(i) {
  if (i == null) return new Set();
  const r = Math.floor(i / 9), c = i % 9;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  const s = new Set();
  for (let k = 0; k < 9; k++) { s.add(r * 9 + k); s.add(k * 9 + c); }
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) s.add((br + dr) * 9 + (bc + dc));
  s.delete(i);
  return s;
}

function SudokuBoard({
  puzzle = SAMPLE,
  ghost = false,
  selected = null,
  hintPrimary = null,
  hintRelated = [],
  userCells = {},          // { index: digit }
  cornerNotes = {},        // { index: [d,d,...] }
  size = 520,
}) {
  const peers = selected != null ? peersOf(selected) : new Set();
  const related = new Set(hintRelated);
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const ch = puzzle[i] || "0";
    const given = ch !== "0";
    const userVal = userCells[i];
    const cls = ["cell"];
    if (selected != null && peers.has(i)) cls.push("peer");
    if (i === selected) cls.push("sel");
    if (i === hintPrimary) cls.push("hint-primary");
    if (related.has(i)) cls.push("hint-related");
    const notes = cornerNotes[i];
    cells.push(
      <div key={i} className={cls.join(" ")}>
        {given && <strong className="given">{ch}</strong>}
        {!given && userVal != null && <strong className="user">{userVal}</strong>}
        {!given && userVal == null && notes && (
          <div className="corner-notes">
            {[1,2,3,4,5,6,7,8,9].map((d) => (
              <span key={d}>{notes.includes(d) ? d : ""}</span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={"sb-board" + (ghost ? " ghost" : "")} style={{ width: size, height: size }}>
      {cells}
    </div>
  );
}

function Keypad({ active = null, remaining = {}, mini = false }) {
  const def = { 1:6, 2:5, 3:0, 4:7, 5:5, 6:4, 7:5, 8:6, 9:5 };
  const rem = Object.keys(remaining).length ? remaining : def;
  return (
    <div className={"sb-keypad" + (mini ? " mini" : "")}>
      {[1,2,3,4,5,6,7,8,9].map((d) => (
        <button key={d} className={"key" + (active === d ? " active" : "")} type="button">
          <span className="key-d">{d}</span>
          <span className="key-r">{rem[d]}</span>
        </button>
      ))}
      <button className="key erase" type="button" aria-label="Erase">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-6 6"/><path d="M18 9l-6 6"/></svg>
      </button>
    </div>
  );
}

Object.assign(window, { SudokuBoard, Keypad, SAMPLE_PUZZLE: SAMPLE, peersOf });
