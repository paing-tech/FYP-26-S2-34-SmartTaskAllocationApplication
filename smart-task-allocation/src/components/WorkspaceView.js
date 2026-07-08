"use client";

import { useEffect, useMemo, useState } from "react";
import WorkspaceCalendar from "@/components/WorkspaceCalendar";
import WorkspaceBoard from "@/components/WorkspaceBoard";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const VIEWS = [
  { id: "calendar", label: "Calendar" },
  { id: "board", label: "Board" },
];

function formatHistoryTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${day} at ${time}`;
}

function AllocationHistoryPreview({ allocations = [] }) {
  const [startIndex, setStartIndex] = useState(0);
  const historyItems = useMemo(
    () =>
      allocations
        .map((allocation) => ({
          id: allocation.id,
          assignedBy: allocation.assignedBy || "Manager",
          assignedTo: allocation.assigneeName || "Unknown",
          taskTitle: allocation.taskTitle || "Task",
          time: allocation.assignedAt,
        }))
    [allocations],
  );
  const visibleItems = historyItems.slice(startIndex, startIndex + 4);
  const canShowNewer = startIndex > 0;
  const canShowOlder = startIndex + 4 < historyItems.length;

  useEffect(() => {
    setStartIndex(0);
  }, [allocations]);

  function showNewerRecords() {
    setStartIndex((current) => Math.max(0, current - 1));
  }

  function showOlderRecords() {
    setStartIndex((current) => Math.min(Math.max(historyItems.length - 4, 0), current + 1));
  }

  return (
    <section className="mt-4 shrink-0 rounded-[1.75rem] border border-white/50 bg-white/20 px-5 py-4 shadow-[0_18px_50px_rgba(13,30,76,0.12)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black text-[#0D1E4C]">History</h3>
        <div className="inline-flex overflow-hidden rounded-full border border-white/60 bg-white/30 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={showNewerRecords}
            disabled={!canShowNewer}
            className="flex h-8 w-9 items-center justify-center text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Show newer allocation records"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              keyboard_arrow_up
            </span>
          </button>
          <div className="w-px bg-white/60" />
          <button
            type="button"
            onClick={showOlderRecords}
            disabled={!canShowOlder}
            className="flex h-8 w-9 items-center justify-center text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Show older allocation records"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              keyboard_arrow_down
            </span>
          </button>
        </div>
      </div>

      {visibleItems.length ? (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/50 bg-white/30 px-4 py-3 text-sm backdrop-blur-sm"
            >
              <span className="max-w-[180px] truncate rounded-full border border-[#2563EB]/25 bg-[#2563EB]/10 px-3 py-1 font-bold text-[#1E40AF]">
                {item.assignedTo}
              </span>
              <span className="text-[#52627a]">was assigned to</span>
              <span className="max-w-[260px] truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                {item.taskTitle}
              </span>
              <span className="text-[#52627a]">by</span>
              <span className="max-w-[160px] truncate rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
                {item.assignedBy}
              </span>
              <span className="text-[#52627a]">on {formatHistoryTime(item.time)}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/60 bg-white/20 py-6 text-center text-sm font-bold text-[#94a3b8]">
          No allocation history yet.
        </div>
      )}
    </section>
  );
}

export default function WorkspaceView() {
  const [view, setView] = useState("calendar");
  const [tasks, setTasks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [createTaskRequestKey, setCreateTaskRequestKey] = useState(0);

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
      const [tasksResponse, groupsResponse, employeesResponse, allocationsResponse] = await Promise.all([
        fetch("/api/tasks", { headers }),
        fetch("/api/task-groups", { headers }),
        fetch("/api/employees", { headers }),
        fetch("/api/allocations", { headers }),
      ]);
      const [tasksResult, groupsResult, employeesResult, allocationsResult] = await Promise.all([
        tasksResponse.json(),
        groupsResponse.json(),
        employeesResponse.json(),
        allocationsResponse.json(),
      ]);

      if (!tasksResponse.ok) {
        throw new Error(tasksResult.error || "Could not load tasks.");
      }

      if (!groupsResponse.ok) {
        throw new Error(groupsResult.error || "Could not load task groups.");
      }

      if (!employeesResponse.ok) {
        throw new Error(employeesResult.error || "Could not load employees.");
      }

      if (!allocationsResponse.ok) {
        throw new Error(allocationsResult.error || "Could not load allocation history.");
      }

      let nextGroups = groupsResult.groups ?? [];

      if (!nextGroups.length) {
        const createResponse = await fetch("/api/task-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ groupName: "New" }),
        });
        const createResult = await createResponse.json();

        if (!createResponse.ok) {
          throw new Error(createResult.error || "Could not create default task group.");
        }

        nextGroups = createResult.group ? [createResult.group] : [];
      }

      setTasks(tasksResult.tasks ?? []);
      setGroups(nextGroups);
      setEmployees(employeesResult.employees ?? []);
      setAllocations(allocationsResult.allocations ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function handleOptimusSettingChange(event) {
      const detail = event.detail ?? {};

      if (detail.actor !== "manager" || detail.feature !== "smart_task_creation") {
        return;
      }

      setError("");

      try {
        const response = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            action: "set-ai-task-visibility",
            enabled: Boolean(detail.enabled),
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not update Optimus AI tasks.");
        }

        await loadWorkspaceData();
      } catch (toggleError) {
        setError(toggleError.message);
      }
    }

    window.addEventListener("optima:optimus-setting-change", handleOptimusSettingChange);

    return () => {
      window.removeEventListener("optima:optimus-setting-change", handleOptimusSettingChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function renameGroup(groupId, groupName) {
    const cleanName = groupName.trim();

    if (!groupId || !cleanName || !Number.isFinite(Number(groupId))) {
      return;
    }

    const previousGroups = groups;
    setGroups((current) =>
      current.map((group) =>
        group.group_id === groupId ? { ...group, group_name: cleanName } : group,
      ),
    );
    setError("");

    try {
      const response = await fetch("/api/task-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ groupId, groupName: cleanName }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not rename task group.");
      }
    } catch (renameError) {
      setGroups(previousGroups);
      setError(renameError.message);
    }
  }

  async function createGroup() {
    setError("");

    try {
      const response = await fetch("/api/task-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ groupName: "New Group" }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not create task group.");
      }

      if (result.group) {
        setGroups((current) => [...current, result.group]);
      }

      return result.group ?? null;
    } catch (createError) {
      setError(createError.message);
      throw createError;
    }
  }

  async function updateTask(task, updates) {
    if (!task?.task_id) {
      return;
    }

    const nextTask = {
      ...task,
      title: updates.title,
      description: updates.description || null,
      status: updates.status || "Open",
      priority: updates.priority || "Medium",
      assigned_to: updates.assignedTo || null,
      group_id: updates.groupId ?? null,
      ai_state:
        task.source === "optimus_ai" && !["accepted", "dismissed"].includes(task.ai_state)
          ? "accepted"
          : task.ai_state,
      start_datetime: updates.startDatetime || null,
      end_datetime: updates.endDatetime || null,
      updated_at: new Date().toISOString(),
    };
    const previousTasks = tasks;

    setTasks((current) =>
      current.map((currentTask) =>
        currentTask.task_id === task.task_id ? { ...currentTask, ...nextTask } : currentTask,
      ),
    );
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          taskId: task.task_id,
          title: updates.title,
          description: updates.description,
          assignedTo: updates.assignedTo,
          groupId: updates.groupId,
          status: updates.status,
          priority: updates.priority,
          startDatetime: updates.startDatetime,
          endDatetime: updates.endDatetime,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not update task.");
      }
    } catch (updateError) {
      setTasks(previousTasks);
      setError(updateError.message);
      throw updateError;
    }
  }

  async function createTask(updates) {
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          title: updates.title,
          description: updates.description,
          assignedTo: updates.assignedTo,
          groupId: updates.groupId,
          status: updates.status,
          priority: updates.priority,
          startDatetime: updates.startDatetime,
          endDatetime: updates.endDatetime,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not create task.");
      }

      await loadWorkspaceData();
    } catch (createError) {
      setError(createError.message);
      throw createError;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative mb-4 flex shrink-0 items-center justify-center">
        <div className="inline-flex rounded-full border border-white/60 bg-white/30 p-1 backdrop-blur-sm">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                view === option.id
                  ? "bg-[#0D1E4C] text-white shadow-sm"
                  : "text-[#0D1E4C] hover:bg-white/60"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {view === "board" ? (
          <button
            type="button"
            onClick={() => setCreateTaskRequestKey((current) => current + 1)}
            className="absolute right-0 rounded-full border border-white/70 bg-white/35 px-4 py-2 text-sm font-black text-[#0D1E4C] shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl transition hover:bg-white/70"
          >
            Add task
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {view === "calendar" ? (
          <WorkspaceCalendar
            employees={employees}
            error={error}
            groups={groups}
            isLoading={isLoading}
            tasks={tasks}
          />
        ) : (
          <WorkspaceBoard
            employees={employees}
            error={error}
            groups={groups}
            createTaskRequestKey={createTaskRequestKey}
            isLoading={isLoading}
            onGroupCreate={createGroup}
            onGroupRename={renameGroup}
            onTaskCreate={createTask}
            onTaskUpdate={updateTask}
            tasks={tasks}
          />
        )}
      </div>

      <AllocationHistoryPreview allocations={allocations} />
    </div>
  );
}
