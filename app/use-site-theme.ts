"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type SiteTheme = "light" | "dark";

/** Same key and fallback as the landing and waitlist pages, so the choice carries across the site. */
export const THEME_STORAGE_KEY = "latch-theme";

function readTheme(): SiteTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // The theme still works when browser storage is unavailable.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeToTheme(onChange: () => void) {
  const preference = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  preference.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    preference.removeEventListener("change", onChange);
  };
}

/**
 * Site theme with no hydration flash: `theme` is null on the server and during
 * hydration, so callers can omit `data-theme` and let a
 * `prefers-color-scheme` rule style the first paint.
 */
export function useSiteTheme(backgrounds: Record<SiteTheme, string>) {
  const storedTheme = useSyncExternalStore<SiteTheme | null>(subscribeToTheme, readTheme, () => null);
  const [selectedTheme, setSelectedTheme] = useState<SiteTheme | null>(null);
  const theme = selectedTheme ?? storedTheme;
  const { light, dark } = backgrounds;

  useEffect(() => {
    if (!theme) return;
    const background = theme === "dark" ? dark : light;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;
  }, [theme, light, dark]);

  function toggleTheme() {
    const next: SiteTheme = (theme ?? readTheme()) === "dark" ? "light" : "dark";
    setSelectedTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Storage is optional. */
    }
  }

  return { theme, toggleTheme };
}
