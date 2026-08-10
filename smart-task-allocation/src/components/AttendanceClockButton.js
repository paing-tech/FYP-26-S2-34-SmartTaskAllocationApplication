"use client";

// Compares against clock_in_at (always reliably set) rather than the
// separate work_date column — see AttendanceTodayPanel for the full reasoning.
function isSameLocalDay(isoTimestamp, reference) {
  if (!isoTimestamp) return false;
  const date = new Date(isoTimestamp);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

// Its own dedicated section (rather than living inside AttendanceTodayPanel)
// so it always has guaranteed room instead of competing for space with the
// schedule/clock-time detail grid above it.
export default function AttendanceClockButton({ record, onOpenWebcam }) {
  const now = new Date();
  const todaysRecord = isSameLocalDay(record?.clock_in_at, now) ? record : null;
  const isClockedIn = Boolean(todaysRecord && !todaysRecord.clock_out_at);
  const isClockedOut = Boolean(todaysRecord?.clock_out_at);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onOpenWebcam}
        aria-label="Clock in or out"
        className={`flex h-20 w-20 items-center justify-center rounded-full text-[#0D1E4C] transition hover:scale-120 ${
          isClockedIn ? "hover:text-red-600" : "hover:text-emerald-600"
        }`}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: "48px" }}>
          familiar_face_and_zone
        </span>
      </button>

      {isClockedOut ? (
        <span className="rounded-full bg-red-700 px-3 py-2 text-xs font-black text-white">Clocked out</span>
      ) : isClockedIn ? (
        <span className="rounded-full bg-emerald-700 px-3 py-2 text-xs font-black text-white">
          Clocked in
        </span>
      ) : (
        <p className="text-xs font-bold text-[#94a3b8]">Clock in</p>
      )}
    </div>
  );
}
