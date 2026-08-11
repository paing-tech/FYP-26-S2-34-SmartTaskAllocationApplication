"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const RADIUS = 32;
const STROKE_WIDTH =30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONUT_SIZE = 100;

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

// A legend row that reads as "pointing to" its share of the ring: the
// title + count sit to the left, a short leader line runs to a small dot in
// the segment's color, standing in for a line drawn straight to that arc.
function LegendRow({ title, count, colorClass }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight">
        <p className="text-[10px] font-bold text-[#475569]">{title}</p>
        <p className="text-sm font-black text-[#0D1E4C]">{count}</p>
      </div>
      <span className="h-px w-5 shrink-0 bg-[#94a3b8]" />
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClass}`} />
    </div>
  );
}

// Two-color proportion ring — a blue arc for the primary count, an amber arc
// for the secondary count, sized by share of the total. Same SVG donut
// technique as the Attendance page's Work Hours rings, but two colored
// segments instead of one progress ring, since this shows a split rather
// than progress toward a target: the primary arc is drawn first from the
// top, then the secondary arc picks up exactly where it left off (via
// strokeDashoffset={-primaryArc}). The legend sits to the left instead of
// captioned underneath, each row leading straight into its own arc.
function ShareDonut({ primaryCount, primaryLabel, secondaryCount, secondaryLabel }) {
  const total = primaryCount + secondaryCount;
  const primaryArc = total > 0 ? (primaryCount / total) * CIRCUMFERENCE : 0;
  const secondaryArc = CIRCUMFERENCE - primaryArc;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-3">
        <LegendRow title={primaryLabel} count={primaryCount} colorClass="bg-[#2563EB]" />
        <LegendRow title={secondaryLabel} count={secondaryCount} colorClass="bg-[#F59E0B]" />
      </div>
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

      <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-8 px-5 pb-4">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!error && !rangeData ? <p className="text-sm text-[#52627a]">Loading...</p> : null}
        {!error && rangeData ? (
          <>
            <ShareDonut
              primaryCount={rangeData.allocation.ai}
              primaryLabel="Smart Task Allocation"
              secondaryCount={rangeData.allocation.manual}
              secondaryLabel="Manual Task Allocation"
            />
            <ShareDonut
              primaryCount={rangeData.creation.ai}
              primaryLabel="Smart Task Allocation"
              secondaryCount={rangeData.creation.manual}
              secondaryLabel="Manual Task Allocation"
            />
            <ShareDonut
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
