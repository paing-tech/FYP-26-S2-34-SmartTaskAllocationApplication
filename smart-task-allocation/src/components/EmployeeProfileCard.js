"use client";

import { useMemo, useState } from "react";

const SKILL_CHIP_CLASS = "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]";

const WEEKDAYS = [
  { key: 0, label: "Mon" },
  { key: 1, label: "Tue" },
  { key: 2, label: "Wed" },
  { key: 3, label: "Thu" },
  { key: 4, label: "Fri" },
  { key: 5, label: "Sat" },
  { key: 6, label: "Sun" },
];

function getDisplayName(employee) {
  return employee?.full_name || employee?.username || employee?.email || "Employee";
}

function getInitials(employee) {
  const name = getDisplayName(employee);
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// Sun=0..Sat=6 → Mon=0..Sun=6 so the week starts on Monday like the design.
function toMondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

/**
 * Employee profile card.
 *
 * Primary card: avatar, full name, job title, department, role badge and an
 * expand/collapse control. Secondary card (toggled by the control) reveals
 * skills and weekly availability.
 */
export default function EmployeeProfileCard({ employee, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const name = getDisplayName(employee);
  const jobTitle = employee?.job_title || "Job Title";
  const department = employee?.department?.department_name || "Department";
  const roleName = employee?.role?.role_name || "Employee";
  const skills = employee?.skill_details?.length
    ? employee.skill_details
    : (employee?.skills ?? []).map((name) => ({ name }));

  const hoursWorked = employee?.worked_hours_this_week ?? 0;

  // Highlight weekdays the employee has an availability window on.
  const availableDays = useMemo(() => {
    const rows = employee?.availabilities?.length
      ? employee.availabilities
      : employee?.availability
        ? [employee.availability]
        : [];

    const days = new Set();
    for (const row of rows) {
      if (!row?.availability_start) continue;
      const start = new Date(row.availability_start);
      if (Number.isNaN(start.getTime())) continue;
      days.add(toMondayIndex(start.getDay()));
    }

    return days;
  }, [employee]);

  return (
    <div className="flex w-72 max-w-[80vw] flex-col text-left">
      {/* Primary card */}
      <div className="relative z-10 flex flex-col rounded-3xl border border-white/70 bg-white p-5 shadow-[0_18px_50px_rgba(7,24,59,0.16)]">
        <div className="flex h-44 items-center justify-center rounded-2xl bg-[#eef2f8] text-4xl font-black text-[#07183b]">
          {employee?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={employee.avatar_url}
              alt={name}
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            getInitials(employee)
          )}
        </div>

        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-[#0D1E4C]">{name}</p>
            <p className="truncate text-sm font-semibold text-[#52627a]">{jobTitle}</p>
            <p className="truncate text-sm text-[#667085]">{department}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#e8edf5] px-3 py-1 text-xs font-bold text-[#52627a]">
            {roleName}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-4 flex w-full items-center justify-center text-[#94a3b8] transition hover:text-[#1E40AF]"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            {expanded ? (
              <>
                <path d="m7 11 5-5 5 5" />
                <path d="m7 17 5-5 5 5" />
              </>
            ) : (
              <>
                <path d="m7 7 5 5 5-5" />
                <path d="m7 13 5 5 5-5" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Secondary card — tucks behind the bottom of the primary card */}
      {expanded ? (
        <div className="relative z-0 -mt-10 rounded-3xl border border-white/70 bg-white px-5 pb-6 pt-16 shadow-[0_18px_50px_rgba(7,24,59,0.14)]">
          <h4 className="text-center text-lg font-black text-[#0D1E4C]">Skill</h4>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {skills.length ? (
              skills.map((skill) => (
                <span
                  key={skill.name}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${SKILL_CHIP_CLASS}`}
                >
                  {skill.name}
                </span>
              ))
            ) : (
              <span className="text-xs text-[#98a2b3]">No skills listed</span>
            )}
          </div>

          <h4 className="mt-5 text-center text-lg font-black text-[#0D1E4C]">Availability</h4>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {WEEKDAYS.map((day) => {
              const isOn = availableDays.has(day.key);
              return (
                <span
                  key={day.key}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${
                    isOn ? "bg-[#2563EB] text-white" : "bg-[#eef2f8] text-[#52627a]"
                  }`}
                >
                  {day.label}
                </span>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs font-semibold text-[#52627a]">
            {hoursWorked} hours worked this week
          </p>
        </div>
      ) : null}
    </div>
  );
}
