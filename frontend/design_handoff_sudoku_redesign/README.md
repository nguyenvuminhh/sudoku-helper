# Handoff: Sudoku Strategy Desk — Minimalist Redesign

## Overview
A calmer, more minimalist visual redesign of the existing **Sudoku strategy desk** (Puzzle Hint / Sudoku Tutor) app. Same feature set and engine — re-skinned to put the board front-and-center, strip visual chrome, and collapse the always-visible stack of side panels into **one contextual panel** that changes with the current phase. Includes the full **puzzle-entry flow** (Start → Import → Review → Solving), light + dark themes, and responsive (desktop + mobile bottom-sheet) layouts.

The target codebase is the existing repo: **`nguyenvuminhh/sudoku-helper`** (Next.js App Router + React + TypeScript, styling in a single `globals.css`). This redesign is intended to be implemented **in place** in that repo.

## About the Design Files
The files in this bundle (`Sudoku Redesign.html`, `board.jsx`, `panel.jsx`, `shell.jsx`) are **design references created in HTML/React-for-prototyping** — they show the intended look, layout, and states. **They are not production code to copy directly.** They render inside a pan/zoom "design canvas" purely for presentation.

Your task is to **recreate these designs in the existing app's environment** — its real React/TypeScript components, hooks, and `globals.css` — reusing all current logic (`useSudokuGame`, `sudoku-state.ts`, `api.ts`, keyboard shortcuts, image import, etc.). This is a **styling + layout/IA refactor**, not a rewrite. Do not change the solver, hint engine, or data flow; change how it's presented.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and component states are specified below and should be matched closely. All color tokens are lifted from the app's existing `globals.css`, so most of the palette already exists — the work is reorganizing structure and reducing chrome, not inventing new colors.

---

## Core Design Changes (the intent)

1. **Remove chrome.** Delete the grid-paper background texture, the bordered/`box-shadow` cards around every panel, and the colored top-accent strips (`border-top: 5px …`). Surfaces become flat paper separated by whitespace and hairline (1px) dividers.
2. **One contextual panel** replaces the always-on stack (Generate, Load, Strategy note, Next hint, History, Settings, Shortcuts). The right column shows only what's relevant to the current phase.
3. **Board is the centerpiece** — centered, with a lighter frame; status row / entry toolbar / keypad all constrained to the board's width and centered under it.
4. **Progressive disclosure while solving** — only Undo/Redo + the four entry modes (Normal / Corner / Center / Color) are visible; Auto fill, Check, and other advanced actions move behind a **⋯ More** affordance. History / Settings / Shortcuts become collapsible rows in the panel rather than always-expanded cards.
5. **Restrained accent.** Teal is used only for: the primary action button, the active entry mode/tool, and the selected cell. Everything else is neutral ink/muted.
6. **Typography unchanged in spirit:** Inter for all UI and board numbers; Fraunces kept only for the wordmark and panel headings, at calmer sizes.

---

## Phases / Views

The app has two real phases in code today (`TutorPhase = "loading" | "solving"` in `lib/constants.ts`). The redesign presents the "loading" phase as three contextual states of one panel, plus the solving phase:

### 1. Start (generate) — `loading` phase, "Generate" tab
- **Purpose:** First thing the user sees; generate a fresh puzzle.
- **Board:** Empty, "ghost" styling (cells at ~25% opacity content, no shadow on the board frame).
- **Panel content (top→bottom):**
  - `h2` "Start a puzzle" (Fraunces 600, 1.4rem, `letter-spacing:-.01em`).
  - Sub line (muted, .88rem, line-height 1.45): "Generate a fresh board, or bring your own."
  - **Segmented control** [Generate | Import], "Generate" active.
  - Field label "DIFFICULTY" (uppercase, .72rem, 800, muted, letter-spacing .04em).
  - **Difficulty chips** Easy / Medium / Hard / Expert / Master (pill chips). Selected chip = teal border + `--teal-soft` bg + `--teal-deep` text. Maps to `GENERATED_LEVELS`.
  - **Primary button** (full width): sparkles icon + "Generate puzzle".
  - Hint line (faint, .8rem): "Pick a level and we'll deal a solvable grid."

### 2. Import — `loading` phase, "Import" tab
- **Purpose:** Paste 81 chars, drop/paste a screenshot, or load a sample.
- **Board:** Empty ghost (same as Start).
- **Panel content:**
  - `h2` "Import a puzzle" + sub "Paste 81 digits, drop a screenshot, or load a sample."
  - Segmented [Generate | Import], "Import" active.
  - Row: field label "81-CHARACTER PUZZLE" on the left, counter on the right. Counter "81 / 81 · valid" in `--teal-deep` when valid (`.count.ok`), otherwise `--faint`. (Wire to existing input length/validation.)
  - **Code field** (monospace, .72rem, line-height 1.7, `--field` bg, 1px `--line` border, radius 9px, `word-break:break-all`) showing the puzzle string. This replaces the current `<textarea>` visual; keep it editable.
  - Two ghost buttons side by side: "Sample" (sparkles icon) and "Upload" (upload icon).
  - **Dropzone**: dashed 1.5px `--line` border, radius 10px, image icon + "Drop or paste a Sudoku screenshot". (Reuses `useImageImport` drag/drop/paste.)
  - **Primary button** (full): check icon + "Load puzzle".

### 3. Review & confirm — `loading` phase, after a puzzle is loaded
- **Purpose:** Confirm the parsed board before locking givens. (Maps to the existing "Confirm" step.)
- **Board:** Givens rendered solid (ink), board frame gets the subtle shadow.
- **Panel content:**
  - Small **pill** "READY" (`--teal-soft` bg, `--teal-deep` text, uppercase .72rem 800).
  - `h2` "Looks right?" + sub "32 clues detected · one valid solution." (counts computed from the board).
  - **Mini-stats** grid (3 cols): Clues / Empty / Difficulty, each a small `--field` card (dt uppercase muted .66rem; dd 1.15rem 700 tabular-nums).
  - **Primary** (full): check + "Start solving".
  - **Ghost** (full): pencil + "Edit clues".
  - Hint line: "Givens lock once you begin — you can reset anytime."

### 4. Solving — `solving` phase
- **Purpose:** The main solving surface.
- **Board column (centered, constrained to board width):**
  - **Status row** (space-between, muted .82rem, tabular-nums): left "✓ No conflicts" (`--teal-deep`) / "N conflicts" (coral); right "⏱ 7:47" clock. (Wire to existing conflict count + timer; replaces the old `StatusPanel`.)
  - **Board.**
  - **Entry toolbar** (`--track` bg, radius 12px, padding 5px): `[Undo][Redo]` | divider | `[Normal][Corner][Center][Color]` (each icon + tiny .6rem label) | divider | `[⋯ More]`. Active mode = `--panel-elev` bg + `--teal-deep` text + small shadow. (Modes map to `EntryMode`. "More" opens Auto fill / Check / Color-clear / etc.)
  - **Keypad**: 10-col grid (1–9 + erase). Each key shows the digit (1.05rem 700) and a small remaining-count in the bottom-right corner (.55rem 800 faint). Active quick-fill digit = teal fill, white text. (Reuses `Keypad.tsx` logic + remaining counts; honor the "Show remaining digit counts" setting.)
- **Panel column:**
  - **Strategy note**: label "🧠 STRATEGY NOTE" (uppercase) + body text (`--ink`, 1rem, line-height 1.5). Driven by current tool/selection, as today.
  - **Primary** (full): bulb + "Get a hint".
  - **Disclosure rows** (stacked, each separated by a 1px `--line` top border): "🕘 Hint history" with a teal count badge; "⚙ Settings" with chevron; "⌨ Shortcuts" with chevron. Each expands in place. On mobile these are hidden (kept in an overflow/secondary location).

---

## Responsive behavior
- **Desktop (≥ ~900px):** two columns — `minmax(0,1fr)` board column + a fixed **332px** panel column, `gap: 30px`. Header is a flex row (wordmark left, theme pill right).
- **Mobile:** single column. Board fills width (`width:100%; aspect-ratio:1`). Status, toolbar, keypad all full-width beneath it. The contextual panel becomes a **bottom sheet** card (`--panel-elev` bg, 1px `--line`, radius 18px, padding 16px). Disclosure rows are hidden in the sheet; entry-toolbar mode **labels are hidden** (icons only) so the row fits narrow widths.
- The existing CSS already has `@media (max-width: 980px)` and `620px` breakpoints — extend those rather than adding new ones.

---

## Interactions & Behavior
- **Tab switch (Generate/Import):** toggles the panel body; no navigation.
- **Difficulty chip:** single-select; updates the level passed to the generate API.
- **Generate / Load / Sample / Upload / Drop-paste / Confirm:** all reuse existing handlers (`LoadingControls.tsx`, `useImageImport`). Only presentation changes.
- **Entry mode buttons:** set `EntryMode`; active state styled as above. Keep all keyboard shortcuts (`Z/X/C/V`, `Tab`, etc.) working.
- **⋯ More:** reveals the secondary actions (Auto fill, Check, clear color, New puzzle) — popover or expanding row; your call, but keep them one tap away.
- **Get a hint:** unchanged hint engine; result still highlights `hint-primary` / `hint-related` / `hint-elimination` / `hint-preview` cells on the board (those classes already exist in `globals.css` — keep them).
- **Transitions:** keep them subtle (140ms ease on hover/toggle, matching current). Respect `prefers-reduced-motion` (already handled).
- **Theme toggle:** unchanged (`useTheme`, `data-theme` on `<html>`).

## State Management
No new state. Reuse: `useSudokuGame` (board, selection, notes, colors, history, timer, conflicts), `useSettings` (remaining counts, auto-advance), `useTheme`, `useImageImport`, `useKeyboardShortcuts`. The only new *UI* state is the Generate/Import tab selection and which disclosure row is open in the solving panel — both local component state.

---

## Design Tokens

All already defined in `frontend/src/app/globals.css`. The redesign **reuses** these and adds a few softer neutrals. Light / Dark pairs:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#fbfcf8` | `#0f141a` | page background (flat, **no texture**) |
| `--ink` | `#1b1f24` | `#e7ecf1` | primary text, given digits |
| `--muted` | `#6a727c` | `#9aa6b1` | secondary text, labels |
| `--faint` | `#9aa2ab` | `#6c7884` | remaining counts, hint lines |
| `--line` | `#e7eae5` | `#222c34` | hairline dividers, borders |
| `--panel-elev` | `#ffffff` | `#161d24` | keys, active toggles, mobile sheet |
| `--track` | `#eef1ec` | `#1b232b` | segmented/toolbar track bg |
| `--field` | `#ffffff` | `#141b22` | code field, mini-stat cards |
| `--teal` | `#0c8f93` | `#2bb7af` | primary action, active, selection ring |
| `--teal-deep` | `#066b70` | `#74dad0` | teal text on soft bg |
| `--teal-soft` | `#e6f3f1` | `#13302d` | active-chip / pill / badge bg |
| `--user` (cell-user-text) | `#2563b0` | `#7cb1f4` | user-entered digits |
| `--cell-bg` | `#ffffff` | `#141b22` | board cells |
| `--cell-line` | `#e3e7e1` | `#222c34` | thin cell borders |
| `--box-line` / edge | `#c2c9bf` | `#36424c` | 3×3 box separators + board frame (2px) |
| `--sel-bg` | `#dcefe9` | `#123b35` | selected cell fill |
| `--peer-bg` | `#f1f5f1` | `#19212a` | row/col/box peer tint |
| `--hint-primary` | `#ffeaa3` | `#5a4f1d` | hint target cell |
| `--hint-related` | `#e1ecfb` | `#1f344b` | hint related cells |

> Note: the redesign's `--line`, `--cell-line`, `--box-line`, `--muted`, `--faint`, `--track`, `--panel-elev` are slightly softer than the originals (`#d7ddde`, `#909c9e`, etc.) to reduce chrome. Prefer the values above. Original semantic board tokens (`--conflict-bg`, `--same-bg`, paint colors, hint-elimination/preview) stay as-is.

**Type scale:** Inter 400/500/600/700/800; Fraunces 600. Board digit `clamp(13px, 56cqh, 30px)` 600 (cells use `container-type: size`). h2 1.4rem. sub .88rem. labels .72rem/800/uppercase. button .9rem/600. code .72rem mono.

**Radii:** board 10px · cards/sheet 18px (mobile) / 10px · buttons 10px · keys 9px · chips/pills 999px · track/segmented 11–12px · code field 9px.

**Spacing:** panel column 332px fixed; stage gap 30px; panel internal gap 16px; board-stack gap 14px; keypad gap 7px (5px mobile).

**Shadows:** drop the heavy `--shadow` (`0 18px 50px`). Use only `--shadow-sm` = `0 1px 2px rgba(25,33,38,.06)` (light) / `0 1px 2px rgba(0,0,0,.3)` (dark) on keys, active toggles, and the loaded board.

## Assets
- **Fonts:** Inter + Fraunces (already loaded via `next/font/google` in `layout.tsx`).
- **Icons:** simple line icons (sun, moon, sparkles, upload, image, check, undo, redo, pencil, corner, center, palette, bulb, more, clock, brain, history, gear, keyboard, chevron, arrow-left). The prototype hand-rolls inline SVGs in `panel.jsx` (`Icon` component) — in the real app, use the codebase's existing icon set / library if one exists; otherwise these SVG paths are fine to lift.
- No raster images.

## Files in this bundle
- `Sudoku Redesign.html` — the full prototype (open in a browser to see all states). Contains the complete minimalist CSS in a `<style>` block — **this is the source of truth for the styling**; port it into `globals.css`.
- `shell.jsx` — `AppShell` (topbar + board column + contextual panel) and `PhoneFrame`. Shows the overall layout and which pieces appear per phase.
- `panel.jsx` — UI atoms (`Icon`, `Segmented`, `Pill`, `PrimaryBtn`, `GhostBtn`) and `ContextPanel` (the phase-driven panel content + exact copy).
- `board.jsx` — `SudokuBoard` (renders an 81-char string; selection/peer/hint/notes classes) and `Keypad`.

## Target files in the repo to change
- `frontend/src/app/globals.css` — port the new tokens + component styles; remove the grid-paper `background`, card borders/shadows, and `border-top` accent strips.
- `frontend/src/app/page.tsx` — restructure the layout into board column + single contextual panel.
- `frontend/src/components/TopBar.tsx` — wordmark + theme pill.
- `frontend/src/components/LoadingControls.tsx` — Generate/Import tabbed contextual panel + Review state.
- `frontend/src/components/SolvingControls.tsx` — entry toolbar (modes + ⋯ More) + status row.
- `frontend/src/components/HintPanel.tsx`, `HistoryPanel.tsx`, `SettingsPanel.tsx`, `ShortcutsPanel.tsx` — fold into the solving panel's strategy + disclosure rows.
- `frontend/src/components/SudokuBoard.tsx`, `Keypad.tsx`, `StatusPanel.tsx` — lighter framing; status becomes the inline row above the board.
- Keep all hooks and `lib/` logic unchanged.
