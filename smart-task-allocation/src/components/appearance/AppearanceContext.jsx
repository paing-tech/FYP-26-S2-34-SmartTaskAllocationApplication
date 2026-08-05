"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "optima-appearance";

export const DEFAULT_APPEARANCE = {
  theme: "light", // "light" | "dark" — dark styling implemented later
  background: {
    type: "solid", // "solid" | "wallpaper"
    color: "#C7DDEB",
    wallpaper: "", // image URL or data URL
  },
};

const AppearanceContext = createContext(null);

export function AppearanceProvider({ children }) {
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [hydrated, setHydrated] = useState(false);

  // Load any persisted settings once on the client.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        queueMicrotask(() =>
          setAppearance((prev) => ({
            ...prev,
            ...parsed,
            background: { ...prev.background, ...(parsed.background ?? {}) },
          })),
        );
      }
    } catch {
      // ignore corrupt/unavailable storage
    }
    queueMicrotask(() => setHydrated(true));
  }, []);

  // Persist after the first load so we don't clobber storage with defaults.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // storage full (e.g. very large wallpaper) or unavailable — ignore
    }
  }, [appearance, hydrated]);

  // Reflect the theme on <html> so dark-mode styles can hook in later.
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.classList.toggle("dark", appearance.theme === "dark");
  }, [appearance.theme, hydrated]);

  const value = useMemo(() => {
    const { background } = appearance;
    const backgroundStyle =
      background.type === "wallpaper" && background.wallpaper
        ? {
            backgroundImage: `url("${background.wallpaper}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }
        : { backgroundColor: background.color };

    return {
      appearance,
      hydrated,
      backgroundStyle,
      setTheme: (theme) => setAppearance((p) => ({ ...p, theme })),
      setBackgroundColor: (color) =>
        setAppearance((p) => ({ ...p, background: { ...p.background, type: "solid", color } })),
      setWallpaper: (wallpaper) =>
        setAppearance((p) => ({ ...p, background: { ...p.background, type: "wallpaper", wallpaper } })),
      setBackgroundType: (type) =>
        setAppearance((p) => ({ ...p, background: { ...p.background, type } })),
      reset: () => setAppearance(DEFAULT_APPEARANCE),
    };
  }, [appearance, hydrated]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return ctx;
}
