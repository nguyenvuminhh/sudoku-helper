import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Puzzle Hint | Sudoku Tutor",
  description: "Step-by-step Sudoku hints with layered explanations and image import."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
