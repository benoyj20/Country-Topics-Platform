import { Inter, Source_Serif_4 } from "next/font/google";

// Downloaded when the site is built and served from the site itself, so
// visitors' browsers never contact Google. Text in other scripts falls back
// to the system fonts in styles/tokens.css. Shared by the site and the
// admin.
const sans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

/** The class names that set the fonts' variables, for <html>. */
export const FONT_VARIABLES = `${sans.variable} ${serif.variable}`;
