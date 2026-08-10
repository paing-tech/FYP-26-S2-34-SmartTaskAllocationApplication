"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppearance } from "@/components/appearance/AppearanceContext";
import GlassSurface from "@/components/ui/glass-surface";

const PRESET_COLORS = [
  "#E2E8F0",
  "#C7DDEB",
  "#BBE1FA",
  "#E9D5FF",
  "#FBCFE8",
  "#D1FAE5",
];

// ~4MB ceiling — data URLs above this tend to blow the localStorage quota.
const MAX_WALLPAPER_BYTES = 4 * 1024 * 1024;

export default function AppearancePage() {
  const router = useRouter();
  const {
    appearance,
    backgroundStyle,
    setBackgroundColor,
    setWallpaper,
    setBackgroundType,
    reset,
  } = useAppearance();
  const { background } = appearance;
  const fileInputRef = useRef(null);
  const [urlDraft, setUrlDraft] = useState(
    background.type === "wallpaper" ? background.wallpaper : "",
  );
  const [notice, setNotice] = useState("");

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_WALLPAPER_BYTES) {
      setNotice("Image is larger than 4MB and may not be saved. Try a smaller file or a URL.");
    } else {
      setNotice("");
    }
    const reader = new FileReader();
    reader.onload = () => setWallpaper(String(reader.result));
    reader.readAsDataURL(file);
  }

  function applyUrl() {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    setWallpaper(trimmed);
    setNotice("");
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden text-[#07183b]" style={backgroundStyle}>
      <GlassSurface className="absolute left-1/2 top-1/2 z-10 max-h-[calc(100vh-3rem)] w-[24rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-white/40 p-6">
        <h2 className="text-center text-2xl font-black text-[#07183b]">Appearance</h2>

        {/* Background type */}
        <section className="mt-6 text-center">
          <div className="inline-flex rounded-full border border-white/60 bg-white/50 p-1">
            {[
              { value: "solid", label: "Solid color" },
              { value: "wallpaper", label: "Wallpaper" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setBackgroundType(option.value)}
                className={`rounded-full px-6 py-2 text-sm font-bold transition-colors ${
                  background.type === option.value
                    ? "bg-[#0D1E4C] text-white"
                    : "text-[#0A2540] hover:bg-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* Solid color controls */}
        {background.type === "solid" ? (
          <section className="mt-5 text-center">
            <div className="flex flex-wrap justify-center gap-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackgroundColor(color)}
                  aria-label={`Use ${color}`}
                  className={`h-10 w-10 rounded-full border-2 shadow-sm transition-transform hover:scale-110 ${
                    background.color.toLowerCase() === color.toLowerCase()
                      ? "border-[#0D1E4C] ring-2 ring-[#0D1E4C]/30"
                      : "border-white/80"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <label className="mt-4 flex items-center justify-center gap-3 text-sm font-semibold text-[#0A2540]">
              Custom color
              <input
                type="color"
                value={background.color}
                onChange={(event) => setBackgroundColor(event.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-white/60 bg-white p-1"
              />
              <span className="font-mono text-xs text-[#52627a]">{background.color}</span>
            </label>
          </section>
        ) : (
          /* Wallpaper controls */
          <section className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-semibold text-[#0A2540]">Image URL</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="url"
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder="https://images.example.com/wallpaper.jpg"
                  className="h-11 flex-1 rounded-xl border border-white/60 bg-white px-4 text-sm text-[#0B1B32] outline-none focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
                />
                <button
                  type="button"
                  onClick={applyUrl}
                  className="h-11 rounded-xl bg-[#0a2a66] px-5 text-sm font-bold text-white hover:bg-[#061a40]"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-white/60" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">or</span>
              <span className="h-px flex-1 bg-white/60" />
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-[#83A6CE] bg-white/50 py-4 text-sm font-bold text-[#0A2540] hover:bg-white"
            >
              Upload from device
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />

            {background.wallpaper ? (
              <div
                className="h-24 w-full rounded-xl border border-white/60 bg-cover bg-center shadow-inner"
                style={{ backgroundImage: `url("${background.wallpaper}")` }}
              />
            ) : null}

            {notice ? <p className="text-xs font-medium text-[#b45309]">{notice}</p> : null}
          </section>
        )}

        <div className="mt-7 flex items-center justify-between">
          <button
            type="button"
            onClick={reset}
            className="text-sm font-semibold text-[#52627a] hover:text-[#0A2540] hover:underline"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-12 items-center justify-center rounded-full border border-white/60 bg-white/40 pl-2 pr-4 text-sm font-bold text-[#0D1E4C] transition hover:bg-white/80 hover:scale-110"
          >
            <span className="material-symbols-outlined static text-xl" aria-hidden="true">
              chevron_left
            </span>
            Back
          </button>
        </div>
      </GlassSurface>
    </main>
  );
}
