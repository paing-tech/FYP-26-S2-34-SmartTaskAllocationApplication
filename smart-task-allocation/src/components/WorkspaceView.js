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
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
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

  useEffect(() => {
    let isCurrent = true;

    async function loadInitialData() {
      setError("");
      setIsLoading(true);

      try {
        const headers = await authHeaders();
        const [workspacesResponse, employeesResponse] = await Promise.all([
          fetch("/api/workspaces", { headers }),
          fetch("/api/employees", { headers }),
        ]);
        const [workspacesResult, employeesResult] = await Promise.all([
          workspacesResponse.json(),
          employeesResponse.json(),
        ]);

        if (!workspacesResponse.ok) {
          throw new Error(workspacesResult.error || "Could not load workspaces.");
        }

        if (!employeesResponse.ok) {
          throw new Error(employeesResult.error || "Could not load employees.");
        }

        if (!isCurrent) return;

        const nextWorkspaces = workspacesResult.workspaces ?? [];
        const nextWorkspaceId = selectedWorkspaceId || nextWorkspaces[0]?.workspace_id || "";

        setWorkspaces(nextWorkspaces);
        setSelectedWorkspaceId(nextWorkspaceId);
        setEmployees(employeesResult.employees ?? []);

        if (!nextWorkspaceId) {
          setIsLoading(false);
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError.message);
          setIsLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadWorkspaceData() {
      if (!selectedWorkspaceId) {
        setTasks([]);
        setGroups([]);
        setIsLoading(false);
        return;
      }

      setError("");
      setIsLoading(true);

      try {
        const headers = await authHeaders();
        const [tasksResponse, groupsResponse] = await Promise.all([
          fetch(`/api/tasks?workspaceId=${selectedWorkspaceId}`, { headers }),
          fetch(`/api/task-groups?workspaceId=${selectedWorkspaceId}`, { headers }),
        ]);
        const [tasksResult, groupsResult] = await Promise.all([
          tasksResponse.json(),
          groupsResponse.json(),
        ]);

        if (!tasksResponse.ok) {
          throw new Error(tasksResult.error || "Could not load tasks.");
        }

        if (!groupsResponse.ok) {
          throw new Error(groupsResult.error || "Could not load task groups.");
        }

        if (!isCurrent) return;

        setTasks(tasksResult.tasks ?? []);
        setGroups(groupsResult.groups ?? []);
        setIsLoading(false);
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError.message);
          setIsLoading(false);
        }
      }
    }

    loadWorkspaceData();

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.workspace_id === selectedWorkspaceId) ?? null;

  async function renameGroup(groupId, groupName) {
    const cleanName = groupName.trim();

    if (!groupId || !cleanName) {
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* View switcher */}
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
            currentWorkspace={selectedWorkspace}
            employees={employees}
            error={error}
            groups={groups}
            isLoading={isLoading}
            tasks={tasks}
          />
        ) : (
          <WorkspaceBoard
            currentWorkspace={selectedWorkspace}
            employees={employees}
            error={error}
            groups={groups}
            isLoading={isLoading}
            onGroupRename={renameGroup}
            onTaskUpdate={updateTask}
            tasks={tasks}
          />
        )}
      </div>
    </div>
  );
}
