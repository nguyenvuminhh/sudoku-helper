export const SAMPLE_PUZZLE =
  "000694832" +
  "004357196" +
  "090002745" +
  "070035004" +
  "040008600" +
  "031046000" +
  "400000078" +
  "000000420" +
  "900400560";

export type TutorPhase = "loading" | "solving";
export type GeneratedLevel = "easy" | "medium" | "hard" | "expert" | "master";
export type EntryMode = "value" | "corner" | "center" | "color";

export const ENTRY_MODES: Array<{ id: EntryMode; label: string }> = [
  { id: "value", label: "Normal" },
  { id: "corner", label: "Corner" },
  { id: "center", label: "Center" },
  { id: "color", label: "Color" }
];

/** Accessible names for the 9 cell paint colors, indexed 1-9. */
export const PAINT_COLOR_NAMES = [
  "",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "gray"
] as const;

export const GENERATED_LEVELS: Array<{ id: GeneratedLevel; label: string }> = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "expert", label: "Expert" },
  { id: "master", label: "Master" }
];
