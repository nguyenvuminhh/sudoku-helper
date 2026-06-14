// panel.jsx — minimalist UI atoms + the contextual panel that morphs by phase.
// Exports: Icon, Segmented, Pill, PrimaryBtn, GhostBtn, ContextPanel (to window).

function Icon({ name, size = 16 }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
  };
  const paths = {
    sun: <g><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
    sparkles: <g><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/></g>,
    upload: <g><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></g>,
    image: <g><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></g>,
    check: <path d="M5 12.5l4.5 4.5L19 7"/>,
    undo: <g><path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/></g>,
    redo: <g><path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/></g>,
    pencil: <g><path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"/><path d="M14.5 6.5l3 3"/></g>,
    corner: <g><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="7.5" cy="7.5" r="1"/><circle cx="16.5" cy="7.5" r="1"/><circle cx="7.5" cy="16.5" r="1"/><circle cx="16.5" cy="16.5" r="1"/></g>,
    center: <g><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9.5" cy="12" r="1"/><circle cx="14.5" cy="12" r="1"/></g>,
    palette: <g><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11" r="1"/></g>,
    bulb: <g><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2V16h6v-.5c0-.8.3-1.3 1-2A6 6 0 0 0 12 3z"/></g>,
    more: <g><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></g>,
    clock: <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
    brain: <g><path d="M9.5 4a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 5 9c0 1 .5 1.8 1.3 2.3"/><path d="M9.5 4A2.5 2.5 0 0 1 12 6.5v12"/><path d="M14.5 4a2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 19 9c0 1-.5 1.8-1.3 2.3"/><path d="M12 18.5a2.5 2.5 0 0 0 5 0c0-.4 0-.7-.2-1"/><path d="M12 18.5a2.5 2.5 0 0 1-5 0c0-.4 0-.7.2-1"/></g>,
    history: <g><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></g>,
    gear: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.6-1.2-1.8-3.1-1.9.8a7.6 7.6 0 0 0-2.6-1.5L14.4 2h-3.6l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-1.9-.8L4.2 7.8 5.8 9a7.8 7.8 0 0 0 0 3l-1.6 1.2 1.8 3.1 1.9-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2h3.6l.3-2a7.6 7.6 0 0 0 2.6-1.5l1.9.8 1.8-3.1z"/></g>,
    keyboard: <g><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"/></g>,
    arrowLeft: <path d="M15 6l-6 6 6 6"/>,
    chevron: <path d="M9 6l6 6-6 6"/>,
  };
  return <svg {...p}>{paths[name]}</svg>;
}

function Segmented({ options, value }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o} type="button" className={"seg-btn" + (o === value ? " on" : "")}>{o}</button>
      ))}
    </div>
  );
}

function Pill({ tone = "teal", children }) {
  return <span className={"pill pill-" + tone}>{children}</span>;
}

function PrimaryBtn({ icon, children, full }) {
  return (
    <button type="button" className={"btn primary" + (full ? " full" : "")}>
      {icon && <Icon name={icon} size={17} />}<span>{children}</span>
    </button>
  );
}

function GhostBtn({ icon, children, full, small }) {
  return (
    <button type="button" className={"btn ghost" + (full ? " full" : "") + (small ? " sm" : "")}>
      {icon && <Icon name={icon} size={16} />}<span>{children}</span>
    </button>
  );
}

const LEVELS = ["Easy", "Medium", "Hard", "Expert", "Master"];

function ContextPanel({ phase }) {
  if (phase === "start") {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>Start a puzzle</h2>
          <p className="sub">Generate a fresh board, or bring your own.</p>
        </div>
        <Segmented options={["Generate", "Import"]} value="Generate" />
        <div className="field-group">
          <label className="fld-label">Difficulty</label>
          <div className="chips">
            {LEVELS.map((l) => (
              <span key={l} className={"chip" + (l === "Medium" ? " on" : "")}>{l}</span>
            ))}
          </div>
        </div>
        <PrimaryBtn icon="sparkles" full>Generate puzzle</PrimaryBtn>
        <p className="hint-line">Pick a level and we’ll deal a solvable grid.</p>
      </div>
    );
  }
  if (phase === "import") {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>Import a puzzle</h2>
          <p className="sub">Paste 81 digits, drop a screenshot, or load a sample.</p>
        </div>
        <Segmented options={["Generate", "Import"]} value="Import" />
        <div className="field-group">
          <div className="fld-row">
            <label className="fld-label">81-character puzzle</label>
            <span className="count ok">81 / 81 · valid</span>
          </div>
          <div className="code-field">000694832004357196090002745070035004040008600031046000400000078000000420900400560</div>
        </div>
        <div className="btn-row two">
          <GhostBtn icon="sparkles" small>Sample</GhostBtn>
          <GhostBtn icon="upload" small>Upload</GhostBtn>
        </div>
        <div className="dropzone">
          <Icon name="image" size={18} />
          <span>Drop or paste a Sudoku screenshot</span>
        </div>
        <PrimaryBtn icon="check" full>Load puzzle</PrimaryBtn>
      </div>
    );
  }
  if (phase === "review") {
    return (
      <div className="panel">
        <div className="panel-head">
          <Pill tone="teal">Ready</Pill>
          <h2>Looks right?</h2>
          <p className="sub">32 clues detected · one valid solution.</p>
        </div>
        <dl className="mini-stats">
          <div><dt>Clues</dt><dd>32</dd></div>
          <div><dt>Empty</dt><dd>49</dd></div>
          <div><dt>Difficulty</dt><dd>Medium</dd></div>
        </dl>
        <PrimaryBtn icon="check" full>Start solving</PrimaryBtn>
        <GhostBtn icon="pencil" full>Edit clues</GhostBtn>
        <p className="hint-line">Givens lock once you begin — you can reset anytime.</p>
      </div>
    );
  }
  // solving
  return (
    <div className="panel">
      <div className="strategy">
        <div className="strategy-label"><Icon name="brain" size={15} /><span>Strategy note</span></div>
        <p className="strategy-text">Corner notes mark candidate digits in the corners of the cells you’ve selected.</p>
      </div>
      <PrimaryBtn icon="bulb" full>Get a hint</PrimaryBtn>
      <div className="disclosure">
        <button type="button" className="disc-row">
          <span className="disc-l"><Icon name="history" size={15} /> Hint history</span>
          <span className="disc-c">3</span>
        </button>
        <button type="button" className="disc-row">
          <span className="disc-l"><Icon name="gear" size={15} /> Settings</span>
          <Icon name="chevron" size={15} />
        </button>
        <button type="button" className="disc-row">
          <span className="disc-l"><Icon name="keyboard" size={15} /> Shortcuts</span>
          <Icon name="chevron" size={15} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, Segmented, Pill, PrimaryBtn, GhostBtn, ContextPanel });
