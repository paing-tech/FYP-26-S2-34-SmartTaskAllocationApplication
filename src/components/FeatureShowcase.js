"use client";

import { useEffect, useState } from "react";
import { useSiteContent } from "@/lib/useSiteContent";

export function FeatureIcon({ name }) {
  const p = {
    className: "h-6 w-6",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (name === "allocation")
    return (
      <svg {...p}>
        <path d="M3 7h13M3 7l3-3M3 7l3 3" />
        <path d="M21 17H8M21 17l-3-3M21 17l-3 3" />
      </svg>
    );
  if (name === "team")
    return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    );
  if (name === "workspace")
    return (
      <svg {...p}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === "schedule")
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
        <path d="M12 14v3l2 1" />
      </svg>
    );
  if (name === "ai")
    return (
      <svg {...p}>
        <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
        <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 15l3-4 3 2 4-6" />
    </svg>
  );
}

export default function FeatureShowcase() {
  const content = useSiteContent("features");
  const features = content.items ?? [];
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Clamped at read-time (not via effect) so a CMS edit that shrinks the
  // feature list can never leave activeIndex pointing past the end.
  const activeIndex = features.length ? Math.min(rawActiveIndex, features.length - 1) : 0;
  const active = features[activeIndex];

  function selectFeature(index) {
    if (index === activeIndex) return;
    setReady(false);
    setActiveIndex(index);
  }

  // Auto-advance through features every 5s; pause while the user is hovering.
  useEffect(() => {
    if (isPaused || !features.length) return undefined;
    const timer = setInterval(() => {
      setReady(false);
      setActiveIndex((index) => (index + 1) % features.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused, features.length]);

  if (content.hidden || !active) {
    return null;
  }

  return (
    <section className="w-full bg-white py-24 text-[#0D1E4C]">
      <div className="pl-[18%] pr-[6%]">
        <h2 className="max-w-[720px] text-4xl font-bold leading-[1.1] tracking-tight lg:text-5xl">
          {content.heading}
        </h2>

        <div className="mt-14 flex flex-col gap-10 lg:flex-row lg:items-stretch">
          {/* Left: feature list */}
          <ul
            className="flex flex-col gap-2 lg:w-[40%]"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {features.map((feature, index) => {
              const isActive = index === activeIndex;
              return (
                <li key={feature.videoId ?? index}>
                  <button
                    type="button"
                    onMouseEnter={() => selectFeature(index)}
                    onFocus={() => selectFeature(index)}
                    onClick={() => selectFeature(index)}
                    className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-[#2563EB]/30 bg-[#2563EB]/5 shadow-[0_10px_30px_rgba(37,99,235,0.12)]"
                        : "border-transparent hover:bg-[#0D1E4C]/[0.04]"
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                        isActive ? "bg-[#2563EB] text-white" : "bg-[#0D1E4C]/[0.06] text-[#0D1E4C]"
                      }`}
                    >
                      <FeatureIcon name={feature.icon} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-lg font-bold">{feature.title}</span>
                      <span
                        className={`mt-1 block text-sm leading-relaxed transition-all ${
                          isActive ? "max-h-20 opacity-100" : "max-h-0 overflow-hidden opacity-0 lg:group-hover:max-h-20 lg:group-hover:opacity-70"
                        } text-[#0D1E4C]/70`}
                      >
                        {feature.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Right: demo video */}
          <div className="lg:flex-1">
            <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-[#0D1E4C]/10 bg-gradient-to-br from-[#E8F0FF] via-[#F4F8FF] to-[#DCE7FF] shadow-[0_30px_80px_rgba(13,30,76,0.15)]">
              {/* Placeholder shown until (or unless) the clip loads */}
              {!ready ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  <span className="text-lg font-bold text-[#0D1E4C]">{active.title}</span>
                  <span className="text-sm text-[#0D1E4C]/60">Demo preview</span>
                </div>
              ) : null}

              <video
                key={active.videoId}
                src={`/features/${active.videoId}.mp4`}
                poster={`/features/${active.videoId}.jpg`}
                autoPlay
                muted
                loop
                playsInline
                onCanPlay={() => setReady(true)}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  ready ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
