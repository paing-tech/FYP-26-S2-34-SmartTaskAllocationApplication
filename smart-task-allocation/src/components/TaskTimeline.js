"use client";

import { useMemo } from "react";
import { AvatarCircle } from "@/components/WorkspaceBoard";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const PILL_HEIGHT = 44;
const PILL_GAP = 8;
const ROW_PADDING = 10;
const MIN_ROW_HEIGHT = 64;

const PRIORITY_PILL_TONES = {
  low: "border-amber-50 bg-amber-300",
  medium: "border-orange-200 bg-orange-400",
  high: "border-red-200 bg-red-500",
  urgent: "border-red-200 bg-red-500",
};

function getPriorityKey(priority) {
  const normalized = String(priority || "Medium").toLowerCase();
  if (normalized === "low") return "low";
  if (normalized === "high") return "high";
  if (normalized === "urgent") return "urgent";
  return "medium";
}

function formatHour(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function formatWeekdayLabel(date) {
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).toUpperCase();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function dateKeyFor(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// A bare "00:00" (no explicit time picked) is stored verbatim as UTC — same
// detection WorkspaceCalendar uses, so an all-day task reads as all-day
// regardless of the viewer's timezone.
function hasTimeComponent(date) {
  return !(date.getUTCHours() === 0 && date.getUTCMinutes() === 0);
}

function getTaskRange(task) {
  const rawStart = task.start_datetime ? new Date(task.start_datetime) : null;
  const rawEnd = task.end_datetime ? new Date(task.end_datetime) : null;
  const validStart = rawStart && !Number.isNaN(rawStart.getTime()) ? rawStart : null;
  const validEnd = rawEnd && !Number.isNaN(rawEnd.getTime()) ? rawEnd : null;

  if (!validStart && !validEnd) return null;

  const start = validStart ?? new Date(validEnd.getTime() - 60 * 60 * 1000);
  const end =
    validEnd && validEnd.getTime() > start.getTime() ? validEnd : new Date(start.getTime() + 60 * 60 * 1000);
  const isAllDay = !hasTimeComponent(validStart ?? start);

  return { start, end, isAllDay };
}

// Greedily packs overlapping items into stacked lanes so none of the pills
// visually collide. Every returned item shares the same laneCount (the
// total lanes used), so the row can be sized around them.
function assignLanes(items) {
  const laneEndTimes = [];
  return [...items]
    .sort((a, b) => a.startHour - b.startHour)
    .map((item) => {
      let laneIndex = laneEndTimes.findIndex((end) => end <= item.startHour);
      if (laneIndex === -1) {
        laneIndex = laneEndTimes.length;
        laneEndTimes.push(item.endHour);
      } else {
        laneEndTimes[laneIndex] = item.endHour;
      }
      return { ...item, laneIndex };
    })
    .map((item) => ({ ...item, laneCount: laneEndTimes.length }));
}

function TimelinePill({ onOpen, style, task }) {
  const tone = PRIORITY_PILL_TONES[getPriorityKey(task.priority)] ?? PRIORITY_PILL_TONES.medium;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
      title={task.title || "Untitled task"}
      style={style}
      className={`absolute flex cursor-pointer items-center gap-2 overflow-hidden rounded-full border px-3 text-left shadow-sm backdrop-blur-sm transition hover:shadow-md ${tone}`}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-black text-white">{task.title || "Untitled task"}</span>
      <span className="hidden shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-700 sm:inline">
        {task.status || "Open"}
      </span>
      <AvatarCircle employee={task.assignees?.[0] ?? null} sizeClass="h-6 w-6" className="shrink-0 text-[9px]" />
    </div>
  );
}

// Multi-day tasks don't fit naturally into an hour-by-hour day grid, so
// instead of stretching (or awkwardly compacting) them into a row, they
// get their own simple pill in a separate list below the grid, with the
// date range shown directly.
function MultiDayTaskPill({ onOpen, range, task }) {
  const tone = PRIORITY_PILL_TONES[getPriorityKey(task.priority)] ?? PRIORITY_PILL_TONES.medium;

  return (
    <div className="shrink-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(task)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(task);
          }
        }}
        title={task.title || "Untitled task"}
        className={`flex cursor-pointer items-center gap-3 overflow-hidden rounded-full border px-4 py-2.5 text-left shadow-sm backdrop-blur-sm transition hover:shadow-md ${tone}`}
      >
        <span className="truncate text-xs font-black text-white">{task.title || "Untitled task"}</span>
        <AvatarCircle employee={task.assignees?.[0] ?? null} sizeClass="h-6 w-6" className="shrink-0 text-[9px]" />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[9px] font-bold text-[#94a3b8]">
        <span>{formatDate(range.start)}</span>
        <span>{formatDate(range.end)}</span>
      </div>
    </div>
  );
}

// Employee-facing timeline: same axis orientation and row sizing as
// WorkspaceCalendar (hours run left-to-right across the full width via
// `repeat(24, 1fr)`, so all 24 hours always fit without horizontal scroll),
// but only renders a row for a date that actually has a task, so a board
// with a few tasks spread over weeks doesn't render dozens of empty days.
export default function TaskTimeline({ employees = [], onOpen, tasks = [] }) {
  const today = useMemo(() => new Date(), []);
  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );

  const enrichedTasks = useMemo(() => {
    return tasks
      .map((task) => {
        const range = getTaskRange(task);
        if (!range) return null;
        const assignees = (task.assigneeIds ?? []).map((id) => employeesById.get(id)).filter(Boolean);
        return { range, task: { ...task, assignees } };
      })
      .filter(Boolean);
  }, [employeesById, tasks]);

  const sameDayTasks = useMemo(
    () => enrichedTasks.filter(({ range }) => isSameDay(range.start, range.end)),
    [enrichedTasks],
  );

  const multiDayTasks = useMemo(
    () =>
      enrichedTasks
        .filter(({ range }) => !isSameDay(range.start, range.end))
        .sort((a, b) => a.range.start.getTime() - b.range.start.getTime()),
    [enrichedTasks],
  );

  const { rowHeights, rows } = useMemo(() => {
    const byDateKey = new Map();

    for (const { range, task } of sameDayTasks) {
      const dayStart = new Date(range.start);
      dayStart.setHours(0, 0, 0, 0);
      const key = dateKeyFor(dayStart);
      const bucket = byDateKey.get(key) ?? { date: dayStart, items: [] };

      let startHour;
      let endHour;
      if (range.isAllDay) {
        startHour = 0;
        endHour = 24;
      } else {
        startHour = (range.start.getTime() - dayStart.getTime()) / 3600000;
        endHour = Math.min(
          24,
          Math.max(startHour + 0.5, (range.end.getTime() - dayStart.getTime()) / 3600000),
        );
      }

      bucket.items.push({ endHour, startHour, task });
      byDateKey.set(key, bucket);
    }

    const sortedRows = [...byDateKey.values()]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((bucket) => ({ ...bucket, items: assignLanes(bucket.items) }));

    const heights = sortedRows.map((row) => {
      const laneCount = row.items[0]?.laneCount ?? 0;
      if (!laneCount) return MIN_ROW_HEIGHT;
      const contentHeight = laneCount * PILL_HEIGHT + (laneCount - 1) * PILL_GAP;
      return Math.max(MIN_ROW_HEIGHT, ROW_PADDING * 2 + contentHeight);
    });

    return { rowHeights: heights, rows: sortedRows };
  }, [sameDayTasks]);

  return (
    <section className="mt-6 shrink-0">
      <h2 className="mb-3 text-center text-lg font-black text-[#0D1E4C]">Timeline</h2>

      {rows.length ? (
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/40 backdrop-blur-3xl">
          <div className="flex bg-gray-100">
            <div className="w-28 shrink-0" aria-hidden="true" />
            <div className="grid flex-1" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className={`truncate border-l border-[#E0E5E9] py-2 text-center text-[9px] font-semibold text-[#98a2b3] ${
                    hour === HOURS.length - 1 ? "border-r" : ""
                  }`}
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>
            <div className="w-3 shrink-0" aria-hidden="true" />
          </div>

          <div>
            {rows.map((row, rowIndex) => {
              const isToday = isSameDay(row.date, today);

              return (
                <div
                  key={row.date.toISOString()}
                  className="flex border-t border-[#E0E5E9]"
                  style={{ height: `${rowHeights[rowIndex]}px` }}
                >
                  <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 py-2">
                    <span className="text-[10px] font-semibold tracking-wide text-[#98a2b3]">
                      {formatWeekdayLabel(row.date)}
                    </span>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-medium ${
                        isToday ? "bg-[#1E40AF] text-white" : "text-[#1f2937]"
                      }`}
                    >
                      {row.date.getDate()}
                    </span>
                  </div>

                  <div className="relative flex-1">
                    <div
                      className="pointer-events-none absolute inset-0 grid"
                      style={{ gridTemplateColumns: "repeat(24, 1fr)" }}
                    >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className={`border-l border-[#E0E5E9] ${hour === HOURS.length - 1 ? "border-r" : ""}`}
                        />
                      ))}
                    </div>

                    {row.items.map((item) => (
                      <TimelinePill
                        key={item.task.task_id}
                        onOpen={onOpen}
                        task={item.task}
                        style={{
                          left: `${(item.startHour / 24) * 100}%`,
                          width: `${((item.endHour - item.startHour) / 24) * 100}%`,
                          top: `${ROW_PADDING + item.laneIndex * (PILL_HEIGHT + PILL_GAP)}px`,
                          height: `${PILL_HEIGHT}px`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="w-3 shrink-0" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-3xl border-2 border-dashed border-[#cbd5e1] px-6 py-10 text-sm font-bold text-[#94a3b8]">
          No scheduled tasks yet.
        </div>
      )}

      {multiDayTasks.length ? (
        <div className="mt-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {multiDayTasks.map(({ range, task }) => (
              <MultiDayTaskPill key={task.task_id} onOpen={onOpen} range={range} task={task} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
