"use client";

import { useEffect, useState } from "react";

const DASH_COUNT = 5;

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

function statusChip(record, todaySchedule) {
  if (!record?.clock_in_at) {
    return { label: "Not clocked in", tone: "neutral" };
  }
  if (!todaySchedule) {
    return { label: "Clocked in", tone: "neutral" };
  }
  const [hours, minutes] = todaySchedule.start_time.split(":").map(Number);
  const scheduledStart = new Date(record.clock_in_at);
  scheduledStart.setHours(hours, minutes, 0, 0);
  const graceMs = 10 * 60 * 1000;
  const isEarly = new Date(record.clock_in_at).getTime() <= scheduledStart.getTime() + graceMs;
  return isEarly ? { label: "Early", tone: "success" } : { label: "Late", tone: "warning" };
}

// A plain solid connector — used between the scheduled start/end times.
function SolidLine() {
  return <div className="h-px w-full bg-[#0D1E4C]/15" />;
}

// The connector between the clock in/out values. "active" marches one dash
// at a time (half a second apart) while the user is clocked in but hasn't
// clocked out yet; "complete" renders one solid green bar.
function Dashes({ mode }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (mode !== "active") return undefined;
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % DASH_COUNT);
    }, 500);
    return () => clearInterval(interval);
  }, [mode]);

  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: DASH_COUNT }).map((_, index) => (
        <span
          key={index}
          className={`h-1 w-2.5 rounded-full transition-colors duration-300 ${
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

export default function AttendanceTodayPanel({ record, todaySchedule, onOpenWebcam }) {
  const isClockedIn = Boolean(record && !record.clock_out_at);
  const chip = statusChip(record, todaySchedule);
  const today = new Date();

  return (
    <div className="flex h-full flex-col items-center text-center">
      {/* Blank spacer row — mirrors the Full-time/"Schedule" heading row on
          the calendar side so the rows below line up. */}
      <div className="h-8 w-full" />

      <div className="flex h-8 w-full items-center justify-center">
        <p className="text-lg font-black text-[#0D1E4C]">Today</p>
      </div>

      <div className="flex h-6 w-full items-center justify-center">
        <p className="text-sm font-bold text-[#94a3b8]">
          {today.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>

      <p className="mt-5 text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Scheduled</p>

      {/* Three rows share this exact column template (value / dash connector
          / value) so the schedule times, labels, and actual times all line
          up pixel for pixel. */}
      <div className="mt-1 grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-1 gap-y-2">
        <span className="text-sm font-bold text-[#0D1E4C]">
          {todaySchedule ? formatScheduleTime(todaySchedule.start_time) : "—"}
        </span>
        <SolidLine />
        <span className="text-sm font-bold text-[#0D1E4C]">
          {todaySchedule ? formatScheduleTime(todaySchedule.end_time) : "—"}
        </span>

        <span className="text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Clock in</span>
        <span />
        <span className="text-right text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Clock out</span>

        <span className="text-sm font-bold text-[#0D1E4C]">{formatClockTime(record?.clock_in_at) || "—"}</span>
        <Dashes mode={!record?.clock_in_at ? "neutral" : isClockedIn ? "active" : "complete"} />
        <span className="text-right text-sm font-bold text-[#0D1E4C]">{formatClockTime(record?.clock_out_at) || "—"}</span>

        {record ? (
          <span
            className={`mt-1 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-black ${
              chip.tone === "success"
                ? "bg-emerald-100 text-emerald-700"
                : chip.tone === "warning"
                  ? "bg-slate-200 text-slate-600"
                  : "bg-slate-100 text-[#52627a]"
            }`}
          >
            {chip.label}
          </span>
        ) : (
          <span />
        )}
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 pt-6">
        <button
          type="button"
          onClick={onOpenWebcam}
          aria-label="Clock in or out"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[#0D1E4C]/40 text-[#0D1E4C] transition hover:scale-105 hover:border-[#0D1E4C]"
        >
          <span className="material-symbols-outlined text-2xl" aria-hidden="true">
            familiar_face_and_zone
          </span>
        </button>
        <p className="text-xs font-bold text-[#94a3b8]">{isClockedIn ? "Clock out" : "Clock in"}</p>
      </div>
    </div>
  );
}
