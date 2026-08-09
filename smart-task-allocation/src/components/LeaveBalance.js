"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const LEAVE_TYPES = [
  { key: "annual", label: "Annual Leave", icon: "trip" },
  { key: "sick", label: "Sick Leave", icon: "health_cross" },
];

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function LeaveBalance() {
  const [totals, setTotals] = useState({ annual: 16, sick: 14 });
  const [used, setUsed] = useState({ annual: 0, sick: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setError("");
      try {
        const headers = await authHeaders();
        const [policyResponse, requestsResponse] = await Promise.all([
          fetch("/api/organization-leave-policy", { headers }),
          fetch("/api/leave-requests", { headers }),
        ]);
        const policyResult = await policyResponse.json();
        const requestsResult = await requestsResponse.json();
        if (!policyResponse.ok) throw new Error(policyResult.error || "Could not load the leave policy.");
        if (!requestsResponse.ok) throw new Error(requestsResult.error || "Could not load leave requests.");

        setTotals({
          annual: policyResult.annualLeaveTotal ?? 16,
          sick: policyResult.sickLeaveTotal ?? 14,
        });

        const currentYear = new Date().getFullYear();
        const nextUsed = { annual: 0, sick: 0 };
        for (const record of requestsResult.requests ?? []) {
          const type = record.leave_type === "sick" ? "sick" : "annual";
          const daysThisYear = (record.dates ?? []).filter(
            (dateStr) => new Date(dateStr).getFullYear() === currentYear,
          ).length;
          nextUsed[type] += daysThisYear;
        }
        setUsed(nextUsed);
      } catch (loadError) {
        setError(loadError.message);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <p className="text-lg font-black text-[#0D1E4C]">Leave Balance</p>

      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}

      <div className="mt-1 space-y-4">
        {LEAVE_TYPES.map((type) => {
          const total = totals[type.key];
          const usedDays = Math.min(used[type.key], total);
          const remainingDays = Math.max(0, total - usedDays);
          const pct = total ? Math.min(100, (remainingDays / total) * 100) : 0;

          return (
            <div key={type.key}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-bold text-[#0D1E4C]">
                  <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                    {type.icon}
                  </span>
                  {type.label}
                </p>
                <p className="shrink-0 text-xs font-black text-[#94a3b8]">
                  {remainingDays} / {total} days
                </p>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-[#0D1E4C]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
