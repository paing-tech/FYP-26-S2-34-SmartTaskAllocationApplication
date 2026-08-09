"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { addDays, startOfWeek } from "@/components/WorkspaceCalendar";
import AttendanceChip from "@/components/AttendanceChip";

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Narrower than WorkspaceCalendar's own hour grid — this view shares page
// width with the month calendar + today panel instead of owning the whole page.
const CHIP_HEIGHT = 14;
const DAY_LABEL_WIDTH = 48;

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKeyFor(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The server's `work_date` column defaults to the DB server's own "today",
// which can disagree with the browser's local calendar day near a timezone
// boundary — group by clock_in_at's local date instead of trusting it.
function localDateStrFromIso(isoTimestamp) {
  return toDateStr(new Date(isoTimestamp));
}

function formatHour(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function timeStrToHour(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AttendanceWeekCalendar({ initialDate }) {
  const [weekStart] = useState(() => startOfWeek(initialDate ?? new Date()));
  const [scheduleByDate, setScheduleByDate] = useState({});
  const [attendanceByDate, setAttendanceByDate] = useState({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const loadWeekData = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeaders();
      const months = [...new Set(days.map(monthKeyFor))];
      const [scheduleResponses, attendanceResponses] = await Promise.all([
        Promise.all(months.map((month) => fetch(`/api/attendance/schedule?month=${month}`, { headers }))),
        Promise.all(months.map((month) => fetch(`/api/attendance?month=${month}`, { headers }))),
      ]);

      const nextSchedule = {};
      for (const response of scheduleResponses) {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the schedule.");
        for (const day of result.days ?? []) {
          nextSchedule[day.work_date] = day;
        }
      }
      setScheduleByDate(nextSchedule);

      const nextAttendance = {};
      for (const response of attendanceResponses) {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load attendance history.");
        for (const record of result.records ?? []) {
          const dateStr = localDateStrFromIso(record.clock_in_at);
          const existing = nextAttendance[dateStr];
          if (!existing || new Date(record.clock_in_at) > new Date(existing.clock_in_at)) {
            nextAttendance[dateStr] = record;
          }
        }
      }
      setAttendanceByDate(nextAttendance);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [days]);

  useEffect(() => {
    const timeout = setTimeout(loadWeekData, 0);
    return () => clearTimeout(timeout);
  }, [loadWeekData]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error ? <p className="shrink-0 px-3 pb-1 text-xs font-bold text-red-600">{error}</p> : null}

      <div className="flex shrink-0 bg-gray-100">
        <div style={{ width: DAY_LABEL_WIDTH }} className="shrink-0" aria-hidden="true" />
        <div className="grid flex-1" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className={`truncate border-l border-[#E0E5E9] py-3 text-center text-[9px] font-semibold text-[#98a2b3] ${
                hour === HOURS.length - 1 ? "border-r" : ""
              }`}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const schedule = scheduleByDate[dateStr];
          const attendance = attendanceByDate[dateStr];
          const isToday = isSameDay(day, now);
          const startHour = schedule ? timeStrToHour(schedule.start_time) : null;
          const endHour = schedule ? timeStrToHour(schedule.end_time) : null;

          return (
            <div key={dateStr} className="flex min-h-0 flex-1 border-t border-[#E0E5E9]">
              <div
                style={{ width: DAY_LABEL_WIDTH }}
                className="flex shrink-0 flex-col items-center justify-center gap-0.5 py-1"
              >
                <span className="text-[8px] font-semibold tracking-wide text-[#98a2b3]">
                  {DAY_LABELS[day.getDay()]}
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday ? "bg-[#1E40AF] text-white" : "text-[#1f2937]"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>

              <div className="relative flex-1">
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{ gridTemplateColumns: "repeat(24, 1fr)" }}
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className={`border-l border-[#E0E5E9] ${hour === HOURS.length - 1 ? "border-r" : ""}`}
                    />
                  ))}
                </div>

                {schedule && startHour !== null && endHour !== null && endHour > startHour ? (
                  <div
                    className="absolute z-20"
                    style={{
                      left: `${(startHour / 24) * 100}%`,
                      width: `${((endHour - startHour) / 24) * 100}%`,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <AttendanceChip
                      attendance={attendance}
                      dateStr={dateStr}
                      now={now}
                      schedule={schedule}
                      chipHeight={CHIP_HEIGHT}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
