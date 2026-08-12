"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { downloadCsv } from "@/lib/csvExport";
import InsightsExportButton from "@/components/InsightsExportButton";

const RADIUS = 28;
const STROKE_WIDTH = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONUT_SIZE = 140;

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

// Rounded-full outline chip — one per segment, sitting below the donut
// instead of a side legend, so each donut is self-contained (ring on top,
// its two counts as pills underneath) and every donut in the row lines up
// on the same baseline regardless of label length.
function AllocationChip({ count, label, colorClass }) {
  return (
    <span
      className={`flex w-44 items-center justify-center rounded-full border bg-white/30 px-4 py-1 text-center text-[11px] font-bold whitespace-nowrap ${colorClass}`}
    >
      {count} {label}
    </span>
  );
}

// Two-color proportion pie — a blue slice for the primary count, an amber
// slice for the secondary count, sized by share of the total. Same SVG
// donut technique as the Attendance page's Work Hours rings, but two
// colored segments instead of one progress ring, since this shows a split
// rather than progress toward a target: the primary arc is drawn first from
// the top, then the secondary arc picks up exactly where it left off (via
// strokeDashoffset={-primaryArc}).
function ShareDonut({ primaryCount, primaryLabel, secondaryCount, secondaryLabel }) {
  const total = primaryCount + secondaryCount;
  const primaryArc = total > 0 ? (primaryCount / total) * CIRCUMFERENCE : 0;
  const secondaryArc = CIRCUMFERENCE - primaryArc;

  return (
    <div className="flex flex-col items-center">
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
      <div className="flex flex-col items-center gap-2">
        <AllocationChip count={primaryCount} label={primaryLabel} colorClass="border-[#2563EB] text-[#2563EB]" />
        <AllocationChip count={secondaryCount} label={secondaryLabel} colorClass="border-[#F59E0B] text-[#F59E0B]" />
      </div>
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
  const acceptanceRate = rangeData?.acceptance.total
    ? Math.round((rangeData.acceptance.accepted / rangeData.acceptance.total) * 100)
    : null;

  function handleExport() {
    if (!rangeData) return;
    downloadCsv(
      `allocation-preference-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Category", "Smart", "Manual"],
      [
        ["Allocation", rangeData.allocation.ai, rangeData.allocation.manual],
        ["Creation", rangeData.creation.ai, rangeData.creation.manual],
        ["AI Suggestions Accepted", rangeData.acceptance.accepted, rangeData.acceptance.total],
      ],
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">Allocation Preference</h2>
        <div className="flex items-center gap-2">
          <InsightsExportButton onClick={handleExport} disabled={!rangeData} label="Export allocation preference data" />
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
      </div>

      {acceptanceRate != null ? (
        <div className="flex shrink-0 justify-center px-5">
          <span className="rounded-full bg-gradient-to-r from-[#2563EB] to-[#F59E0B] px-6 py-2 text-sm font-black text-white">
            AI Suggestion Acceptance Rate is {acceptanceRate}%
          </span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 pt-2 pb-4">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!error && !rangeData ? <p className="text-sm text-[#52627a]">Loading...</p> : null}
        {!error && rangeData ? (
          <div className="grid grid-cols-2 items-center justify-items-center gap-20">
            <ShareDonut
              primaryCount={rangeData.allocation.ai}
              primaryLabel="Smart Task Allocation"
              secondaryCount={rangeData.allocation.manual}
              secondaryLabel="Manual Task Allocation"
            />
            <ShareDonut
              primaryCount={rangeData.creation.ai}
              primaryLabel="Smart Task Creation"
              secondaryCount={rangeData.creation.manual}
              secondaryLabel="Manual Task Creation"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
