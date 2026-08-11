"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const RADIUS = 36;
const STROKE_WIDTH = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONUT_SIZE = 68;

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

// Two-color proportion ring — a blue arc for the primary count, an amber arc
// for the secondary count, sized by share of the total. Same SVG donut
// technique as the Attendance page's Work Hours rings, but two colored
// segments instead of one progress ring, since this shows a split rather
// than progress toward a target: the primary arc is drawn first from the
// top, then the secondary arc picks up exactly where it left off (via
// strokeDashoffset={-primaryArc}).
function ShareDonut({ label, primaryCount, primaryLabel, secondaryCount, secondaryLabel }) {
  const total = primaryCount + secondaryCount;
  const primaryArc = total > 0 ? (primaryCount / total) * CIRCUMFERENCE : 0;
  const secondaryArc = CIRCUMFERENCE - primaryArc;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 100 100" style={{ height: DONUT_SIZE, width: DONUT_SIZE }}>
        {total === 0 ? (
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth={STROKE_WIDTH} />
        ) : (
          <>
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke="#2563EB"
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${primaryArc} ${CIRCUMFERENCE - primaryArc}`}
              transform="rotate(-90 50 50)"
            />
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${secondaryArc} ${CIRCUMFERENCE - secondaryArc}`}
              strokeDashoffset={-primaryArc}
              transform="rotate(-90 50 50)"
            />
          </>
        )}
        <text x="50" y="56" textAnchor="middle" fontSize="17" fontWeight="900" fill="#0D1E4C">
          {total}
        </text>
      </svg>
      <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
      <p className="text-[10px] font-semibold text-[#64748B]">
        <span className="font-black text-[#0D1E4C]">{primaryCount}</span> {primaryLabel} ·{" "}
        <span className="font-black text-[#0D1E4C]">{secondaryCount}</span> {secondaryLabel}
      </p>
    </div>
  );
}

export default function AllocationVolume() {
  const [range, setRange] = useState("week");
  const [dataByRange, setDataByRange] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (dataByRange[range]) return;
    let cancelled = false;

    (async () => {
      try {
        setError("");
        const response = await fetch(`/api/insights/allocation-efficiency?range=${range}`, {
          headers: await authHeaders(),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load Allocation Preference.");
        if (!cancelled) setDataByRange((current) => ({ ...current, [range]: result.range }));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataByRange, range]);

  const rangeData = dataByRange[range];

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">Allocation Preference</h2>
        <div className="flex rounded-full border border-white/70 bg-white/40 p-1">
          {["week", "month"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${
                range === option ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 px-5 pb-4">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!error && !rangeData ? <p className="text-sm text-[#52627a]">Loading...</p> : null}
        {!error && rangeData ? (
          <>
            <ShareDonut
              label="Allocation"
              primaryCount={rangeData.allocation.ai}
              primaryLabel="Smart"
              secondaryCount={rangeData.allocation.manual}
              secondaryLabel="Manual"
            />
            <ShareDonut
              label="Creation"
              primaryCount={rangeData.creation.ai}
              primaryLabel="Smart"
              secondaryCount={rangeData.creation.manual}
              secondaryLabel="Manual"
            />
            <ShareDonut
              label="AI Suggestion Acceptance"
              primaryCount={rangeData.acceptance.accepted}
              primaryLabel="Accepted"
              secondaryCount={rangeData.acceptance.total - rangeData.acceptance.accepted}
              secondaryLabel="Not Accepted"
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
