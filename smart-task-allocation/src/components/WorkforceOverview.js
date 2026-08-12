"use client";

import { useState } from "react";
import GlassSurface from "@/components/ui/glass-surface";

// Icon-only when inactive, icon+label when active — same rounded-full pill
// technique as the Board/Calendar toggle (WorkspaceView.js), just swapped
// to icon-led tabs since there are only two options and the icons alone
// are already distinct enough once one side collapses.
const VIEWS = [
  { id: "performance", label: "Performance", icon: "social_leaderboard" },
  { id: "schedule", label: "Schedule", icon: "event_note" },
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same ring geometry as AttendanceWorkHours' HourDonut, held at zero
// progress — this is a static shell until a selected manager/employee
// drives real hours through here.
const RADIUS = 36;
const STROKE_WIDTH = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONUT_SIZE = 68;
const BAR_TRACK_HEIGHT = 90;

function EmptyHourDonut({ label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 100" style={{ height: DONUT_SIZE, width: DONUT_SIZE }}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth={STROKE_WIDTH} />
        <text x="50" y="56" textAnchor="middle" fontSize="17" fontWeight="900" fill="#0D1E4C">
          0h
        </text>
      </svg>
      <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
    </div>
  );
}

// Work Hours and Attendance Rate for whichever manager/employee gets
// selected — same visual shell as the Attendance page's own cards, but no
// data wiring yet since there's no employee-selection UI to drive it.
function WorkforceWorkHoursShell() {
  return (
    <div>
      <p className="text-lg font-black text-[#0D1E4C]">Work Hours</p>
      <div className="mt-4 flex items-start justify-around">
        <EmptyHourDonut label="This week" />
        <EmptyHourDonut label="This month" />
        <div className="flex flex-col items-center gap-1">
          <div
            className="flex items-center justify-center rounded-full bg-slate-200"
            style={{ height: DONUT_SIZE, width: DONUT_SIZE }}
          >
            <span className="text-sm font-black text-[#94a3b8]">0h</span>
          </div>
          <p className="text-[10px] font-bold text-[#94a3b8]">Overtime</p>
        </div>
      </div>
    </div>
  );
}

function WorkforceAttendanceRateShell() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 text-lg font-black text-[#0D1E4C]">Attendance Rate</p>
      <div className="mt-4 flex min-h-0 flex-1 items-end justify-between gap-1">
        {MONTH_LABELS.map((label) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <p className="h-2.5 text-[8px] font-black text-red-600" />
            <div
              className="flex w-full items-end overflow-hidden rounded-t-sm bg-slate-200/70"
              style={{ height: BAR_TRACK_HEIGHT }}
            />
            <p className="text-[10px] font-bold text-[#94a3b8]">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorkforceOverview() {
  const [view, setView] = useState("performance");

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[3fr_7fr]">
      <div className="flex min-h-0 flex-col">
        <div className="flex w-56 shrink-0 justify-between rounded-full border border-white/60 bg-white/30 p-1 backdrop-blur-sm">
          {VIEWS.map((option) => {
            const isActive = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                // No fixed per-button width — the inactive side shrinks to just
                // its icon instead of reserving room for a label it isn't
                // showing. The pill's overall width is fixed on the container
                // instead, and justify-between + the width transition keep the
                // swap between icon-only and icon+label feeling deliberate.
                className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-all duration-200 ${
                  isActive ? "bg-[#0D1E4C] text-white shadow-sm" : "text-[#0D1E4C] hover:bg-white/60"
                }`}
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
          <GlassSurface className="mt-6 min-h-0 basis-[25%] overflow-hidden bg-white/30 p-5 shadow-none">
            <WorkforceWorkHoursShell />
          </GlassSurface>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-col">
        {view === "performance" ? (
          <GlassSurface className="min-h-0 basis-[25%] overflow-hidden bg-white/30 p-5 shadow-none">
            <WorkforceAttendanceRateShell />
          </GlassSurface>
        ) : null}
      </div>
    </div>
  );
}
