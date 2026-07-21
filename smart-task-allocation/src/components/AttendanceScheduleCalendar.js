"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const REPEAT_OPTIONS = ["Never", "Daily", "Weekdays", "Weekends", "Weekly", "Monthly", "Custom"];
const TIME_INPUT_CLASS =
  "flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AttendanceScheduleCalendar() {
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [scheduleByDate, setScheduleByDate] = useState({});
  const [attendanceByDate, setAttendanceByDate] = useState({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [dayStartTime, setDayStartTime] = useState("09:00");
  const [dayEndTime, setDayEndTime] = useState("17:00");

  const [fullTimeEnabled, setFullTimeEnabled] = useState(false);
  const [ftStartTime, setFtStartTime] = useState("09:00");
  const [ftEndTime, setFtEndTime] = useState("17:00");
  const [repeatOption, setRepeatOption] = useState("Never");
  const [isRepeatMenuOpen, setIsRepeatMenuOpen] = useState(false);

  const monthStr = `${viewYear}-${pad(viewMonth + 1)}`;

  const loadMonthData = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeaders();
      const [scheduleResponse, attendanceResponse] = await Promise.all([
        fetch(`/api/attendance/schedule?month=${monthStr}`, { headers }),
        fetch(`/api/attendance?month=${monthStr}`, { headers }),
      ]);
      const scheduleResult = await scheduleResponse.json();
      const attendanceResult = await attendanceResponse.json();
      if (!scheduleResponse.ok) throw new Error(scheduleResult.error || "Could not load your schedule.");
      if (!attendanceResponse.ok) throw new Error(attendanceResult.error || "Could not load attendance history.");

      const nextSchedule = {};
      for (const day of scheduleResult.days ?? []) {
        nextSchedule[day.work_date] = day;
      }
      setScheduleByDate(nextSchedule);

      const nextAttendance = {};
      for (const record of attendanceResult.records ?? []) {
        const existing = nextAttendance[record.work_date];
        if (!existing || new Date(record.clock_in_at) > new Date(existing.clock_in_at)) {
          nextAttendance[record.work_date] = record;
        }
      }
      setAttendanceByDate(nextAttendance);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [monthStr]);

  useEffect(() => {
    const timeout = setTimeout(loadMonthData, 0);
    return () => clearTimeout(timeout);
  }, [loadMonthData]);

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((year) => year - 1);
      setViewMonth(11);
    } else {
      setViewMonth((month) => month - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 11) {
      setViewYear((year) => year + 1);
      setViewMonth(0);
    } else {
      setViewMonth((month) => month + 1);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function dotColorFor(dateStr) {
    const record = attendanceByDate[dateStr];
    const scheduled = scheduleByDate[dateStr];

    if (record?.clock_in_at) {
      if (!scheduled) return "bg-emerald-500";
      const [hours, minutes] = scheduled.start_time.split(":").map(Number);
      const scheduledStart = new Date(`${dateStr}T00:00:00`);
      scheduledStart.setHours(hours, minutes, 0, 0);
      const graceMs = 10 * 60 * 1000;
      return new Date(record.clock_in_at).getTime() <= scheduledStart.getTime() + graceMs
        ? "bg-emerald-500"
        : "bg-slate-400";
    }

    if (scheduled && dateStr < todayStr) return "bg-red-500";
    return null;
  }

  function openDayEditor(dateStr) {
    const existing = scheduleByDate[dateStr];
    setDayStartTime(existing?.start_time?.slice(0, 5) ?? "09:00");
    setDayEndTime(existing?.end_time?.slice(0, 5) ?? "17:00");
    setSelectedDate(dateStr);
  }

  async function saveDaySchedule() {
    if (!selectedDate) return;
    setIsSaving(true);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/attendance/schedule", {
        method: "POST",
        headers,
        body: JSON.stringify({ dates: [selectedDate], startTime: dayStartTime, endTime: dayEndTime }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save that day's schedule.");
      setSelectedDate(null);
      await loadMonthData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function clearDaySchedule() {
    if (!selectedDate) return;
    setIsSaving(true);
    try {
      const headers = await authHeaders();
      await fetch(`/api/attendance/schedule?date=${selectedDate}`, { method: "DELETE", headers });
      setSelectedDate(null);
      await loadMonthData();
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setIsSaving(false);
    }
  }

  function datesForRepeatOption() {
    const dates = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = toDateStr(viewYear, viewMonth, day);
      const weekday = new Date(viewYear, viewMonth, day).getDay();
      if (repeatOption === "Daily") dates.push(dateStr);
      else if (repeatOption === "Weekdays" && weekday >= 1 && weekday <= 5) dates.push(dateStr);
      else if (repeatOption === "Weekends" && (weekday === 0 || weekday === 6)) dates.push(dateStr);
      else if (repeatOption === "Weekly" && weekday === today.getDay()) dates.push(dateStr);
      else if (repeatOption === "Monthly" && day === today.getDate()) dates.push(dateStr);
    }
    return dates;
  }

  async function applyFullTime() {
    if (repeatOption === "Custom") return;
    setIsSaving(true);
    setError("");
    try {
      const headers = await authHeaders();

      if (repeatOption === "Never") {
        const datesInView = Object.keys(scheduleByDate).filter((dateStr) => dateStr.startsWith(monthStr));
        await Promise.all(
          datesInView.map((dateStr) => fetch(`/api/attendance/schedule?date=${dateStr}`, { method: "DELETE", headers })),
        );
      } else {
        const dates = datesForRepeatOption();
        if (dates.length) {
          const response = await fetch("/api/attendance/schedule", {
            method: "POST",
            headers,
            body: JSON.stringify({ dates, startTime: ftStartTime, endTime: ftEndTime }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not apply the schedule.");
        }
      }

      await loadMonthData();
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <div className="flex h-8 w-full items-center justify-between gap-3">
          <p className="text-lg font-black text-[#0D1E4C]">Schedule</p>

          <button
            type="button"
            onClick={() => setFullTimeEnabled((current) => !current)}
            className="flex items-center gap-2 rounded-2xl px-1 py-1 text-right"
          >
            <span className="text-sm font-black text-[#0D1E4C]">Full-time</span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                fullTimeEnabled ? "border-[#0D1E4C] bg-[#0D1E4C]" : "border-slate-300 bg-white"
              }`}
            >
              {fullTimeEnabled ? (
                <span className="material-symbols-outlined text-[14px] text-white" aria-hidden="true">
                  check_small
                </span>
              ) : null}
            </span>
            <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
              {fullTimeEnabled ? "keyboard_arrow_up" : "keyboard_arrow_down"}
            </span>
          </button>
        </div>

        {fullTimeEnabled ? (
          <div className="mt-3 space-y-3 rounded-2xl bg-white/70 p-3">
            <div className="flex items-center gap-2">
              <input type="time" value={ftStartTime} onChange={(event) => setFtStartTime(event.target.value)} className={TIME_INPUT_CLASS} />
              <span className="text-sm font-bold text-[#94a3b8]">–</span>
              <input type="time" value={ftEndTime} onChange={(event) => setFtEndTime(event.target.value)} className={TIME_INPUT_CLASS} />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRepeatMenuOpen((current) => !current)}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-bold text-[#0D1E4C]"
              >
                <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                  repeat
                </span>
                <span>Repeat</span>
                <span className="ml-auto text-[#52627a]">{repeatOption}</span>
                <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                  {isRepeatMenuOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                </span>
              </button>

              {isRepeatMenuOpen ? (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {REPEAT_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => {
                        setRepeatOption(option);
                        setIsRepeatMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#0D1E4C] transition hover:bg-slate-50"
                    >
                      <span className="flex w-4 items-center justify-center">
                        {option === repeatOption ? (
                          <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
                            check
                          </span>
                        ) : null}
                      </span>
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={applyFullTime}
              disabled={isSaving || repeatOption === "Custom"}
              className="w-full rounded-full bg-[#0D1E4C] py-2 text-sm font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {repeatOption === "Never" ? "Clear this month" : "Apply"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex h-8 items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/70"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            chevron_left
          </span>
        </button>
        <p className="text-sm font-black text-[#0D1E4C]">{monthLabel(viewYear, viewMonth)}</p>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/70"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>

      <div className="grid h-6 grid-cols-7 items-center gap-1 text-center text-[11px] font-black text-[#94a3b8]">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-1 grid flex-1 grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} />;
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const dot = dotColorFor(dateStr);
          const isToday = dateStr === todayStr;

          return (
            <button
              type="button"
              key={dateStr}
              onClick={() => openDayEditor(dateStr)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-bold transition hover:bg-white/70 ${
                isToday ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C]"
              }`}
            >
              <span>{day}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${dot ?? ""}`} />
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-xs font-bold text-red-600">{error}</p> : null}

      {selectedDate ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedDate(null)}
        >
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-black text-[#0D1E4C]">{selectedDate}</p>
            <div className="mt-3 flex items-center gap-2">
              <input type="time" value={dayStartTime} onChange={(event) => setDayStartTime(event.target.value)} className={TIME_INPUT_CLASS} />
              <span className="text-sm font-bold text-[#94a3b8]">–</span>
              <input type="time" value={dayEndTime} onChange={(event) => setDayEndTime(event.target.value)} className={TIME_INPUT_CLASS} />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={clearDaySchedule}
                disabled={isSaving}
                className="flex-1 rounded-full border border-slate-200 py-2 text-sm font-bold text-[#52627a] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={saveDaySchedule}
                disabled={isSaving}
                className="flex-1 rounded-full bg-[#0D1E4C] py-2 text-sm font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
