"use client";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeStrToHour(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

function formatScheduleTime(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatClockTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDurationLabel(startMs, endMs) {
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  parts.push(`${minutes} min${minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// A single day's schedule vs. attendance, rendered as a self-contained
// (top label / bar / bottom label) block — used both as a small overlay
// inside AttendanceWeekCalendar's hour grid and as a full-width standalone
// block in AttendanceTodayPanel.
//  - scheduled but past with no clock-in -> full red "Absent" fill
//  - not clocked in yet (today/future)   -> plain white pill
//  - clocked in                          -> green fill from clock-in to
//    (clock-out, or "now" if still open) proportional to the schedule span,
//    with the worked duration centered inside the green segment
export default function AttendanceChip({ attendance, dateStr, now, schedule, chipHeight = 18, labelTextClass = "text-[8px]" }) {
  const startHour = timeStrToHour(schedule?.start_time);
  const endHour = timeStrToHour(schedule?.end_time);
  if (startHour === null || endHour === null || endHour <= startHour) return null;

  const todayStr = toDateStr(now);
  const isToday = dateStr === todayStr;
  const isPast = dateStr < todayStr;
  const hasClockIn = Boolean(attendance?.clock_in_at);
  const isAbsent = !hasClockIn && isPast;

  const topRow = (
    <div className={`flex items-center justify-between gap-1 whitespace-nowrap font-bold text-[#94a3b8] ${labelTextClass}`}>
      <span>{formatScheduleTime(schedule.start_time)}</span>
      <span>Scheduled</span>
      <span>{formatScheduleTime(schedule.end_time)}</span>
    </div>
  );

  if (isAbsent) {
    return (
      <div className="flex w-full flex-col gap-1">
        {topRow}
        <div
          className="flex items-center justify-center rounded-full bg-red-500 font-black text-white shadow-sm"
          style={{ height: chipHeight, fontSize: chipHeight >= 24 ? 11 : 8 }}
        >
          Absent
        </div>
      </div>
    );
  }

  if (!hasClockIn) {
    return (
      <div className="flex w-full flex-col gap-1">
        {topRow}
        <div
          className="rounded-full border border-white/70 bg-white shadow-sm"
          style={{ height: chipHeight }}
        />
      </div>
    );
  }

  const scheduleStartMs = new Date(`${dateStr}T00:00:00`).getTime() + startHour * 3600000;
  const scheduleEndMs = new Date(`${dateStr}T00:00:00`).getTime() + endHour * 3600000;
  const scheduleDurationMs = Math.max(1, scheduleEndMs - scheduleStartMs);

  const clockInMs = new Date(attendance.clock_in_at).getTime();
  const referenceEndMs = attendance.clock_out_at
    ? new Date(attendance.clock_out_at).getTime()
    : isToday
      ? now.getTime()
      : clockInMs;

  const greenStartPct = Math.max(0, Math.min(100, ((clockInMs - scheduleStartMs) / scheduleDurationMs) * 100));
  const greenEndPct = Math.max(
    greenStartPct,
    Math.min(100, ((referenceEndMs - scheduleStartMs) / scheduleDurationMs) * 100),
  );
  const greenWidthPct = greenEndPct - greenStartPct;
  const durationLabel = formatDurationLabel(clockInMs, referenceEndMs);
  const isOngoing = isToday && !attendance.clock_out_at;

  return (
    <div className="flex w-full flex-col gap-1">
      {topRow}
      <div
        className="overflow-hidden rounded-full border border-white/70 bg-white shadow-sm"
        style={{ height: chipHeight }}
      >
        <div
          className="flex h-full items-center justify-center whitespace-nowrap rounded-full bg-emerald-500 px-1 font-black text-white"
          style={{
            marginLeft: `${greenStartPct}%`,
            width: `${greenWidthPct}%`,
            fontSize: chipHeight >= 24 ? 11 : 7,
          }}
        >
          {greenWidthPct > 10 ? durationLabel : ""}
        </div>
      </div>
      <div className={`flex items-center justify-between gap-1 whitespace-nowrap font-bold text-[#94a3b8] ${labelTextClass}`}>
        <span>{formatClockTime(attendance.clock_in_at)}</span>
        <span>{isOngoing ? "Working" : "Worked"}</span>
        <span>{isOngoing ? formatClockTime(now.toISOString()) : formatClockTime(attendance.clock_out_at)}</span>
      </div>
    </div>
  );
}
