"use client";

import { useMemo, useState } from "react";

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay()); // back to Sunday
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatHour(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDisplayName(employee) {
  return employee?.full_name || employee?.username || employee?.email || "Employee";
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getTaskDate(task) {
  const value = task.start_datetime || task.end_datetime;
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPriorityClasses(priority) {
  const normalized = String(priority || "Medium").toLowerCase();

  if (normalized === "low") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (normalized === "urgent" || normalized === "high") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function WorkspaceCalendar({
  employees = [],
  error = "",
  groups = [],
  isLoading = false,
  tasks = [],
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(weekStart),
    [weekStart],
  );

  const today = useMemo(() => new Date(), []);
  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );
  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.group_id, group])),
    [groups],
  );
  const scheduledTasks = useMemo(
    () =>
      tasks
        .map((task) => ({ ...task, calendarDate: getTaskDate(task) }))
        .filter((task) => task.calendarDate),
    [tasks],
  );

  function goToPreviousWeek() {
    setWeekStart((current) => addDays(current, -7));
  }

  function goToNextWeek() {
    setWeekStart((current) => addDays(current, 7));
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-[#52627a]">
        Loading calendar...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-red-200 bg-red-50/80 px-4 text-sm font-bold text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header: month nav */}
      <div className="relative z-40 flex shrink-0 items-center justify-center px-2 pb-5">
        <div className="flex items-center gap-3 text-lg font-bold text-[#0D1E4C]">
          <button
            type="button"
            onClick={goToPreviousWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/60"
            aria-label="Previous week"
          >
            ‹
          </button>
          <span className="min-w-[7rem] text-center">{monthLabel}</span>
          <button
            type="button"
            onClick={goToNextWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/60"
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      {/* Calendar card */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/60 bg-white/40 backdrop-blur-3xl">
        <div className="h-full overflow-auto">
          {/* Day header row (sticky) */}
          <div
            className="sticky top-0 z-20 grid bg-gray-100"
            style={{ gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))" }}
          >
            {/* Spacer for the time-label column so SUN aligns with the grid */}
            <div aria-hidden="true" />
            {days.map((day, index) => {
              const isToday = isSameDay(day, today);
              return (
                <div key={day.toISOString()} className="py-2 text-center">
                  <p className="text-[11px] font-semibold tracking-wide text-[#98a2b3]">
                    {DAY_LABELS[index]}
                  </p>
                  <p
                    className={`mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-full text-xl font-medium ${
                      isToday ? "bg-[#1E40AF] text-white" : "text-[#1f2937]"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div
            className="grid"
            style={{ gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))" }}
          >
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                {/* Time label column — no divider line */}
                <div className="relative h-14 pr-2 text-right">
                  {hour > 0 ? (
                    <span className="absolute -top-2 right-2 text-[11px] font-medium text-[#98a2b3]">
                      {formatHour(hour)}
                    </span>
                  ) : null}
                </div>
                {days.map((day) => (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`min-h-14 border-l border-[#E0E5E9] p-1 ${
                      hour > 0 ? "border-t" : ""
                    }`}
                  >
                    <div className="space-y-1">
                      {scheduledTasks
                        .filter(
                          (task) =>
                            isSameDay(task.calendarDate, day) &&
                            task.calendarDate.getHours() === hour,
                        )
                        .map((task) => {
                          const assignee = employeesById.get(task.assigned_to);
                          const group = groupsById.get(task.group_id);

                          return (
                            <div
                              key={task.task_id}
                              className={`rounded-lg border px-2 py-1 shadow-sm ${getPriorityClasses(task.priority)}`}
                              title={task.title}
                            >
                              <p className="truncate text-[11px] font-black">
                                {task.title || "Untitled task"}
                              </p>
                              <p className="truncate text-[10px] font-semibold opacity-80">
                                {formatTime(task.start_datetime || task.end_datetime)}
                                {assignee ? ` · ${getDisplayName(assignee)}` : ""}
                              </p>
                              {group ? (
                                <p className="truncate text-[10px] font-semibold opacity-70">
                                  {group.group_name}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
