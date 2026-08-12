"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value) {
  return String(value).padStart(2, "0");
}

// The DB's work_date default can disagree with the browser's local calendar
// day — group by clock_in_at's local date instead of trusting that column.
function localDateStrFromIso(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

const BAR_TRACK_HEIGHT = 90; // px

// Attendance rate per month = scheduled days actually clocked into / total
// scheduled days that month — a month with no schedule at all shows 0%
// rather than skewing the average with a divide-by-zero. Late-arrival count
// comes from the same records (late_minutes > 0), shown above each bar.
export default function AttendanceRateChart() {
  const [rates, setRates] = useState(() => Array(12).fill(0));
  const [lateCounts, setLateCounts] = useState(() => Array(12).fill(0));
  // Which months actually had a schedule — the average below only counts
  // these, so months with nothing scheduled (rate forced to 0 above) don't
  // drag a mostly-inactive year down to a misleadingly low number.
  const [scheduledMonths, setScheduledMonths] = useState(() => Array(12).fill(false));
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setError("");
      try {
        const year = new Date().getFullYear();
        const months = Array.from({ length: 12 }, (_, index) => `${year}-${pad(index + 1)}`);
        const headers = await authHeaders();

        const [scheduleResponses, attendanceResponses] = await Promise.all([
          Promise.all(months.map((month) => fetch(`/api/attendance/schedule?month=${month}`, { headers }))),
          Promise.all(months.map((month) => fetch(`/api/attendance?month=${month}`, { headers }))),
        ]);

        const nextRates = [];
        const nextLateCounts = [];
        const nextScheduledMonths = [];

        for (let index = 0; index < months.length; index += 1) {
          const scheduleResult = await scheduleResponses[index].json();
          const attendanceResult = await attendanceResponses[index].json();
          if (!scheduleResponses[index].ok) throw new Error(scheduleResult.error || "Could not load the schedule.");
          if (!attendanceResponses[index].ok) {
            throw new Error(attendanceResult.error || "Could not load attendance history.");
          }

          const scheduledDays = new Set((scheduleResult.days ?? []).map((day) => day.work_date));
          const records = attendanceResult.records ?? [];
          nextScheduledMonths.push(scheduledDays.size > 0);

          if (scheduledDays.size === 0) {
            nextRates.push(0);
          } else {
            const attendedDays = new Set(
              records.filter((record) => record.clock_in_at).map((record) => localDateStrFromIso(record.clock_in_at)),
            );
            let attendedScheduledDays = 0;
            for (const dateStr of scheduledDays) {
              if (attendedDays.has(dateStr)) attendedScheduledDays += 1;
            }
            nextRates.push(Math.min(100, Math.round((attendedScheduledDays / scheduledDays.size) * 100)));
          }

          nextLateCounts.push(records.filter((record) => record.late_minutes > 0).length);
        }

        setRates(nextRates);
        setLateCounts(nextLateCounts);
        setScheduledMonths(nextScheduledMonths);
      } catch (loadError) {
        setError(loadError.message);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const scheduledRates = rates.filter((_, index) => scheduledMonths[index]);
  const averageRate = scheduledRates.length
    ? Math.round(scheduledRates.reduce((sum, rate) => sum + rate, 0) / scheduledRates.length)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-lg font-black text-[#0D1E4C]">Attendance Rate</p>
        {averageRate != null ? (
          <p className="flex items-center gap-1 text-sm font-bold text-[#0D1E4C]">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              bar_chart
            </span>
            Average {averageRate}%
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 items-end justify-between gap-1">
        {MONTH_LABELS.map((label, index) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <p className="h-[10px] text-[8px] font-black text-red-600">
              {lateCounts[index] > 0 ? lateCounts[index] : ""}
            </p>
            <div
              className="flex w-full items-end overflow-hidden rounded-t-sm bg-slate-200/70"
              style={{ height: BAR_TRACK_HEIGHT }}
            >
              <div
                className="flex w-full items-start justify-center rounded-t-sm bg-[#2563EB] pt-0.5 transition-[height] duration-300"
                style={{ height: `${rates[index]}%` }}
              >
                {rates[index] > 0 ? <span className="text-[12px] font-black text-white">{rates[index]}%</span> : null}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
          </div>
        ))}
      </div>
      {error ? <p className="shrink-0 text-[10px] font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
