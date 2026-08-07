"use client";

import { useEffect, useState } from "react";
import WorkspaceBoard from "@/components/WorkspaceBoard";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const COLUMN_LAYOUT_STORAGE_KEY = "optima-board-columns";

// Material Symbols only ships "view_column" (3 bars). These 4/5-bar variants
// reuse its exact outer frame and gap so they read as the same icon family.
const COLUMN_LAYOUT_OPTIONS = [
  {
    count: 3,
    description: "3 large task groups",
    path: "M200-280h133v-400H200v400ZM413-280h133v-400H413v400ZM626-280h133v-400H626v400Z",
  },
  {
    count: 4,
    description: "4 task groups (default)",
    path: "M200-280h80v-400H200v400ZM360-280h80v-400H360v400ZM520-280h80v-400H520v400ZM680-280h80v-400H680v400Z",
  },
  {
    count: 5,
    description: "5 compact task groups",
    path: "M200-280h48v-400H200v400ZM328-280h48v-400H328v400ZM456-280h48v-400H456v400ZM584-280h48v-400H584v400ZM712-280h48v-400H712v400Z",
  },
];

const COLUMN_ICON_FRAME =
  "M121-280v-400q0-33 23.5-56.5T201-760h559q33 0 56.5 23.5T840-680v400q0 33-23.5 56.5T760-200H201q-33 0-56.5-23.5T121-280Z";

function ColumnLayoutIcon({ count, className = "h-5 w-5" }) {
  const option = COLUMN_LAYOUT_OPTIONS.find((item) => item.count === count) ?? COLUMN_LAYOUT_OPTIONS[1];

  return (
    <svg viewBox="0 -960 960 960" className={className} fill="currentColor" aria-hidden="true">
      <path d={COLUMN_ICON_FRAME + option.path} fillRule="evenodd" />
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

function ActivityLogPreview({ activity = [] }) {
  const [startIndex, setStartIndex] = useState(0);
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
    <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-white/60 bg-white/30 shadow-sm backdrop-blur-sm">
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
  );

  return (
    <section className="mt-4 shrink-0 rounded-full border border-white/50 bg-white/20 px-4 py-2.5 shadow-[0_18px_50px_rgba(13,30,76,0.12)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {entry ? (
          <article className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/50 bg-white/30 px-3.5 py-2 text-sm backdrop-blur-sm">
            <span className="text-[#52627a]">You marked</span>
            <span className="max-w-60 truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
              {entry.taskTitle || "Task"}
            </span>
            <span className="text-[#52627a]">as</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
              {entry.toStatus}
            </span>
            <span className="ml-auto shrink-0 text-[#94a3b8]">{formatRelativeTime(entry.changedAt)}</span>
          </article>
        ) : (
          <div className="flex-1 rounded-full border border-dashed border-white/60 bg-white/20 px-3.5 py-2 text-sm font-bold text-[#94a3b8]">
            No activity yet.
          </div>
        )}

        {controls}
      </div>
    </section>
  );
}

export default function EmployeeWorkspaceView() {
  const [columnLayout, setColumnLayoutState] = useState(4);
  const [tasks, setTasks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
        throw new Error(tasksResult.error || "Could not load workspace.");
      }

      setTasks(tasksResult.tasks ?? []);
      setGroups(tasksResult.groups ?? []);
      setEmployees(tasksResult.employees ?? []);
      setActivity(activityResponse.ok ? activityResult.activity ?? [] : []);
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

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only API on mount
    if ([3, 4, 5].includes(stored)) setColumnLayoutState(stored);
  }, []);

  function selectColumnLayout(count) {
    setColumnLayoutState(count);
    window.localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY, String(count));
  }

  async function completeTask(task) {
    if (!task?.task_id) return;

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((currentTask) =>
        currentTask.task_id === task.task_id ? { ...currentTask, status: "Completed" } : currentTask,
      ),
    );
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

      const activityResponse = await fetch("/api/employee-activity", { headers: await authHeaders() });
      const activityResult = await activityResponse.json();
      if (activityResponse.ok) {
        setActivity(activityResult.activity ?? []);
      }
    } catch (completeError) {
      setTasks(previousTasks);
      setError(completeError.message);
      throw completeError;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative mb-4 flex shrink-0 items-center justify-center">
        <h1 className="text-2xl font-black text-[#0D1E4C]">My Workspace</h1>
        <div className="absolute right-0 flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-full border border-white/70 bg-white/35 px-1 py-1.5 shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl">
            {COLUMN_LAYOUT_OPTIONS.map((option) => {
              const isSelected = option.count === columnLayout;

              return (
                <button
                  type="button"
                  key={option.count}
                  onClick={() => selectColumnLayout(option.count)}
                  aria-label={`${option.count} columns`}
                  aria-pressed={isSelected}
                  title={`${option.count} columns — ${option.description}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                    isSelected ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
                  }`}
                >
                  <ColumnLayoutIcon count={option.count} className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <WorkspaceBoard
          columnLayout={columnLayout}
          employees={employees}
          error={error}
          groups={groups}
          isLoading={isLoading}
          onTaskComplete={completeTask}
          tasks={tasks}
          viewOnly
        />
      </div>

      <ActivityLogPreview activity={activity} />
    </div>
  );
}
