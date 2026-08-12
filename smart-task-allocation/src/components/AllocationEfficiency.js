"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { downloadCsv } from "@/lib/csvExport";
import InsightsExportButton from "@/components/InsightsExportButton";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

// "2d 4h" / "3h 20m" / "45 mins" — compact enough to sit above a bar.
function formatMinutes(totalMinutes) {
  if (totalMinutes == null) return "—";
  const minutes = Math.round(totalMinutes);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins} min${mins === 1 ? "" : "s"}`;
}

function formatPercent(ratio) {
  if (ratio == null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

// The one number the card leads with — how much more efficient Smart
// Allocation is at finding an assignee, since that's the most direct
// signal we have real data for. Clamped to [0, 100] so a near-zero average
// on either side (a tiny sample, or a same-instant outlier) can't blow the
// ratio up into a meaningless four-digit percentage — if manual actually
// comes out ahead in the sample, that reads as 0% rather than a negative
// number. Falls back to an allocation-accuracy comparison when either
// bucket has no timing data yet.
function getHeadline(ai, manual) {
  if (ai.averageMinutesToAssign != null && manual.averageMinutesToAssign != null && manual.averageMinutesToAssign > 0) {
    const ratio = Math.max(0, ai.averageMinutesToAssign) / manual.averageMinutesToAssign;
    const pct = Math.round(Math.max(0, Math.min(100, (1 - ratio) * 100)));
    return `${pct}% more efficient`;
  }

  if (ai.firstTimeAccuracy != null && manual.firstTimeAccuracy != null) {
    const pct = Math.round(Math.max(0, Math.min(100, (ai.firstTimeAccuracy - manual.firstTimeAccuracy) * 100)));
    return `${pct}% more accurate`;
  }

  return null;
}

// Shared horizontal bar row — length is directly proportional to the value
// (never inverted), so a longer bar always means a bigger number. Used by
// every metric on this card (Allocation Time, Allocation Accuracy, Skill
// Match Rate) so the whole card reads as one consistent visual system
// instead of mixing a vertical "taller = better" chart with a horizontal
// one. No per-row label — color alone (blue = Smart, amber = Manual) is
// already the convention everywhere else on this card, so a repeated label
// on every row would just be a third layer of the same information.
function MetricBar({ widthPct, displayValue, colorClass }) {
  return (
    <div className="mx-auto flex w-[90%] items-center justify-start gap-2">
      <div className="h-5 w-[90%] overflow-hidden rounded-full border border-slate-300 bg-white/40">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="shrink-0 text-left text-xs font-black text-[#0D1E4C]">{displayValue}</span>
    </div>
  );
}

function MetricBlock({ title, subtitle, children }) {
  return (
    <div>
      <div className="flex flex-col items-center justify-center">
        <p className="text-sm font-bold text-[#475569]">{title}</p>
        {subtitle ? <p className="text-[10px] font-semibold text-[#94a3b8]">{subtitle}</p> : null}
      </div>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

// Allocation Time is a duration, not a ratio, so it can't share a 0-100%
// width scale honestly — instead the faster side gets full bar width and
// the other is scaled relative to it, while the real duration (not a made-up
// percentage) is still shown as the value on the right.
function AllocationTimeBlock({ ai, manual }) {
  const aiMinutes = ai.averageMinutesToAssign;
  const manualMinutes = manual.averageMinutesToAssign;

  if (aiMinutes == null && manualMinutes == null) return null;

  const maxMinutes = Math.max(aiMinutes ?? 0, manualMinutes ?? 0, 1);
  const widthFor = (minutes) =>
    minutes == null || maxMinutes <= 0 ? 0 : Math.max(2, Math.round((minutes / maxMinutes) * 100));

  return (
    <MetricBlock title="Allocation Time" subtitle="(lower is better)">
      <MetricBar
        widthPct={widthFor(aiMinutes)}
        displayValue={formatMinutes(aiMinutes)}
        colorClass="bg-[#2563EB]"
      />
      <MetricBar
        widthPct={widthFor(manualMinutes)}
        displayValue={formatMinutes(manualMinutes)}
        colorClass="bg-[#F59E0B]"
      />
    </MetricBlock>
  );
}

// Percentage metrics chart at their real value — bar width is just the
// percentage itself, no relative scaling needed.
function PercentMetricBlock({ title, metricKey, ai, manual }) {
  const aiValue = ai[metricKey];
  const manualValue = manual[metricKey];
  const widthFor = (value) => (value == null ? 0 : Math.min(100, Math.max(2, Math.round(value * 100))));

  return (
    <MetricBlock title={title}>
      <MetricBar
        widthPct={widthFor(aiValue)}
        displayValue={formatPercent(aiValue)}
        colorClass="bg-[#2563EB]"
      />
      <MetricBar
        widthPct={widthFor(manualValue)}
        displayValue={formatPercent(manualValue)}
        colorClass="bg-[#F59E0B]"
      />
    </MetricBlock>
  );
}

export default function AllocationEfficiency() {
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

        if (!response.ok) {
          throw new Error(result.error || "Could not load allocation efficiency.");
        }

        if (!cancelled) setDataByRange((current) => ({ ...current, [range]: result }));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataByRange, range]);

  const data = dataByRange[range];
  const isLoading = !error && !data;
  const hasData = data && (data.ai.taskCount || data.manual.taskCount);
  const headline = data ? getHeadline(data.ai, data.manual) : null;

  function handleExport() {
    if (!hasData) return;
    downloadCsv(`allocation-efficiency-${range}-${new Date().toISOString().slice(0, 10)}.csv`, ["Metric", "Smart", "Manual"], [
      ["Allocation Time", formatMinutes(data.ai.averageMinutesToAssign), formatMinutes(data.manual.averageMinutesToAssign)],
      ["Allocation Accuracy", formatPercent(data.ai.firstTimeAccuracy), formatPercent(data.manual.firstTimeAccuracy)],
      ["Skill Match Rate", formatPercent(data.ai.skillMatchRate), formatPercent(data.manual.skillMatchRate)],
    ]);
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">Allocation Efficiency</h2>
        <div className="flex items-center gap-2">
          <InsightsExportButton onClick={handleExport} disabled={!hasData} label="Export allocation efficiency data" />
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

      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading allocation efficiency...</p> : null}

        {!isLoading && !error && !hasData ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">
            No assigned tasks yet to compare.
          </p>
        ) : null}

        {!isLoading && !error && hasData ? (
          <div className="space-y-2">
            {headline ? (
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="rounded-full bg-gradient-to-r from-[#2563EB] to-[#F59E0B] px-4 py-1.5 text-sm font-black text-white">
                  Smart Task Allocation is {headline}
                </span>
                <p className="text-xs font-medium text-[#64748B]">Compared with Manual Task Allocation</p>
              </div>
            ) : null}

            <div className="space-y-4">
              <AllocationTimeBlock ai={data.ai} manual={data.manual} />
              <PercentMetricBlock title="Allocation Accuracy" metricKey="firstTimeAccuracy" ai={data.ai} manual={data.manual} />
              <PercentMetricBlock title="Skill Match Rate" metricKey="skillMatchRate" ai={data.ai} manual={data.manual} />
            </div>

            <div className="flex items-center justify-center gap-5 mt-4">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#475569]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" /> Smart Task Allocation
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#475569]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" /> Manual Task Allocation
              </span>
            </div>

            {data.ai.excludedOutlierCount + data.manual.excludedOutlierCount > 0 ? (
              <p className="text-center text-[10px] font-medium text-[#94a3b8]">
                Allocation Time excludes {data.ai.excludedOutlierCount + data.manual.excludedOutlierCount} task
                {data.ai.excludedOutlierCount + data.manual.excludedOutlierCount === 1 ? "" : "s"} left unassigned
                over 1h.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
