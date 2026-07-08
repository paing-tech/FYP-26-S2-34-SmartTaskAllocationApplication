"use client";

export default function HoverPill({ label, detail, tone = "slate", maxWidthClass = "max-w-[200px]", variant = "panel" }) {
  const tones = {
    slate: "border-[#0D1E4C]/15 bg-white/70 text-[#0D1E4C]",
    blue: "border-[#2563EB]/25 bg-[#2563EB]/10 text-[#1E40AF]",
    purple: "border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#5B21B6]",
  };
  return (
    <span className="group/pill relative inline-flex align-middle">
      <span
        className={`inline-block ${maxWidthClass} truncate rounded-full border px-3 py-1 text-sm font-bold leading-5 ${tones[tone]}`}
      >
        {label}
      </span>
      {detail ? (
        variant === "card" ? (
          <span className="absolute left-0 top-full z-40 hidden pt-2 text-left group-hover/pill:block">
            {detail}
          </span>
        ) : (
          <span className="pointer-events-none absolute left-0 top-full z-40 mt-2 hidden w-72 max-w-[80vw] rounded-2xl border border-white/60 bg-white/95 p-4 text-left shadow-[0_18px_50px_rgba(7,24,59,0.2)] backdrop-blur-md group-hover/pill:block">
            {detail}
          </span>
        )
      ) : null}
    </span>
  );
}
