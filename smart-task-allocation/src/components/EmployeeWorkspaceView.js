"use client";

import { useEffect, useMemo, useState } from "react";
import { TaskCard, TaskViewPanel, enrichTaskWithPeople } from "@/components/WorkspaceBoard";
import Portal from "@/components/Portal";
import TaskHistory from "@/components/TaskHistory";
import TaskTimeline from "@/components/TaskTimeline";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

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

function ActivityLogPreview({ activity = [], onReload }) {
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
                <span className="max-w-35 truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                  {entry.assignedBy}
                </span>
                <span className="text-[#52627a]">assigned</span>
                <span className="max-w-60 truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                  {entry.taskTitle || "Task"}
                </span>
                <span className="text-[#52627a]">to you</span>
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
                onClose={async () => {
                  setIsExpanded(false);
                  await onReload?.();
                }}
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
  const [employees, setEmployees] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );
  const enrichedTasks = useMemo(
    () => tasks.map((task) => enrichTaskWithPeople(task, employeesById)),
    [tasks, employeesById],
  );
  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return enrichedTasks;
    return enrichedTasks.filter((task) => (task.title || "").toLowerCase().includes(query));
  }, [enrichedTasks, searchQuery]);
  const currentEditingTask = editingTask
    ? enrichedTasks.find((task) => task.task_id === editingTask.task_id) ?? null
    : null;

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

      // Completed tasks move to Task History — take it off the active board
      // and close its detail panel if it was open.
      setTasks((current) => current.filter((currentTask) => currentTask.task_id !== task.task_id));
      setEditingTask(null);

      const activityResponse = await fetch("/api/employee-activity", { headers: await authHeaders() });
      const activityResult = await activityResponse.json();
      if (activityResponse.ok) {
        setActivity(activityResult.activity ?? []);
      } else {
        setError(activityResult.error || "Could not refresh task history.");
      }
    } catch (completeError) {
      setError(completeError.message);
      throw completeError;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 shrink-0">
        <div className="relative flex items-center justify-center">
          <h1 className="text-2xl font-black text-[#0D1E4C]">My Tasks</h1>
          <div className="absolute right-0 flex items-center gap-2 rounded-full border border-white/70 bg-white/35 px-3.5 py-2 shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl">
            <span className="material-symbols-outlined text-lg text-[#0D1E4C]" aria-hidden="true">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search for tasks"
              className="w-44 bg-transparent text-sm font-semibold text-[#0D1E4C] outline-none placeholder:text-[#94a3b8]"
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
                onOpen={setEditingTask}
                task={task}
                tasks={tasks}
                viewOnly
              />
            </div>
          ))}

          {!filteredTasks.length && !isLoading ? (
            <div className="flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd5e1] px-6 py-16 text-center text-sm font-bold text-[#94a3b8]">
              {searchQuery.trim() ? "No tasks match your search." : "No tasks assigned to you."}
            </div>
          ) : null}
        </div>

        <TaskTimeline employees={employees} onOpen={setEditingTask} tasks={filteredTasks} />
      </div>

      <ActivityLogPreview activity={activity} onReload={loadWorkspaceData} />

      {currentEditingTask ? (
        <TaskViewPanel
          employees={employees}
          onClose={() => setEditingTask(null)}
          onComplete={completeTask}
          task={currentEditingTask}
        />
      ) : null}
    </div>
  );
}
