"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import Portal from "@/components/Portal";
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const TIME_INPUT_CLASS =
  "flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

// The server's `work_date` column defaults to the DB server's own "today",
// which can disagree with the browser's local calendar day near a timezone
// boundary — group by clock_in_at's local date instead of trusting it.
function localDateStrFromIso(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return toDateStr(date.getFullYear(), date.getMonth(), date.getDate());
}

// All dates from `startDateStr` through `untilDateStr` (inclusive) whose
// weekday is in `weekdaySet` — falls back to just the start date when repeat
// isn't actually configured (no end date, or no weekdays picked).
function computeRepeatDates(startDateStr, untilDateStr, weekdaySet) {
  if (!untilDateStr || weekdaySet.size === 0) return [startDateStr];

  const start = new Date(`${startDateStr}T00:00:00`);
  const until = new Date(`${untilDateStr}T00:00:00`);
  if (until < start) return [startDateStr];

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= until) {
    if (weekdaySet.has(cursor.getDay())) {
      dates.push(toDateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates.length ? dates : [startDateStr];
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatSelectedDate(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

async function rawAuthHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AttendanceScheduleCalendar({ onDateSelect, onLeaveRequestCreated } = {}) {
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

  const [isRepeatOpen, setIsRepeatOpen] = useState(false);
  const [repeatWeekdays, setRepeatWeekdays] = useState(new Set());
  const [repeatUntil, setRepeatUntil] = useState("");

  const [isLeaveFormOpen, setIsLeaveFormOpen] = useState(false);
  const [leaveDescription, setLeaveDescription] = useState("");
  const [leaveCertificateFile, setLeaveCertificateFile] = useState(null);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const leaveFileInputRef = useRef(null);

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
        const dateStr = localDateStrFromIso(record.clock_in_at);
        const existing = nextAttendance[dateStr];
        if (!existing || new Date(record.clock_in_at) > new Date(existing.clock_in_at)) {
          nextAttendance[dateStr] = record;
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

  // The month view has the only prev/next controls on the page — paging it
  // also moves the week calendar on the right over to match, landing on the
  // 1st of whichever month comes into view.
  function goPrevMonth() {
    const nextYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const nextMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    setViewYear(nextYear);
    setViewMonth(nextMonth);
    onDateSelect?.(toDateStr(nextYear, nextMonth, 1));
  }

  function goNextMonth() {
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    setViewYear(nextYear);
    setViewMonth(nextMonth);
    onDateSelect?.(toDateStr(nextYear, nextMonth, 1));
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  // Always pad out to a full 6 rows (42 cells) — otherwise a 4- or 5-row
  // month makes the grid shorter, and the Clock in button below (pinned to
  // the bottom of a sibling flex column) shifts position when paging months.
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length < 42) cells.push(null);

  // blue = scheduled, not clocked in yet · green = clocked in · red = absent
  // (scheduled day already passed with no clock-in).
  function dotColorFor(dateStr) {
    const record = attendanceByDate[dateStr];
    const scheduled = scheduleByDate[dateStr];

    if (record?.clock_in_at) return "bg-emerald-500";
    if (scheduled && dateStr < todayStr) return "bg-red-500";
    if (scheduled) return "bg-blue-500";
    return null;
  }

  function openDayEditor(dateStr) {
    const existing = scheduleByDate[dateStr];
    setDayStartTime(existing?.start_time?.slice(0, 5) ?? "09:00");
    setDayEndTime(existing?.end_time?.slice(0, 5) ?? "17:00");
    setSelectedDate(dateStr);
    setIsRepeatOpen(false);
    setRepeatWeekdays(new Set([new Date(`${dateStr}T00:00:00`).getDay()]));
    setRepeatUntil("");
    onDateSelect?.(dateStr);
  }

  function closeDayEditor() {
    setSelectedDate(null);
    setIsLeaveFormOpen(false);
    setLeaveDescription("");
    setLeaveCertificateFile(null);
    setLeaveError("");
  }

  function handleLeaveFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setLeaveCertificateFile(file);
  }

  function toggleRepeatWeekday(dayIndex) {
    setRepeatWeekdays((current) => {
      const next = new Set(current);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  }

  async function submitLeaveRequest() {
    if (!selectedDate) return;
    setIsSubmittingLeave(true);
    setLeaveError("");
    try {
      const formData = new FormData();
      formData.append("dates", JSON.stringify([selectedDate]));
      formData.append("description", leaveDescription);
      if (leaveCertificateFile) formData.append("certificate", leaveCertificateFile);

      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: await rawAuthHeaders(),
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your leave request.");

      onLeaveRequestCreated?.(result.request);
      closeDayEditor();
    } catch (submitError) {
      setLeaveError(submitError.message);
    } finally {
      setIsSubmittingLeave(false);
    }
  }

  async function saveDaySchedule() {
    if (!selectedDate) return;
    setIsSaving(true);
    try {
      const headers = await authHeaders();
      const dates = isRepeatOpen ? computeRepeatDates(selectedDate, repeatUntil, repeatWeekdays) : [selectedDate];
      const response = await fetch("/api/attendance/schedule", {
        method: "POST",
        headers,
        body: JSON.stringify({ dates, startTime: dayStartTime, endTime: dayEndTime }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save that day's schedule.");
      onDateSelect?.(selectedDate);
      closeDayEditor();
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
      onDateSelect?.(selectedDate);
      closeDayEditor();
      await loadMonthData();
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col">
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
          // Every cell — real or blank trailing filler — gets the same
          // fixed height, otherwise a content-less blank row collapses and
          // 5-row months render shorter than 6-row ones (see the padding
          // above: cells is always padded to 42, but grid rows are only
          // as tall as their content unless every cell shares a height).
          if (!day) return <div key={`blank-${index}`} className="h-13" aria-hidden="true" />;
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const dot = dotColorFor(dateStr);
          const isToday = dateStr === todayStr;

          return (
            <button
              type="button"
              key={dateStr}
              onClick={() => openDayEditor(dateStr)}
              className={`flex h-13 flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold transition ${
                isToday ? "bg-[#1E40AF] text-white hover:bg-[#1a3696]" : "text-[#0D1E4C] hover:bg-white/70"
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
        <Portal>
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" onClick={closeDayEditor}>
          <div
            className="relative w-full max-w-xs rounded-3xl bg-white/40 backdrop-blur-sm p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeDayEditor}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#94a3b8] transition hover:scale-110 hover:bg-slate-100 hover:text-[#0D1E4C]"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>

            <p className="text-center text-sm font-black text-[#0D1E4C]">{formatSelectedDate(selectedDate)}</p>

            <div className="mt-3 flex items-center gap-2">
              <input type="time" value={dayStartTime} onChange={(event) => setDayStartTime(event.target.value)} className={TIME_INPUT_CLASS} />
              <span className="text-sm font-bold text-[#94a3b8]">–</span>
              <input type="time" value={dayEndTime} onChange={(event) => setDayEndTime(event.target.value)} className={TIME_INPUT_CLASS} />
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setIsRepeatOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-full px-1 py-1 text-left"
              >
                <span className="text-sm font-black text-[#0D1E4C]">Repeat</span>
                <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                  {isRepeatOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                </span>
              </button>

              {isRepeatOpen ? (
                <div className="mt-2 space-y-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex justify-between gap-1">
                    {WEEKDAY_LABELS.map((label, dayIndex) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleRepeatWeekday(dayIndex)}
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                          repeatWeekdays.has(dayIndex)
                            ? "bg-[#0D1E4C] text-white"
                            : "border border-slate-200 bg-white text-[#0D1E4C] hover:bg-slate-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wide text-[#94a3b8]">Repeat until</span>
                    <input
                      type="date"
                      value={repeatUntil}
                      min={selectedDate}
                      onChange={(event) => setRepeatUntil(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]"
                    />
                  </label>
                </div>
              ) : null}
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
                Schedule
              </button>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsLeaveFormOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-full px-1 py-1 text-left"
              >
                <span className="text-sm font-black text-[#0D1E4C]">Request Leave</span>
                <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                  {isLeaveFormOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                </span>
              </button>

              {isLeaveFormOpen ? (
                <div className="mt-2 space-y-3 rounded-2xl bg-slate-50 p-3">
                  <textarea
                    value={leaveDescription}
                    onChange={(event) => setLeaveDescription(event.target.value)}
                    placeholder="Reason for leave"
                    rows={2}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]"
                  />

                  <button
                    type="button"
                    onClick={() => leaveFileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-bold text-[#0D1E4C] transition hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      attach_file
                    </span>
                    {leaveCertificateFile ? leaveCertificateFile.name : "Medical Certificate"}
                  </button>
                  <input
                    ref={leaveFileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf"
                    className="hidden"
                    onChange={handleLeaveFileChange}
                  />
                  {leaveError ? <p className="text-xs font-bold text-red-600">{leaveError}</p> : null}

                  <button
                    type="button"
                    onClick={submitLeaveRequest}
                    disabled={isSubmittingLeave}
                    className="w-full rounded-full bg-[#0D1E4C] py-2.5 text-sm font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmittingLeave ? "Submitting…" : "Submit"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        </Portal>
      ) : null}
    </div>
  );
}
