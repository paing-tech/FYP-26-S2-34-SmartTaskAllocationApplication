"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import GlassSurface from "@/components/ui/glass-surface";
import AttendanceTodayPanel from "@/components/AttendanceTodayPanel";
import AttendanceClockButton from "@/components/AttendanceClockButton";
import AttendanceScheduleCalendar from "@/components/AttendanceScheduleCalendar";
import AttendanceWorkHours from "@/components/AttendanceWorkHours";
import AttendanceWeekCalendar from "@/components/AttendanceWeekCalendar";
import AttendanceWebcamModal from "@/components/AttendanceWebcamModal";
import LeaveManagementPanel from "@/components/LeaveManagementPanel";
import LeaveBalance from "@/components/LeaveBalance";

function pad(value) {
  return String(value).padStart(2, "0");
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function todayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AttendanceClock() {
  const [profile, setProfile] = useState(null);
  const [record, setRecord] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [isWebcamModalOpen, setIsWebcamModalOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [weekRefreshVersion, setWeekRefreshVersion] = useState(0);
  const [leaveRefreshVersion, setLeaveRefreshVersion] = useState(0);

  // Selecting (or saving) a day on the month calendar moves the week view
  // over to that date and forces it to refetch — the version bump matters
  // even when the date itself doesn't change (e.g. re-saving the same day).
  function focusDate(dateStr) {
    setFocusedDate(new Date(`${dateStr}T00:00:00`));
    setWeekRefreshVersion((current) => current + 1);
  }

  const loadData = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [profileResponse, attendanceResponse, scheduleResponse] = await Promise.all([
        fetch("/api/my-profile", { headers }),
        fetch("/api/attendance", { headers }),
        fetch(`/api/attendance/schedule?month=${currentMonthStr()}`, { headers }),
      ]);
      const profileResult = await profileResponse.json();
      const attendanceResult = await attendanceResponse.json();
      const scheduleResult = await scheduleResponse.json();
      if (!profileResponse.ok) throw new Error(profileResult.error || "Could not load your profile.");
      if (!attendanceResponse.ok) throw new Error(attendanceResult.error || "Could not load attendance status.");

      setProfile(profileResult.profile);
      setRecord(attendanceResult.record);
      if (scheduleResponse.ok) {
        const today = (scheduleResult.days ?? []).find((day) => day.work_date === todayDateStr());
        setTodaySchedule(today ?? null);
      }
    } catch (error) {
      setLoadError(error.message);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadData, 0);
    return () => clearTimeout(timeout);
  }, [loadData]);

  const isClockedIn = Boolean(record && !record.clock_out_at);

  return (
    <section className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {loadError ? (
          <p className="max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {loadError}
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[3fr_7fr]">
            <div className="flex min-h-0 flex-col gap-4">
              <GlassSurface className="min-h-0 basis-[20%] overflow-hidden bg-white/30 p-5 shadow-none">
                <AttendanceWorkHours focusedDate={focusedDate} />
              </GlassSurface>

              <GlassSurface className="flex min-h-0 flex-1 flex-col gap-4 bg-white/30 p-5 shadow-none">
                <div className="shrink-0">
                  <AttendanceScheduleCalendar
                    onDateSelect={focusDate}
                    onLeaveRequestCreated={() => setLeaveRefreshVersion((current) => current + 1)}
                  />
                </div>
                <div className="min-h-0 flex-1">
                  <AttendanceTodayPanel record={record} todaySchedule={todaySchedule} />
                </div>
              </GlassSurface>
            </div>

            <div className="flex min-h-0 flex-col gap-4">
              <div className="shrink-0 basis-[20%] rounded-[28px] border border-white/40 bg-transparent" />

              <GlassSurface className="min-h-0 flex-7 overflow-hidden bg-white/30 shadow-none">
                <AttendanceWeekCalendar
                  key={`${focusedDate.toISOString()}-${weekRefreshVersion}`}
                  initialDate={focusedDate}
                />
              </GlassSurface>

              <div className="grid min-h-0 flex-3 gap-4 md:grid-cols-[2fr_3fr_3fr]">
                <GlassSurface className="flex min-h-0 items-center justify-center bg-white/30 p-5 shadow-none">
                  <AttendanceClockButton record={record} onOpenWebcam={() => setIsWebcamModalOpen(true)} />
                </GlassSurface>

                <GlassSurface className="min-h-0 overflow-y-auto bg-white/30 shadow-none">
                  <LeaveManagementPanel key={leaveRefreshVersion} />
                </GlassSurface>

                <GlassSurface className="min-h-0 overflow-y-auto bg-white/30 shadow-none">
                  <LeaveBalance />
                </GlassSurface>
              </div>
            </div>
          </div>
        )}
      </div>

      {isWebcamModalOpen ? (
        <AttendanceWebcamModal
          profile={profile}
          isClockedIn={isClockedIn}
          onClose={() => setIsWebcamModalOpen(false)}
          onSuccess={(nextRecord) => {
            setRecord(nextRecord);
            loadData();
          }}
        />
      ) : null}
    </section>
  );
}
