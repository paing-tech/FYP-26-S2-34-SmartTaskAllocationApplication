"use client";

import { useEffect, useState } from "react";

const DASH_COUNT = 8;

// Compares against clock_in_at (always reliably set) rather than the
// separate work_date column, whose server-side default could disagree with
// the browser's local "today" near a timezone boundary and silently hide a
// just-created record.
function isSameLocalDay(isoTimestamp, reference) {
  if (!isoTimestamp) return false;
  const date = new Date(isoTimestamp);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function formatClockTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatScheduleTime(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "2 hrs 10 mins" — shared format for worked duration, late/overtime, etc.
function formatDurationMinutes(totalMinutesAbs) {
  const hours = Math.floor(totalMinutesAbs / 60);
  const minutes = totalMinutesAbs % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  parts.push(`${minutes} min${minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// "2 hrs 10 mins" — computed straight from the timestamps (ticking live off
// "now" until clocked out) rather than the server's rounded total_hours, so
// it reads exact down to the minute.
function getWorkedDurationLabel(record, now) {
  if (!record?.clock_in_at) return null;
  const endMs = record.clock_out_at ? new Date(record.clock_out_at).getTime() : now.getTime();
  const totalMinutes = Math.max(0, Math.round((endMs - new Date(record.clock_in_at).getTime()) / 60000));
  return formatDurationMinutes(totalMinutes);
}

// The server persists late_minutes/overtime_minutes once, at the moment of
// the clock event — if today's schedule wasn't set yet at that instant (or
// this browser is running before that migration landed), the stored value
// comes back null. Recompute live from the current schedule so it still
// shows correctly instead of silently staying blank.
function computeMinutesAgainstSchedule(timestamp, scheduleTime) {
  if (!timestamp || !scheduleTime) return null;
  const [hours, minutes] = scheduleTime.split(":").map(Number);
  const at = new Date(timestamp);
  const scheduledAt = new Date(at);
  scheduledAt.setHours(hours, minutes, 0, 0);
  return Math.round((at.getTime() - scheduledAt.getTime()) / 60000);
}

// A small word chip ("Late"/"Early"/"Overtime"/"On time") with the duration
// underneath, instead of one combined line of text.
function MinutesCell({ minutes, positiveWord, negativeWord, align }) {
  if (minutes === null || minutes === undefined) return <div />;

  const alignClass = align === "end" ? "items-end" : align === "start" ? "items-start" : "items-center";

  if (minutes === 0) {
    return (
      <div className={`flex self-start flex-col gap-1 ${alignClass}`}>
        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black text-black">On time</span>
      </div>
    );
  }

  const word = minutes > 0 ? positiveWord : negativeWord;

  return (
    <div className={`flex self-start flex-col gap-3 ${alignClass}`}>
      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black text-black">{word}</span>
      <span className="text-xs font-semibold text-[#94a3b8]">{formatDurationMinutes(Math.abs(minutes))}</span>
    </div>
  );
}

// The dashed connector between clock in/out. "active" lights one dash at a
// time (marching) while clocked in but not out yet; "complete" lights the
// whole line once clocked out; "neutral" stays dim/static otherwise.
function Dashes({ mode }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (mode !== "active") return undefined;
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % DASH_COUNT);
    }, 400);
    return () => clearInterval(interval);
  }, [mode]);

  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: DASH_COUNT }).map((_, index) => (
        <span
          key={index}
          className={`h-1 w-4 rounded-full transition-colors duration-300 ${
            mode === "complete"
              ? "bg-emerald-500"
              : mode === "active"
                ? index === activeIndex
                  ? "bg-emerald-500"
                  : "bg-emerald-500/20"
                : "bg-[#0D1E4C]/15"
          }`}
        />
      ))}
    </div>
  );
}

export default function AttendanceTodayPanel({ record, todaySchedule }) {
  const [now, setNow] = useState(() => new Date());
  // `record` is the single most recent attendance row overall, not
  // necessarily today's — only use it here if it actually belongs to
  // today, otherwise a stale prior-day record would misrepresent progress.
  const todaysRecord = isSameLocalDay(record?.clock_in_at, now) ? record : null;
  const isClockedIn = Boolean(todaysRecord && !todaysRecord.clock_out_at);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const workedDuration = getWorkedDurationLabel(todaysRecord, now);
  const lateMinutes =
    todaysRecord?.late_minutes ??
    (todaySchedule ? computeMinutesAgainstSchedule(todaysRecord?.clock_in_at, todaySchedule.start_time) : null);
  const overtimeMinutes =
    todaysRecord?.overtime_minutes ??
    (todaySchedule ? computeMinutesAgainstSchedule(todaysRecord?.clock_out_at, todaySchedule.end_time) : null);

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {todaySchedule || todaysRecord ? (
        <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-3">
          {todaySchedule ? (
            <>
              <span className="text-left text-sm font-bold text-[#0D1E4C]">
                {formatScheduleTime(todaySchedule.start_time)}
              </span>
              <span className="text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Scheduled</span>
              <span className="text-right text-sm font-bold text-[#0D1E4C]">
                {formatScheduleTime(todaySchedule.end_time)}
              </span>

              <div className="col-span-3 h-px w-full bg-[#0D1E4C]/25" />
            </>
          ) : null}

          <span className="text-left text-sm font-bold text-[#0D1E4C]">{formatClockTime(todaysRecord?.clock_in_at)}</span>
          <Dashes mode={!todaysRecord?.clock_in_at ? "neutral" : isClockedIn ? "active" : "complete"} />
          <span className="text-right text-sm font-bold text-[#0D1E4C]">
            {formatClockTime(todaysRecord?.clock_out_at)}
          </span>

          {todaySchedule ? (
            <MinutesCell minutes={lateMinutes} positiveWord="Late" negativeWord="Early" align="start" />
          ) : (
            <span />
          )}
          <p className="self-start text-sm font-black text-[#0D1E4C]">{workedDuration}</p>
          {todaySchedule ? (
            <MinutesCell minutes={overtimeMinutes} positiveWord="Overtime" negativeWord="Early" align="end" />
          ) : (
            <span />
          )}
        </div>
      ) : (
        <p className="text-sm font-semibold text-[#94a3b8]">No schedule for today.</p>
      )}
    </div>
  );
}
