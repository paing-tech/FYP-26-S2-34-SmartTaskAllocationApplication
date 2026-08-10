"use client";

import { useEffect, useMemo, useState } from "react";
import { TaskCard, TaskViewPanel, enrichTaskWithPeople } from "@/components/WorkspaceBoard";
import Portal from "@/components/Portal";
import TaskHistory from "@/components/TaskHistory";
import TaskTimeline from "@/components/TaskTimeline";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PRIORITY_FILTERS = [
  { label: "High", value: "high", tone: "red" },
  { label: "Medium", value: "medium", tone: "orange" },
  { label: "Low", value: "low", tone: "green" },
  { label: "Urgent", value: "urgent", tone: "rose" },
];

function isSameLocalDay(value, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function isTaskOverdue(task, reference = new Date()) {
  if (!task.end_datetime) return false;
  const status = String(task.status || "").toLowerCase();
  if (status === "completed" || status === "cancelled") return false;
  const end = new Date(task.end_datetime);
  return !Number.isNaN(end.getTime()) && end.getTime() < reference.getTime();
}

function InsightPill({ active = false, label, onClick, value, progress = 1, tone = "blue" }) {
  const safeProgress = Math.max(0, Math.min(1, progress));
  const ringColors = {
    blue: "#2563EB",
    green: "#22c55e",
    orange: "#f59e0b",
    purple: "#7C3AED",
    red: "#ef4444",
    rose: "#ef4444",
  };
  const ringColor = ringColors[tone] ?? ringColors.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        borderColor: active ? `${ringColor}80` : undefined,
        boxShadow: active ? `0 0 0 2px ${ringColor}33` : undefined,
      }}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[#0D1E4C] shadow-sm backdrop-blur-xl transition hover:bg-white/50 ${
        active ? "bg-white/70" : "border-white/60 bg-white/25"
      }`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
        style={{ background: `conic-gradient(${ringColor} ${safeProgress * 360}deg, rgba(255,255,255,0.45) 0deg)` }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80">{value}</span>
      </span>
      <span className="whitespace-nowrap text-xs font-black">{label}</span>
    </button>
  );
}

function RefreshIcon({ spinning }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function formatRelativeTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function ActivityLogPreview({ activity = [], completedTasks = [], employees = [], onReload, onReopenTask }) {
  const [startIndex, setStartIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const entry = activity[startIndex] ?? null;
  const canShowNewer = startIndex > 0;
  const canShowOlder = startIndex + 1 < activity.length;

  useEffect(() => {
    queueMicrotask(() => setStartIndex(0));
  }, [activity]);

  function showNewer() {
    setStartIndex((current) => Math.max(0, current - 1));
  }

  function showOlder() {
    setStartIndex((current) => Math.min(Math.max(activity.length - 1, 0), current + 1));
  }

  const controls = (
    <div className="flex shrink-0 items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-full border border-white/60 bg-white/30 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={showNewer}
          disabled={!canShowNewer}
          className="flex h-7 w-8 items-center justify-center text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Show newer activity"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            keyboard_arrow_up
          </span>
        </button>
        <div className="w-px bg-white/60" />
        <button
          type="button"
          onClick={showOlder}
          disabled={!canShowOlder}
          className="flex h-7 w-8 items-center justify-center text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Show older activity"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            keyboard_arrow_down
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="flex h-7 w-8 items-center justify-center rounded-full border border-white/60 bg-white/30 text-[#0D1E4C] shadow-sm backdrop-blur-sm transition hover:bg-white/60"
        aria-label="Expand task history"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          expand_content
        </span>
      </button>
    </div>
  );

  return (
    <section className="mt-4 shrink-0 rounded-full border border-white/50 bg-white/20 px-4 py-2.5 shadow-[0_18px_50px_rgba(13,30,76,0.12)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {entry ? (
          <article className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/50 bg-white/30 px-3.5 py-2 text-sm backdrop-blur-sm">
            {entry.type === "assignment" ? (
              <>
                <span className="text-[#52627a]">You were assigned</span>
                <span className="max-w-60 truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                  {entry.taskTitle || "Task"}
                </span>
                <span className="text-[#52627a]">by</span>
                <span className="max-w-35 truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                  {entry.assignedBy}
                </span>
              </>
            ) : (
              <>
                <span className="text-[#52627a]">You marked</span>
                <span className="max-w-60 truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                  {entry.taskTitle || "Task"}
                </span>
                <span className="text-[#52627a]">as</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
                  {entry.toStatus}
                </span>
              </>
            )}
            <span className="ml-auto shrink-0 text-[#94a3b8]">{formatRelativeTime(entry.occurredAt)}</span>
          </article>
        ) : (
          <div className="flex-1 rounded-full border border-dashed border-white/60 bg-white/20 px-3.5 py-2 text-sm font-bold text-[#94a3b8]">
            No activity yet.
          </div>
        )}

        {controls}
      </div>

      {isExpanded ? (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-transparent p-4 backdrop-blur-lg"
            onClick={() => setIsExpanded(false)}
          >
            <div
              className="h-full max-h-[calc(80vh-4rem)] w-full max-w-7xl overflow-hidden rounded-[28px] border border-white/60 bg-white/60 backdrop-blur-3xl p-8 shadow-[0_28px_80px_rgba(0,0,0,0.3)]"
              onClick={(event) => event.stopPropagation()}
            >
              <TaskHistory
                activity={activity}
                completedTasks={completedTasks}
                employees={employees}
                onClose={async () => {
                  setIsExpanded(false);
                  await onReload?.();
                }}
                onReopenTask={onReopenTask}
              />
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}

export default function EmployeeWorkspaceView() {
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editingTaskPanel, setEditingTaskPanel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );
  const enrichedTasks = useMemo(
    () => tasks.map((task) => enrichTaskWithPeople(task, employeesById)),
    [tasks, employeesById],
  );
  const enrichedCompletedTasks = useMemo(
    () => completedTasks.map((task) => enrichTaskWithPeople(task, employeesById)),
    [completedTasks, employeesById],
  );
  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return enrichedTasks.filter((task) => {
      if (query && !(task.title || "").toLowerCase().includes(query)) return false;
      if (taskFilter === "due-today" && !isSameLocalDay(task.end_datetime)) return false;
      if (taskFilter === "overdue" && !isTaskOverdue(task)) return false;
      if (priorityFilter !== "all" && String(task.priority || "medium").toLowerCase() !== priorityFilter) return false;
      return true;
    });
  }, [enrichedTasks, priorityFilter, searchQuery, taskFilter]);
  const currentEditingTask = editingTask
    ? enrichedTasks.find((task) => task.task_id === editingTask.task_id) ?? null
    : null;
  const totalTasks = enrichedTasks.length;
  const dueTodayCount = enrichedTasks.filter((task) => isSameLocalDay(task.end_datetime)).length;
  const overdueCount = enrichedTasks.filter((task) => isTaskOverdue(task)).length;

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function loadWorkspaceData() {
    setError("");
    setIsLoading(true);

    try {
      const headers = await authHeaders();
      const [tasksResponse, activityResponse] = await Promise.all([
        fetch("/api/employee-tasks", { headers }),
        fetch("/api/employee-activity", { headers }),
      ]);
      const [tasksResult, activityResult] = await Promise.all([
        tasksResponse.json(),
        activityResponse.json(),
      ]);

      if (!tasksResponse.ok) {
        throw new Error(tasksResult.error || "Could not load tasks.");
      }

      setTasks(tasksResult.tasks ?? []);
      setCompletedTasks(tasksResult.completedTasks ?? []);
      setEmployees(tasksResult.employees ?? []);

      if (activityResponse.ok) {
        setActivity(activityResult.activity ?? []);
      } else {
        setActivity([]);
        setError(activityResult.error || "Could not load task history.");
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadWorkspaceData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeTask(task) {
    if (!task?.task_id) return;

    setError("");

    try {
      const response = await fetch("/api/employee-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ taskId: task.task_id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not mark task as completed.");
      }

      // Completed tasks move to Task History — close the detail panel if it
      // was open, then reload everything (tasks, completedTasks, activity)
      // in one pass so they all stay in sync.
      setEditingTask(null);
      await loadWorkspaceData();
    } catch (completeError) {
      setError(completeError.message);
      throw completeError;
    }
  }

  async function refreshWorkspace() {
    setIsRefreshing(true);
    try {
      await loadWorkspaceData();
    } finally {
      setIsRefreshing(false);
    }
  }

  // Inverse of completeTask — reopens a task from Task History's completed
  // list back onto the active board.
  async function reopenTask(task) {
    if (!task?.task_id) return;

    setError("");

    try {
      const response = await fetch("/api/employee-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "reopen", taskId: task.task_id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not reopen task.");
      }

      await loadWorkspaceData();
    } catch (reopenError) {
      setError(reopenError.message);
      throw reopenError;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 shrink-0">
        <div className="flex min-h-11 items-center gap-4">
          <div className="hidden items-center gap-2 xl:flex">
            <InsightPill
              active={taskFilter === "all"}
              label="Total tasks"
              value={totalTasks}
              onClick={() => setTaskFilter("all")}
            />
            <InsightPill
              active={taskFilter === "due-today"}
              label="Due today"
              value={dueTodayCount}
              progress={totalTasks ? dueTodayCount / totalTasks : 0}
              onClick={() => setTaskFilter("due-today")}
            />
            <InsightPill
              active={taskFilter === "overdue"}
              label="Overdue"
              value={overdueCount}
              progress={totalTasks ? overdueCount / totalTasks : 0}
              tone="red"
              onClick={() => setTaskFilter("overdue")}
            />
            {PRIORITY_FILTERS.map((priority) => {
              const isActive = priorityFilter === priority.value;
              const count = enrichedTasks.filter(
                (task) => String(task.priority || "medium").toLowerCase() === priority.value,
              ).length;
              return (
                <InsightPill
                  key={priority.value}
                  active={isActive}
                  label={priority.label}
                  value={count}
                  progress={totalTasks ? count / totalTasks : 0}
                  tone={priority.tone}
                  onClick={() => setPriorityFilter((current) => (current === priority.value ? "all" : priority.value))}
                />
              );
            })}
            <button
              type="button"
              onClick={refreshWorkspace}
              disabled={isRefreshing}
              aria-label="Refresh tasks"
              title="Refresh tasks"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon spinning={isRefreshing} />
            </button>
          </div>
          <div className="relative ml-auto w-72 shrink-0">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#64748B]" aria-hidden="true">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tasks"
              className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
          </div>
        </div>
        {error ? (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-start gap-6 overflow-x-auto px-1 py-3">
          {filteredTasks.map((task) => (
            <div key={task.task_id} className="w-80 shrink-0">
              <TaskCard
                employees={employees}
                onComplete={completeTask}
                onOpen={(clickedTask, targetPanel) => {
                  setEditingTask(clickedTask);
                  setEditingTaskPanel(targetPanel ?? "");
                }}
                task={task}
                tasks={tasks}
                viewOnly
              />
            </div>
          ))}

          {!filteredTasks.length && !isLoading ? (
            <div className="flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd5e1] px-6 py-16 text-center text-sm font-bold text-[#94a3b8]">
              {searchQuery.trim() || taskFilter !== "all" || priorityFilter !== "all"
                ? "No tasks match the current filter."
                : "No tasks assigned to you."}
            </div>
          ) : null}
        </div>

        <TaskTimeline
          employees={employees}
          onOpen={(clickedTask) => {
            setEditingTask(clickedTask);
            setEditingTaskPanel("");
          }}
          tasks={filteredTasks}
        />
      </div>

      <ActivityLogPreview
        activity={activity}
        completedTasks={enrichedCompletedTasks}
        employees={employees}
        onReload={loadWorkspaceData}
        onReopenTask={reopenTask}
      />

      {currentEditingTask ? (
        <TaskViewPanel
          employees={employees}
          initialPanel={editingTaskPanel === "comments" ? "comments" : "details"}
          onClose={() => setEditingTask(null)}
          onComplete={completeTask}
          task={currentEditingTask}
        />
      ) : null}
    </div>
  );
}
