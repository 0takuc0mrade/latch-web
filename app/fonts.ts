import localFont from "next/font/local";

/** Heading font shared by the landing page and the demo. */
export const stackSans = localFont({
  src: "../public/fonts/stack-sans-headline.ttf",
  display: "swap",
  variable: "--font-stack-sans",
  weight: "200 700",
});

/**
 * PLACEHOLDER accent (handwritten) font. The Figma site uses Biro Script, which
 * is not in this repo yet; Caveat (SIL OFL) stands in so accent words don't fall
 * back to a system cursive. Swap `src` for the Biro Script file when supplied
 * (see PR_NOTES.md).
 */
export const accentFont = localFont({
  src: "../public/fonts/caveat-placeholder.woff2",
  display: "swap",
  variable: "--font-accent",
  weight: "400 700",
});
