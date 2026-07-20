"use client";

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

export default function AttendanceTodayPanel({ record, todaySchedule, onOpenWebcam }) {
  const isClockedIn = Boolean(record && !record.clock_out_at);
  const chip = statusChip(record, todaySchedule);
  const today = new Date();

  return (
    <div className="flex h-full flex-col">
      <p className="text-lg font-black text-[#0D1E4C]">Today</p>
      <p className="text-sm font-bold text-[#94a3b8]">
        {today.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
      </p>

      <div className="mt-5">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Scheduled</p>
        {todaySchedule ? (
          <p className="mt-1 text-sm font-bold text-[#0D1E4C]">
            {formatScheduleTime(todaySchedule.start_time)} — {formatScheduleTime(todaySchedule.end_time)}
          </p>
        ) : (
          <p className="mt-1 text-sm font-bold text-[#94a3b8]">No timeline</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Clock in</p>
          <p className="mt-1 text-sm font-bold text-[#0D1E4C]">{formatClockTime(record?.clock_in_at) || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Clock out</p>
          <p className="mt-1 text-sm font-bold text-[#0D1E4C]">{formatClockTime(record?.clock_out_at) || "—"}</p>
        </div>
      </div>

      {record ? (
        <span
          className={`mt-3 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-black ${
            chip.tone === "success"
              ? "bg-emerald-100 text-emerald-700"
              : chip.tone === "warning"
                ? "bg-slate-200 text-slate-600"
                : "bg-slate-100 text-[#52627a]"
          }`}
        >
          {chip.label}
        </span>
      ) : null}

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
        <p className="text-xs font-bold text-[#94a3b8]">{isClockedIn ? "Clock out" : "Clock in/out"}</p>
      </div>
    </div>
  );
}
