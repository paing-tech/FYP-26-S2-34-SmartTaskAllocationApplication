"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { downloadCsv } from "@/lib/csvExport";
import InsightsExportButton from "@/components/InsightsExportButton";

const SERIES = [
  { key: "completed", label: "Total Tasks Completed", color: "#2563EB" },
  { key: "beforeDeadline", label: "Tasks Completed On Time", color: "#16A34A" },
  { key: "overdue", label: "Overdue Tasks", color: "#DC2626" },
];

// Fixed axis scale per range (not derived from the data's own max) so the
// grid stays stable and the same numbers are comparable across toggles,
// instead of rescaling every time the underlying counts change.
const Y_TICKS = {
  week: [0, 2, 4, 6, 8, 10],
  month: [0, 5, 10, 15, 20, 25],
};

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

const PLOT_TOP = 14;
const PLOT_BOTTOM = 146;
const PLOT_LEFT = 48;
const PLOT_RIGHT = 552;

function LineChart({ points, range }) {
  const ticks = Y_TICKS[range] ?? Y_TICKS.week;
  const maxTick = ticks[ticks.length - 1];
  const xFor = (index) => PLOT_LEFT + (index * (PLOT_RIGHT - PLOT_LEFT)) / Math.max(1, points.length - 1);
  const yFor = (value) => PLOT_BOTTOM - (Number(value || 0) / maxTick) * (PLOT_BOTTOM - PLOT_TOP);

  return (
    <div className="min-h-0 flex-1">
      <svg viewBox="0 0 600 190" className="h-full min-h-44 w-full" role="img" aria-label="Productivity line chart">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="#CBD5E1"
              strokeDasharray="4 6"
            />
            <text
              x={PLOT_LEFT - 10}
              y={yFor(tick) + 4}
              textAnchor="end"
              className="fill-[#94A3B8] text-[11px] font-semibold"
            >
              {tick}
            </text>
          </g>
        ))}

        {SERIES.map((series) => (
          <polyline
            key={series.key}
            points={points.map((point, index) => `${xFor(index)},${yFor(point[series.key])}`).join(" ")}
            fill="none"
            stroke={series.color}
            strokeWidth="1.5"
          />
        ))}

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
        if (!cancelled) setDataByRange((current) => ({ ...current, [range]: result }));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataByRange, range]);

  const points = useMemo(() => dataByRange[range]?.points ?? [], [dataByRange, range]);
  const summary = dataByRange[range]?.summary;
  const isTrendingUp = summary && summary.percentChange >= 0;

  function handleExport() {
    if (!points.length) return;
    downloadCsv(
      `productivity-trends-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Period", "Total Completed", "Completed On Time", "Overdue"],
      points.map((point) => [point.label, point.completed, point.beforeDeadline, point.overdue]),
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">Productivity Trends</h2>

        <div className="flex items-center gap-2">
          <InsightsExportButton onClick={handleExport} disabled={!points.length} label="Export productivity trends data" />
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

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
        {summary ? (
          <div className="flex shrink-0 items-center justify-end gap-2 pr-20">
            <span className="text-xs font-black text-[#2563EB]">{summary.totalCompleted} Tasks Completed</span>
            <p
              className={`flex items-center gap-1 text-xs font-bold ${
                isTrendingUp ? "text-emerald-600" : "text-red-600"
              }`}
            >
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                {isTrendingUp ? "trending_up" : "trending_down"}
              </span>
              {Math.abs(summary.percentChange)}% from last {range === "month" ? "month" : "week"}
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
        {!error && !points.length ? <p className="mt-4 text-sm text-[#64748B]">Loading productivity trends...</p> : null}
        {points.length ? <LineChart points={points} range={range} /> : null}

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          {SERIES.map((series) => (
            <span key={series.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475569]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
