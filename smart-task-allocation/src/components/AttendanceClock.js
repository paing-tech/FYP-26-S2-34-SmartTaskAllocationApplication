"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import GlassSurface from "@/components/ui/glass-surface";
import AttendanceTodayPanel from "@/components/AttendanceTodayPanel";
import AttendanceScheduleCalendar from "@/components/AttendanceScheduleCalendar";
import AttendanceWebcamModal from "@/components/AttendanceWebcamModal";

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
      <div className="flex h-full flex-col gap-4 overflow-y-auto pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#5d7290]">Team</p>
          <h1 className="mt-2 text-4xl font-black text-[#07183b]">Attendance</h1>
          <p className="mt-3 max-w-2xl text-base font-medium text-[#52627a]">
            Verify your face against your profile picture to clock in and out.
          </p>
        </div>

        {loadError ? (
          <p className="max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {loadError}
          </p>
        ) : (
          <>
            {/* Insights — reserved for future analytics, intentionally blank for now. */}
            <div className="min-h-32 rounded-[28px] border border-white/40 bg-transparent" />

            <div className="grid flex-1 gap-4 md:grid-cols-[1fr_2fr]">
              {/* Request Leave — reserved for a future leave-request flow, intentionally blank for now. */}
              <div className="min-h-64 rounded-[28px] border border-white/40 bg-transparent" />

              <GlassSurface className="grid gap-4 bg-white/30 p-5 sm:grid-cols-[220px_1fr]">
                <AttendanceTodayPanel
                  record={record}
                  todaySchedule={todaySchedule}
                  onOpenWebcam={() => setIsWebcamModalOpen(true)}
                />
                <AttendanceScheduleCalendar />
              </GlassSurface>
            </div>
          </>
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
