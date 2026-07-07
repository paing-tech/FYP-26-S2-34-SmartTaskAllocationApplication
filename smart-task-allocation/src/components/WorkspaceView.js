"use client";

import { useEffect, useState } from "react";
import WorkspaceCalendar from "@/components/WorkspaceCalendar";
import WorkspaceBoard from "@/components/WorkspaceBoard";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const VIEWS = [
  { id: "calendar", label: "Calendar" },
  { id: "board", label: "Board" },
];

export default function WorkspaceView() {
  const [view, setView] = useState("calendar");
  const [tasks, setTasks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
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
      const [tasksResponse, groupsResponse, employeesResponse] = await Promise.all([
        fetch("/api/tasks", { headers }),
        fetch("/api/task-groups", { headers }),
        fetch("/api/employees", { headers }),
      ]);
      const [tasksResult, groupsResult, employeesResult] = await Promise.all([
        tasksResponse.json(),
        groupsResponse.json(),
        employeesResponse.json(),
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
      <div className="mb-4 flex shrink-0 justify-center">
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
            isLoading={isLoading}
            onGroupCreate={createGroup}
            onGroupRename={renameGroup}
            onTaskCreate={createTask}
            onTaskUpdate={updateTask}
            tasks={tasks}
          />
        )}
      </div>
    </div>
  );
}
