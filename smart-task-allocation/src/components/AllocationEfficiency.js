"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

// "2d 4h" / "3h 20m" / "45m" — compact enough to sit above a bar.
function formatMinutes(totalMinutes) {
  if (totalMinutes == null) return "—";
  const minutes = Math.round(totalMinutes);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
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

const CHART_METRICS = [
  { key: "averageMinutesToAssign", label: "Allocation Time", type: "time" },
  { key: "firstTimeAccuracy", label: "Allocation Accuracy", type: "percent" },
  { key: "skillMatchRate", label: "Skill Match Rate", type: "percent" },
];

// Percentage metrics chart at their real value. The time metric can't share
// that 0-100% scale honestly (it's a duration, not a ratio) — instead the
// faster side gets full height and the other is scaled relative to it, so
// the bars still read as "who's ahead," while the actual duration is shown
// as the label above each bar rather than a made-up percentage.
function getBarHeights(metric, ai, manual) {
  const aiValue = ai[metric.key];
  const manualValue = manual[metric.key];

  if (metric.type === "percent") {
    return {
      aiHeight: aiValue == null ? 0 : Math.min(100, Math.max(2, Math.round(aiValue * 100))),
      manualHeight: manualValue == null ? 0 : Math.min(100, Math.max(2, Math.round(manualValue * 100))),
      aiLabel: formatPercent(aiValue),
      manualLabel: formatPercent(manualValue),
    };
  }

  if (aiValue == null || manualValue == null) {
    return {
      aiHeight: aiValue != null ? 100 : 0,
      manualHeight: manualValue != null ? 100 : 0,
      aiLabel: formatMinutes(aiValue),
      manualLabel: formatMinutes(manualValue),
    };
  }

  const fastest = Math.min(aiValue, manualValue);
  const heightFor = (value) => {
    if (fastest <= 0) return value <= 0 ? 100 : 4;
    return Math.min(100, Math.max(4, Math.round((fastest / value) * 100)));
  };

  return {
    aiHeight: heightFor(aiValue),
    manualHeight: heightFor(manualValue),
    aiLabel: formatMinutes(aiValue),
    manualLabel: formatMinutes(manualValue),
  };
}

function ChartBar({ heightPct, label, colorClass }) {
  return (
    <div className="flex h-full w-18 items-end justify-center">
      <div className={`relative w-full rounded-t-lg ${colorClass}`} style={{ height: `${heightPct}%` }}>
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black text-[#0D1E4C]">
          {label}
        </span>
      </div>
    </div>
  );
}

// Each group is 2 bars (w-18) + the gap between them (gap-2) = 152px = w-38,
// and the label row below reuses that exact width and the same gap-12
// between groups, so each category label centers under its own bar pair
// instead of drifting as the rows accumulate different gaps.
function BarChart({ ai, manual }) {
  const groups = CHART_METRICS.map((metric) => ({ metric, heights: getBarHeights(metric, ai, manual) }));

  return (
    <div className="pt-5">
      <div className="flex h-40 items-end justify-center gap-12">
        {groups.map(({ metric, heights }) => (
          <div key={metric.key} className="flex h-full items-end gap-2">
            <ChartBar heightPct={heights.aiHeight} label={heights.aiLabel} colorClass="bg-[#2563EB]" />
            <ChartBar heightPct={heights.manualHeight} label={heights.manualLabel} colorClass="bg-violet-300" />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-12 pt-1.5">
        {groups.map(({ metric }) => (
          <p key={metric.key} className="w-38 text-center text-xs font-bold text-[#475569]">
            {metric.label}
          </p>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" /> Smart Task Allocation
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-300" /> Manual Task Allocation
        </span>
      </div>
    </div>
  );
}

// Raw AI-vs-manual counts, separate from the ratio metrics above — kept
// simple (just numbers, no chart) so this reads as ground-truth volume
// rather than another comparison, and can feed a daily "reliance on AI"
// trend later without redoing the underlying counts.
function RelianceCounts({ ai, manual, taskSource }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] font-semibold text-[#94a3b8]">
      <span>
        Assigned: <span className="font-black text-[#0D1E4C]">{ai.taskCount}</span> AI ·{" "}
        <span className="font-black text-[#0D1E4C]">{manual.taskCount}</span> Manual
      </span>
      <span>
        Created: <span className="font-black text-[#0D1E4C]">{taskSource.aiCreated}</span> AI ·{" "}
        <span className="font-black text-[#0D1E4C]">{taskSource.manualCreated}</span> Manual
      </span>
    </div>
  );
}

function AiSuggestionSentence({ aiSuggestions }) {
  if (!aiSuggestions?.total) {
    return (
      <p className="text-left text-xs font-semibold text-[#94a3b8]">
        No tasks created by Optimus AI or the chat agent yet.
      </p>
    );
  }

  // Combined share of AI/agent-created tasks a human either approved or the
  // agent auto-approved — i.e. everything except the dismissed ones.
  const acceptanceRate = (aiSuggestions.managerApprovedRate ?? 0) + (aiSuggestions.autoApprovedRate ?? 0);

  return (
    <p className="text-center text-xs font-bold text-slate-500">
      AI Suggestion Acceptance Rate: <span className="text-[#2563EB]">{formatPercent(acceptanceRate)}</span>
    </p>
  );
}

export default function AllocationEfficiency() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setError("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/insights/allocation-efficiency", { headers: await authHeaders() });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load allocation efficiency.");
        }

        setData(result);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const hasData = data && (data.ai.taskCount || data.manual.taskCount);
  const headline = data ? getHeadline(data.ai, data.manual) : null;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm">
      <h2 className="shrink-0 px-5 py-3 text-lg font-black text-[#0D1E4C]">Allocation Efficiency</h2>

      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading allocation efficiency...</p> : null}

        {!isLoading && !error && !hasData ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">
            No assigned tasks yet to compare.
          </p>
        ) : null}

        {!isLoading && !error && hasData ? (
          <div className="space-y-3">
            {headline ? (
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="rounded-full bg-gradient-to-r from-[#2563EB] to-violet-400 px-4 py-1.5 text-sm font-black text-white">
                  Smart Task Allocation is {headline}
                </span>
                <p className="text-xs font-medium text-[#64748B]">Compared with Manual Task Allocation</p>
              </div>
            ) : null}

            <BarChart ai={data.ai} manual={data.manual} />

            {data.ai.excludedOutlierCount + data.manual.excludedOutlierCount > 0 ? (
              <p className="text-center text-[10px] font-medium text-[#94a3b8]">
                Allocation Time excludes {data.ai.excludedOutlierCount + data.manual.excludedOutlierCount} task
                {data.ai.excludedOutlierCount + data.manual.excludedOutlierCount === 1 ? "" : "s"} left unassigned
                over 1h.
              </p>
            ) : null}

            <RelianceCounts ai={data.ai} manual={data.manual} taskSource={data.taskSource} />

            <AiSuggestionSentence aiSuggestions={data.aiSuggestions} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
