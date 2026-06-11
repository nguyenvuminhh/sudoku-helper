import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Puzzle Hint | Sudoku Tutor",
  description: "Step-by-step Sudoku hints with layered explanations and image import."
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("sudoku-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
