"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { downloadCsv } from "@/lib/csvExport";
import InsightsExportButton from "@/components/InsightsExportButton";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

const STATUS_STYLES = {
  overloaded: { bar: "bg-[#DC2626]", label: "Overloaded" },
  balanced: { bar: "bg-[#2563EB]", label: "Balanced" },
  underloaded: { bar: "bg-[#94A3B8]", label: "Underloaded" },
};

// Headroom above the taller of (limit, tallest bar) so the Limit line and
// its label never sit flush against the plot's top edge.
const SCALE_HEADROOM = 1.15;

// One page at a time keeps names legible — beyond 5 people the bars would
// have to shrink to the point the names below them become unreadable.
const PAGE_SIZE = 5;

// Matches the bar column's w-22 + the row's gap-3 (both below) — used to
// size the Average/Limit lines to the visible bar cluster instead of the
// full card width.
const BAR_SLOT_PX = 88;
const BAR_GAP_PX = 12;
const LINE_OVERSHOOT_PX = 20;

// A current-state snapshot (not a Week/Month range like the other cards) —
// "who's overloaded right now" is about open work in flight, not a
// historical window.
export default function WorkloadDistribution() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/insights/workload-distribution", { headers: await authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load workload distribution.");
        if (!cancelled) setData(result);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const members = useMemo(() => data?.members ?? [], [data]);
  const average = data?.average ?? 0;
  const limit = data?.limit ?? 0;
  const maxCount = Math.max(0, ...members.map((member) => member.count));
  const scaleMax = Math.max(limit, maxCount, 1) * SCALE_HEADROOM;
  const avgPct = (average / scaleMax) * 80;
  const limitPct = (limit / scaleMax) * 80;

  const pageCount = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const visibleMembers = useMemo(
    () => members.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE),
    [members, clampedPage],
  );

  const lineWidth =
    visibleMembers.length * BAR_SLOT_PX + Math.max(0, visibleMembers.length - 1) * BAR_GAP_PX + LINE_OVERSHOOT_PX * 2;

  function handleExport() {
    if (!members.length) return;
    downloadCsv(
      `workload-distribution-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Active Tasks", "Status"],
      members.map((member) => [member.name, member.count, STATUS_STYLES[member.status].label]),
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">Workload Distribution</h2>
        <InsightsExportButton onClick={handleExport} disabled={!members.length} label="Export workload distribution data" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!error && !data ? <p className="text-sm text-[#52627a]">Loading...</p> : null}
        {!error && data && !members.length ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">No active employees yet.</p>
        ) : null}

        {!error && members.length ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-stretch gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={clampedPage === 0}
                className="flex shrink-0 items-center justify-center text-[#0D1E4C] disabled:opacity-20 hover:scale-120"
                aria-label="Previous employees"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>

              <div className="relative min-h-0 flex-1 pt-11">
                <div
                  className="absolute border-t-2 border-dashed border-[#DC2626]"
                  style={{ bottom: `${limitPct}%`, left: "50%", width: lineWidth, transform: "translateX(-50%)" }}
                >
                  <span className="absolute right-0 -top-5 text-xs font-black text-[#DC2626]">Limit · {limit}</span>
                </div>
                <div
                  className="absolute border-t-2 border-dashed border-[#94A3B8]"
                  style={{ bottom: `${avgPct}%`, left: "50%", width: lineWidth, transform: "translateX(-50%)" }}
                >
                  <span className="absolute right-0 -top-5 text-xs font-black text-[#94A3B8]">
                    Avg · {average.toFixed(1)}
                  </span>
                </div>

                <div className="absolute inset-0 flex items-end justify-center gap-3">
                  {visibleMembers.map((member) => {
                    const style = STATUS_STYLES[member.status];
                    const barPct = Math.max(3, (member.count / scaleMax) * 80);
                    return (
                      <div key={member.userId} className="flex h-full w-22 flex-col items-center justify-end">
                        <div className="relative w-full" style={{ height: `${barPct}%` }}>
                          <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 flex-col items-center">
                            <span className="flex h-5 items-center justify-center">
                              {member.status === "overloaded" ? (
                                <span
                                  className="material-symbols-outlined text-lg text-[#DC2626] [animation:workload-alert-pulse_1.4s_ease-in-out_infinite]"
                                  aria-hidden="true"
                                >
                                  sentiment_stressed
                                </span>
                              ) : null}
                              {member.status === "balanced" ? (
                                <span className="material-symbols-outlined text-lg text-[#2563EB]" aria-hidden="true">
                                  mood
                                </span>
                              ) : null}
                            </span>
                            <span className="text-xs font-black text-[#0D1E4C]">{member.count}</span>
                          </div>
                          <div className={`h-full w-full rounded-t-xl ${style.bar}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={clampedPage >= pageCount - 1}
                className="flex shrink-0 items-center justify-center text-[#0D1E4C] disabled:opacity-20 hover:scale-120"
                aria-label="Next employees"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>

            <div className="mt-1.5 flex justify-center gap-3 px-6">
              {visibleMembers.map((member) => (
                <span
                  key={member.userId}
                  title={member.name}
                  className="w-22 truncate text-center text-xs font-bold text-[#475569]"
                >
                  {member.name}
                </span>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1">
              {Object.entries(STATUS_STYLES).map(([key, style]) => (
                <span key={key} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475569]">
                  <span className={`h-2.5 w-2.5 rounded-full ${style.bar}`} />
                  {style.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
