"use client";

import { useMemo, useState } from "react";
import { AssignEmployeeModal, TaskEditPanel, getDisplayName } from "@/components/WorkspaceBoard";

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAY_MS = 24 * 60 * 60 * 1000;
const PILL_HEIGHT = 44;
const PILL_GAP = 8;
const ROW_PADDING = 10;
const MIN_ROW_HEIGHT = 64;
const PILL_MIN_WIDTH = 220;

const PRIORITY_PILL_TONES = {
  low: "border-amber-50 bg-amber-300",
  medium: "border-orange-200 bg-orange-400",
  high: "border-red-200 bg-red-500",
  urgent: "border-red-200 bg-red-500",
};

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

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getPriorityKey(priority) {
  const normalized = String(priority || "Medium").toLowerCase();
  if (normalized === "low") return "low";
  if (normalized === "high") return "high";
  if (normalized === "urgent") return "urgent";
  return "medium";
}

function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// A date with no explicit time is written as a bare "00:00" (see
// combineDateTime in WorkspaceBoard.js), which the API stores verbatim as
// UTC — so checking UTC hours (not local) is what reliably detects "no time
// set" regardless of the viewer's timezone, letting the task expand across
// the whole day instead of pinning to a sliver at some shifted local hour.
function hasTimeComponent(date) {
  return !(date.getUTCHours() === 0 && date.getUTCMinutes() === 0);
}

// A task occupies a span of time on the calendar. Tasks with only one of
// start/end are treated as occupying a single hour so they still render.
function getTaskRange(task) {
  const rawStart = task.start_datetime ? new Date(task.start_datetime) : null;
  const rawEnd = task.end_datetime ? new Date(task.end_datetime) : null;
  const validStart = rawStart && !Number.isNaN(rawStart.getTime()) ? rawStart : null;
  const validEnd = rawEnd && !Number.isNaN(rawEnd.getTime()) ? rawEnd : null;

  if (!validStart && !validEnd) return null;

  const start = validStart ?? new Date(validEnd.getTime() - 60 * 60 * 1000);
  const end =
    validEnd && validEnd.getTime() > start.getTime()
      ? validEnd
      : new Date(start.getTime() + 60 * 60 * 1000);
  const isAllDay = !hasTimeComponent(validStart ?? start);

  return { start, end, isAllDay };
}

// Greedily packs overlapping items into stacked lanes so none of the pills
// visually collide. Every returned item shares the same laneCount (the
// total lanes used), so callers can size a uniform row/band around them.
function assignLanes(items) {
  const laneEndTimes = [];
  return [...items]
    .sort((a, b) => a.startMs - b.startMs)
    .map((item) => {
      let laneIndex = laneEndTimes.findIndex((end) => end <= item.startMs);
      if (laneIndex === -1) {
        laneIndex = laneEndTimes.length;
        laneEndTimes.push(item.endMs);
      } else {
        laneEndTimes[laneIndex] = item.endMs;
      }
      return { ...item, laneIndex };
    })
    .map((item) => ({ ...item, laneCount: laneEndTimes.length }));
}

function AvatarStack({ assignees }) {
  if (!assignees.length) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#94a3b8] text-[9px] font-black text-white">
        ?
      </span>
    );
  }

  const shown = assignees.slice(0, 3);
  const extra = assignees.length - shown.length;

  return (
    <span className="flex shrink-0 items-center -space-x-2">
      {shown.map((employee) => (
        <span
          key={employee.user_id}
          title={getDisplayName(employee)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-[9px] font-black text-white"
        >
          {initials(getDisplayName(employee))}
        </span>
      ))}
      {extra > 0 ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0D1E4C] text-[9px] font-black text-white">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

function TaskPill({ employees, groupName, onAiAssign, onAssignEmployee, onOpen, onUnassignEmployee, style, task, tasks }) {
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const tone = PRIORITY_PILL_TONES[getPriorityKey(task.priority)] ?? PRIORITY_PILL_TONES.medium;

  return (
    <>
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
        className={`pointer-events-auto absolute flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-full border px-4 text-left shadow-sm backdrop-blur-sm transition hover:shadow-md ${tone}`}
      >
        <span className="flex min-w-0 shrink items-center gap-2">
          <span className="truncate text-xs font-black text-white">{task.title || "Untitled task"}</span>
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-700">
            {task.status || "Open"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <AvatarStack assignees={task.assignees ?? []} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsAssignOpen(true);
            }}
            className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[10px] font-black text-[#0D1E4C] transition hover:scale-110 hover:bg-white"
          >
            Assign
          </button>
        </span>
      </div>

      {isAssignOpen ? (
        <AssignEmployeeModal
          employees={employees}
          groupName={groupName}
          task={task}
          tasks={tasks}
          onAiAssign={() => onAiAssign?.(task)}
          onAssign={(employeeId) => onAssignEmployee?.(task, employeeId)}
          onClose={() => setIsAssignOpen(false)}
          onUnassign={(employeeId) => onUnassignEmployee?.(task, employeeId)}
        />
      ) : null}
    </>
  );
}

// Multi-day tasks don't fit naturally into an hour-by-hour day grid, so
// instead of stretching (or awkwardly compacting) them into it, they get
// their own simple pill in a separate list below the grid, with the date
// range shown directly instead of being implied by position/width.
function MultiDayTaskPill({ employees, groupName, onAiAssign, onAssignEmployee, onOpen, onUnassignEmployee, range, task, tasks }) {
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const tone = PRIORITY_PILL_TONES[getPriorityKey(task.priority)] ?? PRIORITY_PILL_TONES.medium;

  return (
    <>
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
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-black text-white">{task.title || "Untitled task"}</span>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-700">
              {task.status || "Open"}
            </span>
          </span>
          <AvatarStack assignees={task.assignees ?? []} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsAssignOpen(true);
            }}
            className="shrink-0 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[10px] font-black text-[#0D1E4C] transition hover:scale-110 hover:bg-white"
          >
            Assign
          </button>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[9px] font-bold text-[#94a3b8]">
          <span>{formatDate(range.start)}</span>
          <span>{formatDate(range.end)}</span>
        </div>
      </div>

      {isAssignOpen ? (
        <AssignEmployeeModal
          employees={employees}
          groupName={groupName}
          task={task}
          tasks={tasks}
          onAiAssign={() => onAiAssign?.(task)}
          onAssign={(employeeId) => onAssignEmployee?.(task, employeeId)}
          onClose={() => setIsAssignOpen(false)}
          onUnassign={(employeeId) => onUnassignEmployee?.(task, employeeId)}
        />
      ) : null}
    </>
  );
}

export default function WorkspaceCalendar({
  employees = [],
  error = "",
  groups = [],
  isLoading = false,
  onSkillCreate,
  onTaskAiAssign,
  onTaskArchive,
  onTaskAssignEmployee,
  onTaskCreate,
  onTaskDelete,
  onTaskUnassignEmployee,
  onTaskUpdate,
  skills = [],
  tasks = [],
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editingTask, setEditingTask] = useState(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

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
        .map((task) => {
          const assignees = (task.assigneeIds ?? [])
            .map((userId) => employeesById.get(userId))
            .filter(Boolean);

          return {
            task: { ...task, assignees },
            range: getTaskRange(task),
          };
        })
        .filter(({ range }) => range && range.end > weekStart && range.start < weekEnd),
    [employeesById, tasks, weekEnd, weekStart],
  );

  const sameDayTasks = useMemo(
    () => scheduledTasks.filter(({ range }) => isSameDay(range.start, range.end)),
    [scheduledTasks],
  );

  // Sorted so tasks starting soonest lead the list, regardless of week nav.
  const multiDayTasks = useMemo(
    () =>
      scheduledTasks
        .filter(({ range }) => !isSameDay(range.start, range.end))
        .sort((a, b) => a.range.start.getTime() - b.range.start.getTime()),
    [scheduledTasks],
  );

  const { rowHeights, sameDayByDay } = useMemo(() => {
    const sameDay = new Map();

    sameDayTasks.forEach(({ task, range }) => {
      const clippedStart = range.start < weekStart ? weekStart : range.start;
      const startOffsetMs = clippedStart.getTime() - weekStart.getTime();
      const startDayIndex = Math.min(6, Math.floor(startOffsetMs / DAY_MS));
      const dayStartMs = weekStart.getTime() + startDayIndex * DAY_MS;

      let startHour = (clippedStart.getTime() - dayStartMs) / (60 * 60 * 1000);
      let endHour = Math.max(
        startHour + 0.5,
        (Math.min(range.end.getTime(), dayStartMs + DAY_MS) - dayStartMs) / (60 * 60 * 1000),
      );

      if (range.isAllDay) {
        startHour = 0;
        endHour = 24;
      }

      const list = sameDay.get(startDayIndex) ?? [];
      list.push({
        endHour,
        endMs: dayStartMs + endHour * 3600000,
        startHour,
        startMs: clippedStart.getTime(),
        task,
      });
      sameDay.set(startDayIndex, list);
    });

    const laneCountByDay = days.map((_, dayIndex) => {
      const items = sameDay.get(dayIndex) ?? [];
      const laned = assignLanes(items);
      sameDay.set(dayIndex, laned);
      return laned[0]?.laneCount ?? 0;
    });

    const heights = laneCountByDay.map((laneCount) => {
      if (laneCount === 0) return MIN_ROW_HEIGHT;
      const contentHeight = laneCount * PILL_HEIGHT + (laneCount - 1) * PILL_GAP;
      return Math.max(MIN_ROW_HEIGHT, ROW_PADDING * 2 + contentHeight);
    });

    return { rowHeights: heights, sameDayByDay: sameDay };
  }, [days, sameDayTasks, weekStart]);

  function goToPreviousWeek() {
    setWeekStart((current) => addDays(current, -7));
  }

  function goToNextWeek() {
    setWeekStart((current) => addDays(current, 7));
  }

  async function handleTaskSave(task, updates) {
    if (task?.isNew) {
      await onTaskCreate?.(updates);
      return;
    }

    await onTaskUpdate?.(task, updates);
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
          <span className="min-w-28 text-center">{monthLabel}</span>
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
          {/* Hour header row (sticky) */}
          <div className="sticky top-0 z-20 flex bg-gray-100">
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

          {/* Day rows */}
          <div className="relative">
            {days.map((day, dayIndex) => {
              const dayPills = sameDayByDay.get(dayIndex) ?? [];
              const isToday = isSameDay(day, today);

              return (
                <div
                  key={day.toISOString()}
                  className="flex border-t border-[#E0E5E9]"
                  style={{ height: `${rowHeights[dayIndex]}px` }}
                >
                  <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 py-2">
                    <span className="text-[10px] font-semibold tracking-wide text-[#98a2b3]">
                      {DAY_LABELS[dayIndex]}
                    </span>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-medium ${
                        isToday ? "bg-[#1E40AF] text-white" : "text-[#1f2937]"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="pointer-events-none relative flex-1">
                    {/* Grid lines */}
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

                    {/* Pills */}
                    <div className="pointer-events-none absolute inset-0 z-20">
                      {dayPills.map((pill) => (
                        <TaskPill
                          key={pill.task.task_id}
                          employees={employees}
                          groupName={groupsById.get(pill.task.group_id)?.group_name ?? "Ungrouped"}
                          onAiAssign={onTaskAiAssign}
                          onAssignEmployee={onTaskAssignEmployee}
                          onOpen={setEditingTask}
                          onUnassignEmployee={onTaskUnassignEmployee}
                          task={pill.task}
                          tasks={tasks}
                          style={{
                            left: `${(pill.startHour / 24) * 100}%`,
                            width: `max(${((pill.endHour - pill.startHour) / 24) * 100}%, ${PILL_MIN_WIDTH}px)`,
                            top: `${ROW_PADDING + pill.laneIndex * (PILL_HEIGHT + PILL_GAP)}px`,
                            height: `${PILL_HEIGHT}px`,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="w-3 shrink-0" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {multiDayTasks.length ? (
        <div className="mt-3 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {multiDayTasks.map(({ task, range }) => (
              <MultiDayTaskPill
                key={task.task_id}
                employees={employees}
                groupName={groupsById.get(task.group_id)?.group_name ?? "Ungrouped"}
                onAiAssign={onTaskAiAssign}
                onAssignEmployee={onTaskAssignEmployee}
                onOpen={setEditingTask}
                onUnassignEmployee={onTaskUnassignEmployee}
                range={range}
                task={task}
                tasks={tasks}
              />
            ))}
          </div>
        </div>
      ) : null}

      {editingTask ? (
        <TaskEditPanel
          key={editingTask?.task_id ?? "new"}
          groups={groups}
          skills={skills}
          task={editingTask}
          onArchive={onTaskArchive}
          onClose={() => setEditingTask(null)}
          onDelete={onTaskDelete}
          onSave={handleTaskSave}
          onSkillCreate={onSkillCreate}
        />
      ) : null}
    </div>
  );
}
