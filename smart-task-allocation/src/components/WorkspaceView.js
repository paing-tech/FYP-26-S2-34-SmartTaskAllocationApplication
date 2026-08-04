"use client";

import { useEffect, useMemo, useState } from "react";
import WorkspaceCalendar from "@/components/WorkspaceCalendar";
import WorkspaceBoard, { AvatarCircle, buildBoardColumns } from "@/components/WorkspaceBoard";
import AllocationHistory from "@/components/AllocationHistory";
import Portal from "@/components/Portal";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const VIEWS = [
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
];

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

function InsightPill({ label, value, detail, progress = 1 }) {
  const safeProgress = Math.max(0, Math.min(1, progress));

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/25 px-3 py-1.5 text-[#0D1E4C] shadow-sm backdrop-blur-xl">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
        style={{
          background: `conic-gradient(#2563EB ${safeProgress * 360}deg, rgba(255,255,255,0.45) 0deg)`,
        }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80">
          {value}
        </span>
      </span>
      <span className="whitespace-nowrap text-xs font-black">
        {label}
        {detail ? <span className="ml-1 text-[#52627a]">{detail}</span> : null}
      </span>
    </div>
  );
}

function AllocationHistoryPreview({ allocations = [], onReassign, onReload }) {
  const [startIndex, setStartIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const historyItems = allocations;
  const allocation = historyItems[startIndex] ?? null;
  const canShowNewer = startIndex > 0;
  const canShowOlder = startIndex + 1 < historyItems.length;
  const byAI = allocation ? /optimus/i.test(allocation.assignedBy ?? "") : false;

  useEffect(() => {
    setStartIndex(0);
  }, [allocations]);

  function showNewerRecords() {
    setStartIndex((current) => Math.max(0, current - 1));
  }

  function showOlderRecords() {
    setStartIndex((current) => Math.min(Math.max(historyItems.length - 1, 0), current + 1));
  }

  // Kept as a sibling of the record pill (not nested inside it) so its
  // position stays fixed on the right regardless of how wide the record's
  // own content runs.
  const controls = (
    <div className="flex shrink-0 items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-full border border-white/60 bg-white/30 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={showNewerRecords}
          disabled={!canShowNewer}
          className="flex h-7 w-8 items-center justify-center text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Show newer allocation records"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            keyboard_arrow_up
          </span>
        </button>
        <div className="w-px bg-white/60" />
        <button
          type="button"
          onClick={showOlderRecords}
          disabled={!canShowOlder}
          className="flex h-7 w-8 items-center justify-center text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Show older allocation records"
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
        aria-label="Expand allocation history"
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
        {allocation ? (
          <article className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/50 bg-white/30 px-3.5 py-2 text-sm backdrop-blur-sm">
            <span className="max-w-40 truncate rounded-full border border-[#2563EB]/25 bg-[#2563EB]/10 px-3 py-1 font-bold text-[#1E40AF]">
              {allocation.assigneeName || "Unknown"}
            </span>
            <span className="text-[#52627a]">was assigned to</span>
            <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 font-bold text-[#0D1E4C]">
              {allocation.taskTitle || "Task"}
            </span>
            <span className="text-[#52627a]">by</span>
            <span
              className={`max-w-35 truncate rounded-full border px-3 py-1 font-bold ${
                byAI
                  ? "border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#5B21B6]"
                  : "border-[#0D1E4C]/15 bg-white/70 text-[#0D1E4C]"
              }`}
            >
              {allocation.assignedBy || "Manager"}
            </span>
            <span className="hidden text-[#52627a] lg:inline">on {formatHistoryTime(allocation.assignedAt)}</span>
            <button
              type="button"
              onClick={async () => {
                if (isReassigning) return;
                setIsReassigning(true);
                try {
                  await onReassign?.(allocation);
                } finally {
                  setIsReassigning(false);
                }
              }}
              disabled={isReassigning}
              className="ml-auto shrink-0 rounded-full border border-[#0a72e8] px-3.5 py-1.5 text-sm font-bold text-[#0a72e8] transition hover:bg-[#0a72e8] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reassign
            </button>
          </article>
        ) : (
          <div className="flex-1 rounded-full border border-dashed border-white/60 bg-white/20 px-3.5 py-2 text-sm font-bold text-[#94a3b8]">
            No allocation history yet.
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
              <AllocationHistory
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

export default function WorkspaceView() {
  const [view, setView] = useState("board");
  const [columnLayout, setColumnLayoutState] = useState(4);
  const [tasks, setTasks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [skills, setSkills] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMissionControlOpen, setIsMissionControlOpen] = useState(false);
  const today = new Date();
  const totalTasks = tasks.length;
  const dueTodayCount = tasks.filter((task) => isSameLocalDay(task.end_datetime, today)).length;

  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );

  // Same grouping WorkspaceBoard uses for its columns, reused here so the
  // quick-view overlay always matches the real board layout exactly.
  const missionControlColumns = useMemo(() => {
    const columns = buildBoardColumns({ groups, tasks });
    return columns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => ({
        ...task,
        assignees: (task.assigneeIds ?? []).map((userId) => employeesById.get(userId)).filter(Boolean),
      })),
    }));
  }, [groups, tasks, employeesById]);

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
      const [
        tasksResponse,
        groupsResponse,
        employeesResponse,
        allocationsResponse,
        skillsResponse,
      ] = await Promise.all([
        fetch("/api/tasks", { headers }),
        fetch("/api/task-groups", { headers }),
        fetch("/api/employees", { headers }),
        fetch("/api/allocations", { headers }),
        fetch("/api/skills", { headers }),
      ]);
      const [
        tasksResult,
        groupsResult,
        employeesResult,
        allocationsResult,
        skillsResult,
      ] = await Promise.all([
        tasksResponse.json(),
        groupsResponse.json(),
        employeesResponse.json(),
        allocationsResponse.json(),
        skillsResponse.json(),
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
      setSkills(skillsResponse.ok ? skillsResult.skills ?? [] : []);
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
    const stored = Number(window.localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only API on mount
    if ([3, 4, 5].includes(stored)) setColumnLayoutState(stored);
  }, []);

  function selectColumnLayout(count) {
    setColumnLayoutState(count);
    window.localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY, String(count));
  }

  useEffect(() => {
    async function handleOptimusSettingChange(event) {
      const detail = event.detail ?? {};

      if (detail.actor !== "manager") {
        return;
      }

      const actionByFeature = {
        smart_task_creation: "set-ai-task-visibility",
        smart_task_allocation: "auto-allocate-tasks",
      };
      const action = actionByFeature[detail.feature];

      if (!action) {
        return;
      }

      setError("");

      try {
        const response = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            action,
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

  // TopInformationBar performs the refresh-smart-tasks call itself (so it can
  // show the result inline in its own panel) and just tells the board to
  // reload once new tasks may have landed.
  useEffect(() => {
    function handleTasksRefreshed() {
      loadWorkspaceData();
    }

    window.addEventListener("optima:tasks-refreshed", handleTasksRefreshed);

    return () => {
      window.removeEventListener("optima:tasks-refreshed", handleTasksRefreshed);
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

  // Deleting a group either migrates its tasks to a new group (migrateToGroupId)
  // or deletes the tasks along with it (deleteTasks); omitting both just detaches
  // the tasks (group_id -> null), matching the API's default behavior.
  async function deleteGroup(groupId, { migrateToGroupId, deleteTasks } = {}) {
    setError("");

    try {
      const params = new URLSearchParams({ groupId: String(groupId) });
      if (migrateToGroupId) params.set("migrateToGroupId", String(migrateToGroupId));
      if (deleteTasks) params.set("deleteTasks", "true");

      const response = await fetch(`/api/task-groups?${params.toString()}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete group.");
      }

      await loadWorkspaceData();
    } catch (deleteError) {
      setError(deleteError.message);
      throw deleteError;
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
      group_id: updates.groupId ?? null,
      requiredSkills: skills.filter((skill) =>
        (updates.requiredSkillIds ?? []).includes(skill.skill_id),
      ),
      ...(updates.assignedTo !== undefined ? { assigned_to: updates.assignedTo || null } : {}),
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
          groupId: updates.groupId,
          status: updates.status,
          priority: updates.priority,
          startDatetime: updates.startDatetime,
          endDatetime: updates.endDatetime,
          requiredSkillIds: updates.requiredSkillIds,
          assignedTo: updates.assignedTo,
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

  async function archiveTask(task) {
    if (!task?.task_id) {
      return;
    }

    const previousTasks = tasks;
    setTasks((current) => current.filter((currentTask) => currentTask.task_id !== task.task_id));
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          taskId: task.task_id,
          title: task.title,
          description: task.description,
          groupId: task.group_id,
          status: "Archived",
          priority: task.priority,
          startDatetime: task.start_datetime,
          endDatetime: task.end_datetime,
          requiredSkillIds: (task.requiredSkills ?? []).map((skill) => skill.skill_id),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not archive task.");
      }
    } catch (archiveError) {
      setTasks(previousTasks);
      setError(archiveError.message);
      throw archiveError;
    }
  }

  async function deleteTask(task) {
    if (!task?.task_id) {
      return;
    }

    const previousTasks = tasks;
    setTasks((current) => current.filter((currentTask) => currentTask.task_id !== task.task_id));
    setError("");

    try {
      const response = await fetch(`/api/tasks?taskId=${task.task_id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete task.");
      }
    } catch (deleteError) {
      setTasks(previousTasks);
      setError(deleteError.message);
      throw deleteError;
    }
  }

  // Tasks support multiple current assignees (task_assignee), independent of
  // the rest of the task-edit form — so these update just the assignee list
  // optimistically, without touching title/description/etc.
  async function assignEmployeeToTask(task, employeeId) {
    if (!task?.task_id || !employeeId) return;

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((currentTask) =>
        currentTask.task_id === task.task_id
          ? {
              ...currentTask,
              assigneeIds: [...new Set([...(currentTask.assigneeIds ?? []), employeeId])],
            }
          : currentTask,
      ),
    );
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "assign-employee", taskId: task.task_id, userId: employeeId }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not assign employee.");
      }
    } catch (assignError) {
      setTasks(previousTasks);
      setError(assignError.message);
      throw assignError;
    }
  }

  async function unassignEmployeeFromTask(task, employeeId) {
    if (!task?.task_id || !employeeId) return;

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((currentTask) =>
        currentTask.task_id === task.task_id
          ? {
              ...currentTask,
              assigneeIds: (currentTask.assigneeIds ?? []).filter((id) => id !== employeeId),
            }
          : currentTask,
      ),
    );
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "unassign-employee", taskId: task.task_id, userId: employeeId }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not remove assignee.");
      }
    } catch (unassignError) {
      setTasks(previousTasks);
      setError(unassignError.message);
      throw unassignError;
    }
  }

  // Lets Optimus AI pick the assignee (skill/history/department match) for
  // one task on demand. Which employee gets picked isn't known until the
  // server responds, so this isn't optimistic — it patches assigneeIds in
  // once the match comes back instead of guessing beforehand.
  async function aiAssignTask(task) {
    if (!task?.task_id) return;

    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "ai-assign-task", taskId: task.task_id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not find an AI match for this task.");
      }

      setTasks((current) =>
        current.map((currentTask) =>
          currentTask.task_id === task.task_id
            ? {
                ...currentTask,
                assigneeIds: [...new Set([...(currentTask.assigneeIds ?? []), result.employeeId])],
              }
            : currentTask,
        ),
      );

      return result.employeeId;
    } catch (aiAssignError) {
      setError(aiAssignError.message);
      throw aiAssignError;
    }
  }

  async function recreateTaskFromAllocation(allocation) {
    if (!allocation?.taskTitle || !allocation?.assigneeUserId) return;

    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          title: allocation.taskTitle,
          description: allocation.taskDescription,
          groupId: allocation.groupId,
          status: allocation.taskStatus || "Open",
          priority: allocation.priority || "Medium",
          startDatetime: allocation.startDatetime,
          endDatetime: allocation.endDatetime,
          assignedTo: allocation.assigneeUserId,
          assignedBy: allocation.assignedBy,
          requiredSkillIds: allocation.requiredSkillIds ?? [],
          reasons: allocation.reasons,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not recreate task.");
      }

      await loadWorkspaceData();
    } catch (reassignError) {
      setError(reassignError.message);
      throw reassignError;
    }
  }

  // Approving an Optimus AI suggestion turns it into a real task (ai_state
  // "accepted"), which the visibility toggle and GET /api/tasks both already
  // treat as exempt from hiding — see set-ai-task-visibility / visibleTasks.
  async function approveAiTask(task) {
    if (!task?.task_id) return;

    const previousTasks = tasks;
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "approve-ai-task", taskId: task.task_id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not approve task.");
      }

      setTasks((current) =>
        current.map((currentTask) =>
          currentTask.task_id === task.task_id
            ? {
                ...currentTask,
                ai_state: "accepted",
                reasons: {
                  ...(currentTask.reasons ?? {}),
                  approvedBy: result.approvedBy,
                  approvedAt: result.approvedAt,
                },
              }
            : currentTask,
        ),
      );
    } catch (approveError) {
      setTasks(previousTasks);
      setError(approveError.message);
      throw approveError;
    }
  }

  // Rejecting deletes the AI-generated suggestion outright — it was never a
  // committed task, so there's nothing to keep around.
  async function rejectAiTask(task) {
    if (!task?.task_id) return;

    const previousTasks = tasks;
    setTasks((current) => current.filter((currentTask) => currentTask.task_id !== task.task_id));
    setError("");

    try {
      const response = await fetch(`/api/tasks?taskId=${task.task_id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not reject task.");
      }
    } catch (rejectError) {
      setTasks(previousTasks);
      setError(rejectError.message);
      throw rejectError;
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
          groupId: updates.groupId,
          status: updates.status,
          priority: updates.priority,
          startDatetime: updates.startDatetime,
          endDatetime: updates.endDatetime,
          requiredSkillIds: updates.requiredSkillIds,
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

  async function createSkill(skillName) {
    const response = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ skillName }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not create skill.");
    }

    setSkills((current) =>
      current.some((skill) => skill.skill_id === result.skill.skill_id)
        ? current
        : [...current, result.skill].sort((a, b) => a.skill_name.localeCompare(b.skill_name)),
    );

    return result.skill;
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
          <div className="absolute right-0 flex items-center gap-2">
            <div className="hidden items-center gap-2 xl:flex">
              <InsightPill label="Total tasks" value={totalTasks} />
              <InsightPill
                label="Due today"
                value={dueTodayCount}
                progress={totalTasks ? dueTodayCount / totalTasks : 0}
              />
            </div>
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
            <button
              type="button"
              onClick={() => setIsMissionControlOpen(true)}
              aria-label="Open quick view"
              title="Quick view"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/35 text-[#0D1E4C] shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl transition hover:bg-white/60"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                view_compact_alt
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {view === "calendar" ? (
          <WorkspaceCalendar
            employees={employees}
            error={error}
            groups={groups}
            isLoading={isLoading}
            onSkillCreate={createSkill}
            onTaskAiAssign={aiAssignTask}
            onTaskArchive={archiveTask}
            onTaskAssignEmployee={assignEmployeeToTask}
            onTaskCreate={createTask}
            onTaskDelete={deleteTask}
            onTaskUnassignEmployee={unassignEmployeeFromTask}
            onTaskUpdate={updateTask}
            skills={skills}
            tasks={tasks}
          />
        ) : (
          <WorkspaceBoard
            columnLayout={columnLayout}
            employees={employees}
            error={error}
            groups={groups}
            isLoading={isLoading}
            onGroupCreate={createGroup}
            onGroupDelete={deleteGroup}
            onGroupRename={renameGroup}
            onSkillCreate={createSkill}
            onTaskAiAssign={aiAssignTask}
            onTaskApprove={approveAiTask}
            onTaskAssignEmployee={assignEmployeeToTask}
            onTaskArchive={archiveTask}
            onTaskCreate={createTask}
            onTaskDelete={deleteTask}
            onTaskReject={rejectAiTask}
            onTaskUnassignEmployee={unassignEmployeeFromTask}
            onTaskUpdate={updateTask}
            skills={skills}
            tasks={tasks}
          />
        )}
      </div>

      <AllocationHistoryPreview
        allocations={allocations}
        onReassign={recreateTaskFromAllocation}
        onReload={loadWorkspaceData}
      />

      {isMissionControlOpen ? (
        <Portal>
          <div
            className="fixed inset-0 z-80 bg-transparent backdrop-blur-lg"
            onClick={() => setIsMissionControlOpen(false)}
          >
            <button
              type="button"
              onClick={() => setIsMissionControlOpen(false)}
              className="fixed right-8 top-24 z-90 flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/35 text-[#0D1E4C] shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl transition hover:bg-white/60"
              aria-label="Close quick view"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                close
              </span>
            </button>

            <div
              className="flex h-full gap-8 overflow-x-auto pb-16 pl-[104px] pr-16 pt-[164px]"
              onClick={(event) => event.stopPropagation()}
            >
              {missionControlColumns.map((column) => (
                <div key={column.id} className="flex w-80 shrink-0 flex-col">
                  <h3 className="mb-4 shrink-0 text-center text-xl font-black text-[#0D1E4C]">{column.name}</h3>
                  <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-1 pb-4 pt-1">
                    {column.tasks.length ? (
                      column.tasks.map((task) => (
                        <div key={task.task_id} className="relative">
                          <div className="rounded-full border border-white/60 bg-white/60 px-5 py-4 shadow-sm">
                            <span
                              className="block text-center text-sm font-bold text-[#0D1E4C]"
                              title={task.title || "Untitled task"}
                            >
                              {task.title || "Untitled task"}
                            </span>
                          </div>
                          <div className="absolute left-1/2 top-full flex -translate-x-1/2 -translate-y-1/2 items-center -space-x-2">
                            {task.assignees.length ? (
                              task.assignees.map((employee) => (
                                <AvatarCircle
                                  key={employee.user_id}
                                  employee={employee}
                                  sizeClass="h-9 w-9"
                                  className="text-xs"
                                />
                              ))
                            ) : (
                              <AvatarCircle employee={null} sizeClass="h-9 w-9" className="text-xs" />
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-sm font-semibold text-[#94a3b8]">No tasks</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
