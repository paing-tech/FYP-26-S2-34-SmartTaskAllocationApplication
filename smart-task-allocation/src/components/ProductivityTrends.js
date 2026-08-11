"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const SERIES = [
  { key: "completed", label: "Tasks completed", color: "#2563EB" },
  { key: "beforeDeadline", label: "Completed before deadline", color: "#047857" },
  { key: "overdue", label: "Overdue, not completed", color: "#B91C1C" },
];

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function LineChart({ points }) {
  const maxValue = Math.max(1, ...points.flatMap((point) => SERIES.map((series) => point[series.key] ?? 0)));
  const xFor = (index) => 48 + (index * 504) / Math.max(1, points.length - 1);
  const yFor = (value) => 146 - (Number(value || 0) / maxValue) * 112;

  return (
    <div className="min-h-0 flex-1">
      <svg viewBox="0 0 600 190" className="h-full min-h-44 w-full" role="img" aria-label="Productivity line chart">
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            x1="48"
            x2="552"
            y1={146 - ratio * 112}
            y2={146 - ratio * 112}
            stroke="#CBD5E1"
            strokeDasharray="4 6"
          />
        ))}

        {SERIES.map((series) => {
          const coordinates = points.map((point, index) => `${xFor(index)},${yFor(point[series.key])}`).join(" ");
          return (
            <g key={series.key}>
              <polyline
                points={coordinates}
                fill="none"
                stroke={series.color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((point, index) => (
                <circle
                  key={`${series.key}-${point.label}`}
                  cx={xFor(index)}
                  cy={yFor(point[series.key])}
                  r="5"
                  fill="white"
                  stroke={series.color}
                  strokeWidth="3"
                />
              ))}
            </g>
          );
        })}

        {points.map((point, index) => (
          <text
            key={point.label}
            x={xFor(index)}
            y="174"
            textAnchor="middle"
            className="fill-[#64748B] text-[12px] font-bold"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function ProductivityTrends() {
  const [range, setRange] = useState("week");
  const [dataByRange, setDataByRange] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (dataByRange[range]) return;
    let cancelled = false;

    (async () => {
      try {
        setError("");
        const response = await fetch(`/api/insights/productivity-trends?range=${range}`, {
          headers: await authHeaders(),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load productivity trends.");
        if (!cancelled) setDataByRange((current) => ({ ...current, [range]: result.points }));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataByRange, range]);

  const points = useMemo(() => dataByRange[range] ?? [], [dataByRange, range]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 p-5 backdrop-blur-md">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h2 className="text-lg font-black text-[#0D1E4C]">Productivity Trends</h2>
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

      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      {!error && !points.length ? <p className="mt-4 text-sm text-[#64748B]">Loading productivity trends...</p> : null}
      {points.length ? <LineChart points={points} /> : null}

      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475569]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </section>
  );
}
