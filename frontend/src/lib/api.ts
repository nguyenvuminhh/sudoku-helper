import { gridToPayload, type OcrCell, type SudokuGrid } from "./sudoku-state";

export type HintResponse = {
  technique: {
    id: string;
    name: string;
    rank: number;
  };
  action: {
    type: "place" | "eliminate" | "none";
    cell?: { row: number; col: number } | null;
    digit?: number | null;
    eliminations: Array<{ cell: { row: number; col: number }; digit: number }>;
  };
  summary: string;
  explanation: string[];
  highlights: {
    primary_cells: Array<{ row: number; col: number }>;
    related_cells: Array<{ row: number; col: number }>;
    eliminations: Array<{ cell: { row: number; col: number }; digit: number }>;
  };
};

export type OcrResponse = {
  cells: OcrCell[];
  warnings: string[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function requestHint(grid: SudokuGrid): Promise<HintResponse> {
  return postJson<HintResponse>(`${API_BASE_URL}/api/sudoku/hint`, { grid: gridToPayload(grid) });
}

export async function recognizeImage(file: File): Promise<OcrResponse> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/sudoku/ocr`, { method: "POST", body });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      return body.detail.map((item: { message?: string }) => item.message ?? JSON.stringify(item)).join(" ");
    }
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    return `${response.status} ${response.statusText}`;
  }
  return `${response.status} ${response.statusText}`;
}
