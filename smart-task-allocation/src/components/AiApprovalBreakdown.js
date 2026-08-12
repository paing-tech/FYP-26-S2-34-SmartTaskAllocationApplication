"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { downloadCsv } from "@/lib/csvExport";
import InsightsExportButton from "@/components/InsightsExportButton";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

// Reads the aiSuggestions summary the allocation-efficiency route computes
// — same field Allocation Preference's acceptance-rate pill reads — now
// scoped to the selected Week/Month range there too, so a stale batch of
// approvals from months back doesn't outweigh how the AI's doing lately.
export default function AiApprovalBreakdown() {
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
        if (!response.ok) throw new Error(result.error || "Could not load AI approval breakdown.");
        if (!cancelled) setDataByRange((current) => ({ ...current, [range]: result.aiSuggestions }));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataByRange, range]);

  const data = dataByRange[range];
  const hasData = data && data.total > 0;

  function handleExport() {
    if (!hasData) return;
    downloadCsv(
      `ai-approval-breakdown-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Outcome", "Count", "Percent"],
      [
        ["Auto-approved", data.autoApproved, `${pct(data.autoApproved, data.total)}%`],
        ["Manager-approved", data.managerApproved, `${pct(data.managerApproved, data.total)}%`],
        ["Dismissed", data.dismissed, `${pct(data.dismissed, data.total)}%`],
      ],
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">AI Approval Breakdown</h2>
        <div className="flex items-center gap-2">
          <InsightsExportButton onClick={handleExport} disabled={!hasData} label="Export AI approval breakdown data" />
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

      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5 py-4">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!error && !data ? <p className="text-sm text-[#52627a]">Loading...</p> : null}
        {!error && data && !hasData ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">No AI suggestions yet.</p>
        ) : null}

        {!error && hasData ? (
          <>
            <div className="flex h-5 w-full overflow-hidden rounded-full border border-slate-300">
              <div className="h-full bg-[#2563EB]" style={{ width: `${pct(data.autoApproved, data.total)}%` }} />
              <div className="h-full bg-[#F59E0B]" style={{ width: `${pct(data.managerApproved, data.total)}%` }} />
              <div className="h-full bg-slate-300" style={{ width: `${pct(data.dismissed, data.total)}%` }} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#475569]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" /> Auto-approved
                </p>
                <p className="mt-1 text-xl font-black text-[#0D1E4C]">{data.autoApproved}</p>
                <p className="text-xs font-semibold text-[#94a3b8]">{pct(data.autoApproved, data.total)}%</p>
              </div>
              <div>
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#475569]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" /> Manager-approved
                </p>
                <p className="mt-1 text-xl font-black text-[#0D1E4C]">{data.managerApproved}</p>
                <p className="text-xs font-semibold text-[#94a3b8]">{pct(data.managerApproved, data.total)}%</p>
              </div>
              <div>
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#475569]">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Dismissed
                </p>
                <p className="mt-1 text-xl font-black text-[#0D1E4C]">{data.dismissed}</p>
                <p className="text-xs font-semibold text-[#94a3b8]">{pct(data.dismissed, data.total)}%</p>
              </div>
            </div>

            <p className="mt-3 text-center text-[10.5px] font-semibold text-[#94a3b8]">
              Of {data.total} AI-suggested task{data.total === 1 ? "" : "s"}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
