"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import GlassSurface from "@/components/ui/glass-surface";
import WorkforcePersonPicker from "@/components/WorkforcePersonPicker";

const STORAGE_KEY = "workforce-selected-person";

// Icon-only when inactive, icon+label when active — same rounded-full pill
// technique as the Board/Calendar toggle (WorkspaceView.js), just swapped
// to icon-led tabs since there are only two options and the icons alone
// are already distinct enough once one side collapses. Schedule's icon+label
// order is reversed so both icons stay anchored to the pill's outer edges
// (icon, Performance / Schedule, icon) instead of both crowding the middle.
const VIEWS = [
  { id: "performance", label: "Performance", icon: "social_leaderboard" },
  { id: "schedule", label: "Schedule", icon: "event_note", reverse: true },
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// All seven labeled (not GitHub's sparse Mon/Wed/Fri) — weekend work is a
// meaningful, distinct signal in an attendance context (some orgs schedule
// Sat/Sun shifts), and the larger cells below leave room for it without
// looking cluttered the way it would at GitHub's tiny cell size.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const HISTORY_STATUS_STYLES = {
  present: { color: "#16A34A", label: "Present" },
  late: { color: "#F59E0B", label: "Late" },
  absent: { color: "#DC2626", label: "Absent" },
  off: { color: "#E2E8F0", label: "Off" },
};

const RADIUS = 36;
const STROKE_WIDTH = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONUT_SIZE = 68;
const BAR_TRACK_HEIGHT = 140;

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function toHalfHours(totalHours) {
  const wholeHours = Math.floor(totalHours);
  const remainderMinutes = Math.round((totalHours - wholeHours) * 60);
  return wholeHours + (remainderMinutes >= 15 ? 0.5 : 0);
}

function formatHours(totalHours) {
  const rounded = toHalfHours(totalHours ?? 0);
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

function initials(name) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

// A progress ring with the hour count centered — grey/zero when no one's
// selected yet, real progress once `hours`/`maxHours` are supplied.
function HourDonut({ label, hours, maxHours, isOverLimit }) {
  const progress = maxHours > 0 ? Math.min(1, hours / maxHours) : 0;
  const ringColor = isOverLimit ? "#B91C1C" : "#2563EB";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 100" style={{ height: DONUT_SIZE, width: DONUT_SIZE }}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth={STROKE_WIDTH} />
        {hours != null ? (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 50 50)"
          />
        ) : null}
        <text x="50" y="56" textAnchor="middle" fontSize="17" fontWeight="900" fill="#0D1E4C">
          {hours != null ? formatHours(hours) : "0h"}
        </text>
      </svg>
      <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
    </div>
  );
}

// Work Hours for whichever manager/employee is selected — grey zero-state
// donuts until `data` (from /api/useradmin/workforce-profile) arrives.
function WorkforceWorkHoursShell({ data }) {
  const overtimeHours = data ? data.monthOvertimeMinutes / 60 : 0;
  const monthlyLimit = data ? data.weeklyHourLimit * 4 : 0;

  return (
    <div>
      <p className="text-lg font-black text-[#0D1E4C]">Work Hours</p>
      <div className="mt-6 flex items-start justify-around">
        <HourDonut
          label="This week"
          hours={data?.weekHours ?? null}
          maxHours={data?.weeklyHourLimit ?? 1}
          isOverLimit={data ? data.weekHours >= data.weeklyHourLimit : false}
        />
        <HourDonut
          label="This month"
          hours={data?.monthHours ?? null}
          maxHours={monthlyLimit || 1}
          isOverLimit={data ? data.monthHours >= monthlyLimit : false}
        />
        <div className="flex flex-col items-center gap-1">
          <div
            className={`flex items-center justify-center rounded-full ${overtimeHours > 0 ? "bg-amber-500" : "bg-slate-200"}`}
            style={{ height: DONUT_SIZE, width: DONUT_SIZE }}
          >
            <span className={`text-sm font-black ${overtimeHours > 0 ? "text-white" : "text-[#94a3b8]"}`}>
              {formatHours(overtimeHours)}
            </span>
          </div>
          <p className="text-[10px] font-bold text-[#94a3b8]">Overtime</p>
        </div>
      </div>
    </div>
  );
}

// Whoever is currently selected — falls back to the lightweight picker
// selection (name + avatar only) while the full profile (job title,
// department) is still loading, and to a generic person glyph before
// anyone's ever been picked.
function WorkforceEmployeeCardShell({ selectedPerson, person }) {
  const display = person ?? selectedPerson;

  if (!display) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-full bg-[#2563EB]">
          <span className="material-symbols-outlined text-white" style={{ fontSize: "42px" }} aria-hidden="true">
            person
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
      {display.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={display.avatarUrl}
          alt={display.fullName}
          className="h-36 w-32 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-full bg-[#2563EB]">
          <span className="text-4xl font-black text-white">{initials(display.fullName)}</span>
        </div>
      )}
      <div>
        <p className="text-xl pb-1 font-black text-[#0D1E4C]">{display.fullName}</p>
        <p className="flex items-center justify-center gap-2 pb-1 text-sm font-semibold text-[#475569]">
          <span className="material-symbols-outlined text-[#0D1E4C]" style={{ fontSize: "20px" }} aria-hidden="true">
            business_center
          </span>
          {person?.jobTitle ?? "…"}
        </p>
        <p className="text-xs pb-1 font-medium text-slate-500">{person?.departmentName ?? "…"}</p>
      </div>
    </div>
  );
}

// Plain name-left / number-right row shared by the Attendance Summary and
// Productivity stat lists.
function StatRow({ label, value, size = "text-sm" }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${size}`}>
      <span className="font-semibold text-[#475569]">{label}</span>
      <span className="font-black text-[#0D1E4C]">{value}</span>
    </div>
  );
}

// Present/Absent/Late are year-to-date totals behind the Attendance Rate
// chart on the right; Attendance Rate itself is repeated here (as the
// average already shown on that chart) since this panel is meant to be a
// scannable vitals summary on its own, without needing to look elsewhere
// for the single most important attendance number. Present/Absent/Late/
// Rate come pre-scoped to `range` from the server (attendanceSummary);
// Leave Balance stays annual regardless — see RangeToggle for why.
function WorkforceAttendanceSummaryShell({ attendanceSummary, leaveBalance, range, onRangeChange }) {
  const annualTotal = leaveBalance?.totals.annual ?? 0;
  const annualRemaining = leaveBalance ? Math.max(0, annualTotal - leaveBalance.used.annual) : 0;
  const sickTotal = leaveBalance?.totals.sick ?? 0;
  const sickRemaining = leaveBalance ? Math.max(0, sickTotal - leaveBalance.used.sick) : 0;
  const attendanceRatePercent = attendanceSummary?.attendanceRatePercent;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5">
      <RangeToggle range={range} onChange={onRangeChange} />
      <StatRow size="text-xs" label="Present Days" value={attendanceSummary ? attendanceSummary.presentDays : "—"} />
      <StatRow size="text-xs" label="Absent Days" value={attendanceSummary ? attendanceSummary.absentDays : "—"} />
      <StatRow size="text-xs" label="Late Arrivals" value={attendanceSummary ? attendanceSummary.lateArrivals : "—"} />
      <StatRow
        size="text-xs"
        label="Attendance Rate"
        value={attendanceRatePercent != null ? `${attendanceRatePercent}%` : "—"}
      />
      <StatRow size="text-xs" label="Annual Leave" value={leaveBalance ? `${annualRemaining} / ${annualTotal}` : "—"} />
      <StatRow size="text-xs" label="Sick Leave" value={leaveBalance ? `${sickRemaining} / ${sickTotal}` : "—"} />
    </div>
  );
}

// Small shared Week/Month toggle for the two period-summable sections —
// deliberately not applied to Leave Balance or the snapshot productivity
// numbers (Overdue, In Progress), which aren't period sums (see the
// earlier call on this).
function RangeToggle({ range, onChange }) {
  return (
    <div className="mb-1 flex w-fit self-center rounded-full border border-white/70 bg-white/40 p-1">
      {["week", "month"].map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full px-2.5 py-1.5 text-xs font-bold capitalize transition ${
            range === option ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// Reusable share-of-a-whole bar — used for both Completed (of total
// assigned) and On Time (of total completed). Each gets its own gradient so
// two bars sitting near each other don't read as duplicates at a glance.
function GlowProgressBar({ label, numerator, denominator, unitLabel, trailingLabel, fromColor, toColor, glowColor }) {
  const percent = denominator ? Math.round((numerator / denominator) * 100) : 0;

  return (
    <div>
      <p className="mb-2 flex items-baseline gap-2">
        <span className="text-4xl font-black text-[#0D1E4C]">{percent}%</span>
        <span className="text-xs font-bold text-[#94a3b8]">{label}</span>
      </p>
      <div className="relative flex h-9 items-center rounded-full bg-slate-300/20">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
          style={{
            width: `${denominator ? Math.max(percent, 4) : 0}%`,
            backgroundImage: `linear-gradient(to right, ${fromColor}, ${toColor})`,
            boxShadow: `0 0 14px 3px ${glowColor}`,
          }}
        />
        <span className="relative z-10 ml-auto mr-3 text-[11px] font-bold text-[#475569]">
          {trailingLabel ?? `${numerator} / ${denominator} ${unitLabel}`}
        </span>
      </div>
    </div>
  );
}

// Productivity for the selected person, scoped to `range` (week/month).
// Managers get a different stat set entirely — tasks they *created*
// (manual vs AI-assisted) and assignments they've made, not tasks assigned
// to them, since a manager's own execution queue isn't the meaningful
// signal for that role the way it is for an employee. Neither branch is a
// composite score or a cross-team ranking — see the earlier call on this: a
// single "score" hides which dimension is actually weak, and a ranking is a
// different feature (a team-wide leaderboard) that doesn't belong inside a
// per-person panel.
function WorkforceProductivityShell({ data, workHours, range, selectedPerson }) {
  const hours = workHours ? (range === "month" ? workHours.monthHours : workHours.weekHours) : null;
  const overtimeMinutes = workHours
    ? range === "month"
      ? workHours.monthOvertimeMinutes
      : workHours.weekOvertimeMinutes
    : null;
  // Fall back to the picker's role while `data` is still loading (or mid
  // refetch after switching people), so a manager doesn't briefly flash the
  // employee stat rows before their own data arrives.
  const isManager = (data?.role ?? selectedPerson?.role) === "manager";

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5">
      <p className="mb-0.5 text-center text-lg font-black text-[#0D1E4C]">Productivity</p>

      {isManager ? (
        <>
          <StatRow size="text-xs" label="Total Tasks Created" value={data ? data.tasksCreated : "—"} />
          <StatRow size="text-xs" label="Tasks Created Manually" value={data ? data.createdManually : "—"} />
          <StatRow size="text-xs" label="Tasks Created Via AI" value={data ? data.createdViaAi : "—"} />
          <StatRow size="text-xs" label="Task Assignments" value={data ? data.taskAssignments : "—"} />
        </>
      ) : (
        <>
          <StatRow size="text-xs" label="Total Tasks Completed" value={data ? data.totalCompleted : "—"} />
          <StatRow size="text-xs" label="Tasks Completed On Time" value={data ? data.completedOnTime : "—"} />
          <StatRow size="text-xs" label="Overdue Tasks" value={data ? data.overdueTasks : "—"} />
          <StatRow size="text-xs" label="Tasks In Progress" value={data ? data.inProgress : "—"} />
        </>
      )}

      <StatRow size="text-xs" label="Work Hours" value={hours != null ? formatHours(hours) : "—"} />
      <StatRow size="text-xs" label="Overtime" value={overtimeMinutes != null ? formatHours(overtimeMinutes / 60) : "—"} />

      <div className="mt-1">
        {isManager ? (
          <GlowProgressBar
            label="Tasks Created Via AI"
            numerator={data?.createdViaAi ?? 0}
            denominator={data?.tasksCreated ?? 0}
            trailingLabel={data ? `${data.createdViaAi} AI · ${data.createdManually} Manual` : undefined}
            fromColor="#16A34A"
            toColor="#4ADE80"
            glowColor="rgba(74,222,128,0.55)"
          />
        ) : (
          <GlowProgressBar
            label="Tasks Completed"
            numerator={data?.totalCompleted ?? 0}
            denominator={data?.totalAssigned ?? 0}
            unitLabel="tasks"
            fromColor="#16A34A"
            toColor="#4ADE80"
            glowColor="rgba(74,222,128,0.55)"
          />
        )}
      </div>
    </div>
  );
}

// Attendance Rate for the selected person — empty grey bars until `data`
// (rates/lateCounts/scheduledMonths) arrives, then the real monthly chart
// plus an "Average X%" header stat scoped to months that actually had a
// schedule (see AttendanceRateChart.js for why that scoping matters).
function WorkforceAttendanceRateShell({ data }) {
  const rates = data?.rates ?? Array(12).fill(0);
  const lateCounts = data?.lateCounts ?? Array(12).fill(0);
  const scheduledRates = data ? rates.filter((_, index) => data.scheduledMonths[index]) : [];
  const averageRate = scheduledRates.length
    ? Math.round(scheduledRates.reduce((sum, rate) => sum + rate, 0) / scheduledRates.length)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-lg font-black text-[#0D1E4C]">Attendance Rate</p>
        {averageRate != null ? (
          <p className="flex items-center gap-1 text-sm font-bold text-[#0D1E4C]">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              bar_chart
            </span>
            Average {averageRate}%
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 items-end justify-between gap-1">
        {MONTH_LABELS.map((label, index) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <p className="h-2.5 text-[8px] font-black text-red-600">
              {lateCounts[index] > 0 ? lateCounts[index] : ""}
            </p>
            <div
              className="flex w-full items-end overflow-hidden rounded-t-sm bg-slate-200/70"
              style={{ height: BAR_TRACK_HEIGHT }}
            >
              <div
                className="flex w-full items-start justify-center rounded-t-sm bg-[#2563EB] pt-0.5 transition-[height] duration-300"
                style={{ height: `${rates[index]}%` }}
              >
                {rates[index] > 0 ? <span className="text-[12px] font-black text-white">{rates[index]}%</span> : null}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const LEAVE_TYPES = [
  { key: "annual", label: "Annual Leave", icon: "trip" },
  { key: "sick", label: "Sick Leave", icon: "health_cross" },
];

function formatLeaveRecordDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Blank until `data` arrives. Remaining Annual/Sick counts stay as compact
// icon badges up top (unchanged logic, just no more progress bars); below
// that, only the badges are pinned — the approved-leave record list scrolls
// on its own inside the same fixed card height.
function WorkforceLeaveBalanceShell({ data }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-lg font-black text-[#0D1E4C]">Leave Records</p>

        {data ? (
          <div className="flex shrink-0 items-center gap-2">
            {LEAVE_TYPES.map((type) => {
              const total = data.totals[type.key];
              const usedDays = Math.min(data.used[type.key], total);
              const remainingDays = Math.max(0, total - usedDays);

              return (
                <div
                  key={type.key}
                  className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5"
                  title={type.label}
                >
                  <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                    {type.icon}
                  </span>
                  <span className="text-sm font-black text-[#0D1E4C]">{remainingDays}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {data ? (
        <>
          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {data.records.length ? (
              data.records.map((record, index) => (
                <div
                  key={`${record.date}-${index}`}
                  className="flex items-center justify-between gap-2 text-xs font-semibold text-[#0D1E4C]"
                >
                  <span>On {record.type} leave</span>
                  <span className="shrink-0 text-[#94a3b8]">{formatLeaveRecordDate(record.date)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs font-semibold text-[#94a3b8]">No approved leave on record.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Mon-start week columns spanning every day the API returned, so the grid
// renders as a complete rectangle (blank/off days included) rather than
// only the days that had a schedule or record.
function buildHistoryWeeks(days) {
  if (!days.length) return [];
  const byDate = new Map(days.map((day) => [day.date, day.status]));

  const first = new Date(`${days[0].date}T00:00:00Z`);
  const last = new Date(`${days[days.length - 1].date}T00:00:00Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - mondayOffset);

  const weeks = [];
  while (cursor <= last) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const dateStr = cursor.toISOString().slice(0, 10);
      week.push({ date: dateStr, status: byDate.get(dateStr) ?? null });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// GitHub-contributions-style day grid — "History" over "Heatmap"/"Contributions"
// since it's a plain, domain-agnostic name (no GitHub jargon, no chart-type
// jargon) that still reads as "a record of past days," and stays distinct
// from "Attendance Rate" (an aggregate %) above it. Kept as a year view
// rather than scoped to a month — the whole point of this chart is
// surfacing long-range patterns (a rough March, always late on Mondays)
// that a single month is too short a window to reveal; a month's worth of
// data is already covered by the day-level WeekCalendar elsewhere.
function WorkforceAttendanceHistoryShell({ days }) {
  const weeks = days ? buildHistoryWeeks(days) : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <p className="shrink-0 text-lg font-black text-[#0D1E4C]">Attendance History</p>

      {weeks.length ? (
        <>
          <div className="mt-6 flex min-h-0 min-w-0 flex-1 justify-center gap-3 overflow-x-auto pb-1 pl-4">
            {/* Same spacer-then-rows structure as each day column below
                (h-3 spacer, gap-0.75, h-3 rows) so labels land on exactly
                the same y-position as their corresponding cell row instead
                of drifting via justify-between's even-spacing guess. */}
            <div className="flex shrink-0 flex-col gap-0.75">
              <span className="block h-3" />
              {WEEKDAY_LABELS.map((label, index) => (
                <span key={index} className="flex h-3 items-center text-[9px] font-bold text-[#94a3b8]">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 items-start gap-0.75">
              {weeks.map((week, weekIndex) => {
                const firstOfMonth = week.find((day) => day.date.endsWith("-01"));
                return (
                  <div key={weekIndex} className="flex flex-col gap-0.75">
                    <span className="block h-3 text-[9px] font-bold text-[#94a3b8]">
                      {firstOfMonth ? MONTH_LABELS[Number(firstOfMonth.date.slice(5, 7)) - 1] : ""}
                    </span>
                    {week.map((day) => (
                      <span
                        key={day.date}
                        title={`${day.date}${day.status ? ` — ${HISTORY_STATUS_STYLES[day.status].label}` : ""}`}
                        className="block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: day.status ? HISTORY_STATUS_STYLES[day.status].color : "#F1F5F9" }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1">
            {Object.entries(HISTORY_STATUS_STYLES).map(([key, style]) => (
              <span key={key} className="flex items-center gap-1.5 text-sm font-semibold text-[#475569]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: style.color }} />
                {style.label}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function WorkforceOverview() {
  const [view, setView] = useState("performance");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [range, setRange] = useState("month");
  const [profileData, setProfileData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [error, setError] = useState("");
  const [isSavingImage, setIsSavingImage] = useState(false);
  const previousPersonIdRef = useRef(null);
  const performanceViewRef = useRef(null);

  async function handleSaveImage() {
    if (!performanceViewRef.current || isSavingImage) return;
    setIsSavingImage(true);
    setError("");
    try {
      const dataUrl = await toPng(performanceViewRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `${selectedPerson?.fullName || "workforce"}-performance.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError("Could not save the image. Please try again.");
    } finally {
      setIsSavingImage(false);
    }
  }

  // Restore the last-selected person on load — once someone's been picked
  // (this session or a previous one), the placeholder "no one selected"
  // state should never come back on its own.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setSelectedPerson(JSON.parse(stored));
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!selectedPerson) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedPerson));

    let cancelled = false;
    const isNewPerson = previousPersonIdRef.current !== selectedPerson.userId;
    previousPersonIdRef.current = selectedPerson.userId;

    (async () => {
      try {
        setError("");
        // Only clear stale data when the PERSON changes — a range-only
        // toggle (Week/Month) keeps the previous numbers on screen until
        // the refetch resolves, instead of flashing to the loading "—"
        // state (and, for a manager, briefly falling back to the employee
        // stat shape while `data` is momentarily null).
        if (isNewPerson) {
          setProfileData(null);
          setHeatmapData(null);
        }
        const headers = await authHeaders();
        const [profileResponse, heatmapResponse] = await Promise.all([
          fetch(`/api/useradmin/workforce-profile?userId=${selectedPerson.userId}&range=${range}`, { headers }),
          fetch(`/api/useradmin/workforce-heatmap?userId=${selectedPerson.userId}`, { headers }),
        ]);
        const profileResult = await profileResponse.json();
        const heatmapResult = await heatmapResponse.json();
        if (!profileResponse.ok) throw new Error(profileResult.error || "Could not load their profile.");
        if (!heatmapResponse.ok) throw new Error(heatmapResult.error || "Could not load their attendance heatmap.");
        if (!cancelled) {
          setProfileData(profileResult);
          setHeatmapData(heatmapResult.days);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPerson, range]);

  return (
    <div ref={performanceViewRef} className="grid h-full min-h-0 gap-4 md:grid-cols-[3fr_7fr]">
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex w-46 rounded-full border border-white/60 bg-white/30 p-1 backdrop-blur-sm">
            {VIEWS.map((option) => {
              const isActive = view === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  className={`flex flex-1 items-center gap-2 rounded-full py-2 text-sm font-bold transition ${
                    option.reverse
                      ? `flex-row-reverse justify-end pr-2 ${isActive ? "pl-8" : "pl-2"}`
                      : "justify-start px-2"
                  } ${isActive ? "bg-[#0D1E4C] text-white shadow-sm" : "text-[#0D1E4C] hover:bg-white/60"}`}
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    {option.icon}
                  </span>
                  {isActive ? option.label : null}
                </button>
              );
            })}
          </div>

          {view === "performance" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSaveImage}
                disabled={!selectedPerson || isSavingImage}
                aria-label="Save a picture of this view"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:scale-120 disabled:opacity-40 disabled:hover:scale-100"
              >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  download
                </span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsPickerOpen((open) => !open)}
                  aria-label="Select a manager or employee"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:scale-120"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    person_search
                  </span>
                </button>

                {isPickerOpen ? (
                  <WorkforcePersonPicker
                    onClose={() => setIsPickerOpen(false)}
                    onSelect={(person) => {
                      setSelectedPerson(person);
                      setIsPickerOpen(false);
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {view === "performance" ? (
          <>
            <div className="min-h-0 basis-[40%] overflow-hidden p-3">
              <WorkforceEmployeeCardShell selectedPerson={selectedPerson} person={profileData?.person} />
            </div>
            <div className="min-h-0 basis-[30%] overflow-hidden px-14">
              <WorkforceAttendanceSummaryShell
                attendanceSummary={profileData?.attendanceSummary}
                leaveBalance={profileData?.leaveBalance}
                range={range}
                onRangeChange={setRange}
              />
            </div>
            <div className="min-h-0 basis-[45%] overflow-hidden px-14 -mt-6">
              <WorkforceProductivityShell
                data={profileData?.productivity}
                workHours={profileData?.workHours}
                range={range}
                selectedPerson={selectedPerson}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        {/* No reserved spacer for the toggle — this card starts flush at the
            same top edge as the toggle, and its height is calculated (25%
            of the column, same as Work Hours, plus the toggle+gap height
            Work Hours sits below) so its bottom edge still lines up with
            Work Hours' bottom instead of falling short or overshooting. */}
        {view === "performance" ? (
          <>
            {error ? <p className="shrink-0 text-xs font-bold text-red-600">{error}</p> : null}

            <GlassSurface className="min-h-0 basis-[calc(25%+3.5rem)] overflow-hidden bg-white/30 p-5 shadow-none">
              <WorkforceAttendanceRateShell data={profileData?.attendanceRate} />
            </GlassSurface>

            <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
              <GlassSurface className="min-h-0 overflow-y-auto bg-white/30 p-5 shadow-none">
                <WorkforceWorkHoursShell data={profileData?.workHours} />
              </GlassSurface>
              <GlassSurface className="min-h-0 overflow-y-auto bg-white/30 p-5 shadow-none">
                <WorkforceLeaveBalanceShell data={profileData?.leaveBalance} />
              </GlassSurface>
            </div>

            <GlassSurface className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white/30 p-5 shadow-none">
              <WorkforceAttendanceHistoryShell days={heatmapData} />
            </GlassSurface>
          </>
        ) : null}
      </div>
    </div>
  );
}
