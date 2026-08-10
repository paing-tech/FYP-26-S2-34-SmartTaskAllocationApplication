"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { addDays, startOfWeek } from "@/components/WorkspaceCalendar";

const RADIUS = 36;
const STROKE_WIDTH = 16; // thick relative to RADIUS so the donut's inner hole stays small
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONUT_SIZE = 68; // px

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKeyFor(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// The DB's work_date default can disagree with the browser's local calendar
// day — group by clock_in_at's local date instead of trusting that column.
function localDateStrFromIso(isoTimestamp) {
  return toDateStr(new Date(isoTimestamp));
}

function hoursForRecord(record, now) {
  const endMs = record.clock_out_at ? new Date(record.clock_out_at).getTime() : now.getTime();
  return Math.max(0, (endMs - new Date(record.clock_in_at).getTime()) / 3600000);
}

// Hours are tracked in half-hour increments only — a partial hour of 15
// minutes or more rounds up to the next half hour, anything less rounds down.
function toHalfHours(totalHours) {
  const wholeHours = Math.floor(totalHours);
  const remainderMinutes = Math.round((totalHours - wholeHours) * 60);
  return wholeHours + (remainderMinutes >= 15 ? 0.5 : 0);
}

// "32.5h" / "32h" — hour-only, no minutes.
function formatHours(totalHours) {
  const rounded = toHalfHours(totalHours);
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

// A progress ring with the hour count centered — used for week/month, which
// have a real capacity (the admin-set weekly limit, or 4x it for the month)
// to progress against.
function HourDonut({ label, hours, maxHours, isOverLimit }) {
  const progress = maxHours > 0 ? Math.min(1, hours / maxHours) : 0;
  const ringColor = isOverLimit ? "#B91C1C" : "#2563EB";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 100" style={{ height: DONUT_SIZE, width: DONUT_SIZE }}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth={STROKE_WIDTH} />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease" }}
        />
        <text x="50" y="56" textAnchor="middle" fontSize="17" fontWeight="900" fill="#0D1E4C">
          {formatHours(hours)}
        </text>
      </svg>
      <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
    </div>
  );
}

// A plain filled circle (no progress ring — overtime has no target to
// progress toward) with the overtime hour count centered.
function OvertimeCircle({ hours }) {
  const hasOvertime = hours > 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex items-center justify-center rounded-full ${hasOvertime ? "bg-amber-500" : "bg-slate-200"}`}
        style={{ height: DONUT_SIZE, width: DONUT_SIZE }}
      >
        <span className={`text-sm font-black ${hasOvertime ? "text-white" : "text-[#94a3b8]"}`}>
          {formatHours(hours)}
        </span>
      </div>
      <p className="text-[10px] font-bold text-[#94a3b8]">Overtime</p>
    </div>
  );
}

// `focusedDate` is the same date driving AttendanceWeekCalendar — passing it
// through keeps "this week"/"this month" in sync with whatever week/month
// the calendar on the right is currently showing, instead of always "now".
export default function AttendanceWorkHours({ focusedDate }) {
  const [weeklyHourLimit, setWeeklyHourLimit] = useState(40);
  const [weekHours, setWeekHours] = useState(0);
  const [monthHours, setMonthHours] = useState(0);
  const [monthOvertimeMinutes, setMonthOvertimeMinutes] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setError("");
      try {
        const now = new Date();
        const reference = focusedDate ?? now;
        const weekStart = startOfWeek(reference);
        const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
        const referenceMonthKey = monthKeyFor(reference);
        const months = [...new Set([...weekDays.map(monthKeyFor), referenceMonthKey])];

        const headers = await authHeaders();
        const [policyResponse, ...attendanceResponses] = await Promise.all([
          fetch("/api/organization-work-policy", { headers }),
          ...months.map((month) => fetch(`/api/attendance?month=${month}`, { headers })),
        ]);

        const policyResult = await policyResponse.json();
        if (!policyResponse.ok) throw new Error(policyResult.error || "Could not load the work policy.");

        const weekDateStrs = new Set(weekDays.map(toDateStr));
        let nextWeekHours = 0;
        let nextMonthHours = 0;
        let nextMonthOvertimeMinutes = 0;

        for (const response of attendanceResponses) {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not load attendance history.");
          for (const record of result.records ?? []) {
            if (!record.clock_in_at) continue;
            const dateStr = localDateStrFromIso(record.clock_in_at);
            const hours = hoursForRecord(record, now);

            if (weekDateStrs.has(dateStr)) nextWeekHours += hours;
            if (monthKeyFor(new Date(record.clock_in_at)) === referenceMonthKey) {
              nextMonthHours += hours;
              if (record.overtime_minutes > 0) nextMonthOvertimeMinutes += record.overtime_minutes;
            }
          }
        }

        setWeeklyHourLimit(policyResult.weeklyHourLimit ?? 40);
        setWeekHours(nextWeekHours);
        setMonthHours(nextMonthHours);
        setMonthOvertimeMinutes(nextMonthOvertimeMinutes);
      } catch (loadError) {
        setError(loadError.message);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [focusedDate]);

  const monthlyHourLimit = weeklyHourLimit * 4;

  return (
    <div>
      <p className="text-lg font-black text-[#0D1E4C]">Work Hours</p>
      <div className="mt-4 flex items-start justify-around">
        <HourDonut
          label="This week"
          hours={weekHours}
          maxHours={weeklyHourLimit}
          isOverLimit={weeklyHourLimit > 0 && weekHours >= weeklyHourLimit}
        />
        <HourDonut
          label="This month"
          hours={monthHours}
          maxHours={monthlyHourLimit}
          isOverLimit={monthlyHourLimit > 0 && monthHours >= monthlyHourLimit}
        />
        <OvertimeCircle hours={monthOvertimeMinutes / 60} />
      </div>
      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
