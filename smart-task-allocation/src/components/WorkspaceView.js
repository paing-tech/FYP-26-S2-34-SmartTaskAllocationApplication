"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WorkspaceCalendar, { addDays, startOfWeek } from "@/components/WorkspaceCalendar";
import WorkspaceBoard, { AvatarCircle, buildBoardColumns } from "@/components/WorkspaceBoard";
import AllocationHistory from "@/components/AllocationHistory";
import Portal from "@/components/Portal";
import { usePlanGate } from "@/components/PlanProvider";
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

function AgentsIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M2 13v2" />
      <path d="M22 13v2" />
    </svg>
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

function isTaskOverdue(task, reference = new Date()) {
  if (!task.end_datetime) return false;

  const status = String(task.status || "").toLowerCase();
  if (status === "completed" || status === "cancelled") return false;

  const end = new Date(task.end_datetime);
  return !Number.isNaN(end.getTime()) && end.getTime() < reference.getTime();
}

function isTaskUnassigned(task) {
  return !(task.assigneeIds?.length);
}

function InsightPill({ label, value, detail, progress = 1, tone = "blue" }) {
  const safeProgress = Math.max(0, Math.min(1, progress));
  const ringColor = tone === "red" ? "#DC2626" : "#2563EB";

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/25 px-3 py-1.5 text-[#0D1E4C] shadow-sm backdrop-blur-xl">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
        style={{
          background: `conic-gradient(${ringColor} ${safeProgress * 360}deg, rgba(255,255,255,0.45) 0deg)`,
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
  const { guard } = usePlanGate();
  const [startIndex, setStartIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const historyItems = allocations;
  const allocation = historyItems[startIndex] ?? null;
  const canShowNewer = startIndex > 0;
  const canShowOlder = startIndex + 1 < historyItems.length;
  const byAI = allocation ? /optimus/i.test(allocation.assignedBy ?? "") : false;

  useEffect(() => {
    queueMicrotask(() => setStartIndex(0));
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
        onClick={() => guard("allocation_history", () => setIsExpanded(true))}
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
  const { guard, isLocked } = usePlanGate();
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
  const [draggedMissionTask, setDraggedMissionTask] = useState(null);
  const [missionDropGroupId, setMissionDropGroupId] = useState(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [isOptimusOn, setIsOptimusOn] = useState(false);
  const [isTogglingOptimus, setIsTogglingOptimus] = useState(false);
  const [isRefreshingSmartTasks, setIsRefreshingSmartTasks] = useState(false);
  const filterMenuRef = useRef(null);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(weekStart),
    [weekStart],
  );
  const totalTasks = tasks.length;
  const dueTodayCount = tasks.filter((task) => isSameLocalDay(task.end_datetime)).length;
  const overdueCount = tasks.filter((task) => isTaskOverdue(task)).length;
  const unassignedCount = tasks.filter((task) => isTaskUnassigned(task)).length;
  const priorityOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.priority).filter(Boolean))).sort(),
    [tasks],
  );
  const filteredTasks = useMemo(() => {
    const normalizedSearch = taskSearch.trim().toLowerCase();
    const today = new Date();

    return tasks.filter((task) => {
      const groupId = task.group_id == null ? "ungrouped" : String(task.group_id);
      const groupName = groups.find((group) => String(group.group_id) === groupId)?.group_name ?? "Ungrouped";
      const searchable = `${task.title ?? ""} ${task.description ?? ""} ${task.priority ?? ""} ${groupName}`;

      if (normalizedSearch && !searchable.toLowerCase().includes(normalizedSearch)) return false;
      if (selectedGroupIds.length && !selectedGroupIds.includes(groupId)) return false;
      if (selectedPriorities.length && !selectedPriorities.includes(task.priority)) return false;
      if (dueTodayOnly && !isSameLocalDay(task.end_datetime, today)) return false;
      if (overdueOnly && !isTaskOverdue(task, today)) return false;
      if (unassignedOnly && !isTaskUnassigned(task)) return false;
      return true;
    });
  }, [
    tasks,
    groups,
    taskSearch,
    selectedGroupIds,
    selectedPriorities,
    dueTodayOnly,
    overdueOnly,
    unassignedOnly,
  ]);
  const activeFilterCount =
    selectedGroupIds.length +
    selectedPriorities.length +
    Number(dueTodayOnly) +
    Number(overdueOnly) +
    Number(unassignedOnly);

  useEffect(() => {
    function closeFilterMenu(event) {
      if (!filterMenuRef.current?.contains(event.target)) setIsFilterOpen(false);
    }

    document.addEventListener("pointerdown", closeFilterMenu);
    return () => document.removeEventListener("pointerdown", closeFilterMenu);
  }, []);

  function toggleFilterValue(setter, value) {
    setter((current) =>
      current.includes(value) ? current.filter((currentValue) => currentValue !== value) : [...current, value],
    );
  }

  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );

  // Same grouping WorkspaceBoard uses for its columns, reused here so the
  // quick-view overlay always matches the real board layout exactly.
  const missionControlColumns = useMemo(() => {
    const columns = buildBoardColumns({ groups, tasks: filteredTasks });
    return columns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => ({
        ...task,
        assignees: (task.assigneeIds ?? []).map((userId) => employeesById.get(userId)).filter(Boolean),
      })),
    }));
  }, [groups, filteredTasks, employeesById]);

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

  function goToPreviousWeek() {
    setWeekStart((current) => addDays(current, -7));
  }

  function goToNextWeek() {
    setWeekStart((current) => addDays(current, 7));
  }

  // Single toggle now stands in for the old separate Smart Task Creation /
  // Smart Task Allocation switches — turning it on both un-hides pending
  // Optimus AI suggestions (blue-border cards on the board) and lets Optimus
  // auto-allocate tasks; turning it off hides those suggestions again.
  async function toggleOptimus() {
    if (isTogglingOptimus) return;

    const nextValue = !isOptimusOn;
    setIsTogglingOptimus(true);
    setIsOptimusOn(nextValue);
    setError("");

    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const [visibilityResponse, allocationResponse] = await Promise.all([
        fetch("/api/tasks", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "set-ai-task-visibility", enabled: nextValue }),
        }),
        fetch("/api/tasks", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "auto-allocate-tasks", enabled: nextValue }),
        }),
      ]);
      const [visibilityResult, allocationResult] = await Promise.all([
        visibilityResponse.json(),
        allocationResponse.json(),
      ]);

      if (!visibilityResponse.ok) {
        throw new Error(visibilityResult.error || "Could not update Optimus AI tasks.");
      }

      if (!allocationResponse.ok) {
        throw new Error(allocationResult.error || "Could not update Optimus AI allocation.");
      }

      await loadWorkspaceData();
    } catch (toggleError) {
      setIsOptimusOn(!nextValue);
      setError(toggleError.message);
    } finally {
      setIsTogglingOptimus(false);
    }
  }

  // Manual trigger for Smart Task Creation: looks at allocation history for
  // due recurring tasks and common-sense follow-ups, skipping anything that
  // already has an equivalent open task so repeat clicks don't pile up
  // duplicates.
  async function handleRefreshSmartTasks() {
    if (isRefreshingSmartTasks) return;
    setIsRefreshingSmartTasks(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "refresh-smart-tasks" }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not refresh smart tasks.");
      }

      await loadWorkspaceData();
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setIsRefreshingSmartTasks(false);
    }
  }

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

  // Drag-and-drop column reorder — applied optimistically so the columns
  // don't snap back while the PATCH is in flight.
  async function reorderGroups(orderedGroupIds) {
    const previousGroups = groups;
    const groupById = new Map(groups.map((group) => [String(group.group_id), group]));
    const nextGroups = orderedGroupIds.map((id) => groupById.get(String(id))).filter(Boolean);

    if (nextGroups.length !== groups.length) return;

    setGroups(nextGroups);
    setError("");

    try {
      const response = await fetch("/api/task-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ orderedGroupIds }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not reorder task groups.");
      }
    } catch (reorderError) {
      setGroups(previousGroups);
      setError(reorderError.message);
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

  // Deleting a group either migrates its tasks to a new group (migrateToGroupId,
  // optionally scoped to just migrateTaskIds — anything left behind is
  // detached instead) or deletes the tasks along with it (deleteTasks);
  // omitting all three just detaches every task (group_id -> null), matching
  // the API's default behavior.
  async function deleteGroup(groupId, { migrateToGroupId, migrateTaskIds, deleteTasks } = {}) {
    setError("");

    try {
      const params = new URLSearchParams({ groupId: String(groupId) });
      if (migrateToGroupId) params.set("migrateToGroupId", String(migrateToGroupId));
      if (migrateToGroupId && migrateTaskIds?.length) {
        params.set("migrateTaskIds", migrateTaskIds.join(","));
      }
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

  // Quick view's task pills are draggable between columns — resend every
  // other field as-is (see updateTask's full-record PATCH gotcha) with just
  // groupId changed.
  function dropMissionTaskOnGroup(targetGroupId) {
    const task = draggedMissionTask;
    setDraggedMissionTask(null);
    setMissionDropGroupId(null);

    if (!task || String(task.group_id ?? "") === String(targetGroupId ?? "")) return;

    updateTask(task, {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      groupId: targetGroupId,
      requiredSkillIds: (task.requiredSkills ?? []).map((skill) => skill.skill_id),
      startDatetime: task.start_datetime,
      endDatetime: task.end_datetime,
      assignedTo: task.assigned_to,
    });
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

    if (isLocked("ai_auto_assign")) {
      guard("ai_auto_assign");
      return;
    }

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
        <div className="absolute left-0 hidden items-center gap-2 xl:flex">
          <InsightPill label="Total tasks" value={totalTasks} />
          <InsightPill
            label="Due today"
            value={dueTodayCount}
            progress={totalTasks ? dueTodayCount / totalTasks : 0}
          />
          <InsightPill
            label="Overdue"
            value={overdueCount}
            progress={totalTasks ? overdueCount / totalTasks : 0}
            tone="red"
          />
          <InsightPill
            label="Unassigned"
            value={unassignedCount}
            progress={totalTasks ? unassignedCount / totalTasks : 0}
          />
          <button
            type="button"
            onClick={handleRefreshSmartTasks}
            disabled={isRefreshingSmartTasks}
            aria-label="Refresh smart tasks"
            title="Refresh smart tasks"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon spinning={isRefreshingSmartTasks} />
          </button>
        </div>
        <div className="absolute right-0 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleOptimus}
            disabled={isTogglingOptimus}
            aria-pressed={isOptimusOn}
            aria-label="Toggle Optimus AI"
            title="Optimus AI"
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/35 shadow-[0_4px_10px_rgba(13,30,76,0.2),0_14px_32px_rgba(13,30,76,0.24)] backdrop-blur-xl transition hover:scale-105 disabled:cursor-not-allowed ${
              isOptimusOn ? "text-[#2563EB]" : "text-[#0D1E4C]/40"
            }`}
          >
            <AgentsIcon />
          </button>

          <div className="relative w-72">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#64748B]" aria-hidden="true">
              search
            </span>
            <input
              value={taskSearch}
              onChange={(event) => setTaskSearch(event.target.value)}
              placeholder="Search tasks"
              className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
          </div>

          {view === "calendar" ? (
            <div className="flex items-center gap-1 rounded-full border border-white/70 bg-white/35 px-2 py-1 shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl">
              <button
                type="button"
                onClick={goToPreviousWeek}
                aria-label="Previous week"
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-[#0D1E4C] transition hover:bg-white/60"
              >
                ‹
              </button>
              <span className="min-w-24 text-center text-sm font-bold text-[#0D1E4C]">{monthLabel}</span>
              <button
                type="button"
                onClick={goToNextWeek}
                aria-label="Next week"
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-[#0D1E4C] transition hover:bg-white/60"
              >
                ›
              </button>
            </div>
          ) : null}

          {view === "board" ? (
            <>
              <div ref={filterMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen((open) => !open)}
                  aria-label="Filter tasks"
                  aria-expanded={isFilterOpen}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/70 shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl transition hover:bg-white/60 ${
                    isFilterOpen || activeFilterCount ? "bg-[#0D1E4C] text-white" : "bg-white/35 text-[#0D1E4C]"
                  }`}
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    filter_list
                  </span>
                  {activeFilterCount ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-black text-white">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>

                {isFilterOpen ? (
                  <div className="absolute right-0 top-13 z-40 w-48 rounded-[24px] border border-white/70 bg-white/60 p-3 shadow-[0_20px_55px_rgba(13,30,76,0.22)] backdrop-blur-3xl">
                    <div>
                      <p className="px-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">Task group</p>
                      <div className="mt-1 max-h-36 space-y-0.5 overflow-y-auto">
                        {groups.map((group) => {
                          const value = String(group.group_id);
                          const checked = selectedGroupIds.includes(value);
                          return (
                            <button
                              key={group.group_id}
                              type="button"
                              onClick={() => toggleFilterValue(setSelectedGroupIds, value)}
                              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-white/70"
                            >
                              {checked ? (
                                <span className="material-symbols-outlined text-[18px] text-[#2563EB]" aria-hidden="true">check_circle</span>
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-[#94A3B8] bg-white/40" />
                              )}
                              <span className="truncate">{group.group_name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 border-t border-white/60 pt-3">
                      <p className="px-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">Priority</p>
                      <div className="mt-1 space-y-0.5">
                        {priorityOptions.map((priority) => {
                          const checked = selectedPriorities.includes(priority);
                          return (
                            <button
                              key={priority}
                              type="button"
                              onClick={() => toggleFilterValue(setSelectedPriorities, priority)}
                              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-white/70"
                            >
                              {checked ? (
                                <span className="material-symbols-outlined text-[18px] text-[#2563EB]" aria-hidden="true">check_circle</span>
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-[#94A3B8] bg-white/40" />
                              )}
                              {priority}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 space-y-0.5 border-t border-white/60 pt-3">
                      <button
                        type="button"
                        onClick={() => setDueTodayOnly((current) => !current)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-white/70"
                      >
                        {dueTodayOnly ? (
                          <span className="material-symbols-outlined text-[18px] text-[#2563EB]" aria-hidden="true">check_circle</span>
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-[#94A3B8] bg-white/40" />
                        )}
                        Due today
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverdueOnly((current) => !current)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-white/70"
                      >
                        {overdueOnly ? (
                          <span className="material-symbols-outlined text-[18px] text-[#DC2626]" aria-hidden="true">check_circle</span>
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-[#94A3B8] bg-white/40" />
                        )}
                        Overdue
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnassignedOnly((current) => !current)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-white/70"
                      >
                        {unassignedOnly ? (
                          <span className="material-symbols-outlined text-[18px] text-[#2563EB]" aria-hidden="true">check_circle</span>
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-[#94A3B8] bg-white/40" />
                        )}
                        Unassigned
                      </button>
                    </div>

                    {activeFilterCount ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGroupIds([]);
                          setSelectedPriorities([]);
                          setDueTodayOnly(false);
                          setOverdueOnly(false);
                          setUnassignedOnly(false);
                        }}
                        className="mt-3 w-full rounded-full px-3 py-2 text-xs font-bold text-[#64748B] transition hover:bg-white/70 hover:text-[#0D1E4C]"
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                ) : null}
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
            </>
          ) : null}
        </div>
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
            tasks={filteredTasks}
            weekStart={weekStart}
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
            onGroupReorder={reorderGroups}
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
            tasks={filteredTasks}
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
            <h2 className="fixed left-1/2 top-8 z-90 -translate-x-1/2 text-2xl font-black text-[#0D1E4C]">
              Quick View
            </h2>

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
                <div
                  key={column.id}
                  onDragOver={(event) => {
                    if (!draggedMissionTask) return;
                    event.preventDefault();
                    if (missionDropGroupId !== column.id) setMissionDropGroupId(column.id);
                  }}
                  onDrop={() => dropMissionTaskOnGroup(column.id)}
                  className="flex w-80 shrink-0 flex-col"
                >
                  <h3 className="mb-4 shrink-0 text-center text-xl font-black text-[#0D1E4C]">{column.name}</h3>
                  <div
                    className={`flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto rounded-3xl px-1 pb-4 pt-1 transition ${
                      missionDropGroupId === column.id ? "outline-2 outline-offset-4 outline-[#2563EB]/50" : ""
                    }`}
                  >
                    {column.tasks.length ? (
                      column.tasks.map((task) => (
                        <div
                          key={task.task_id}
                          draggable
                          onDragStart={() => setDraggedMissionTask(task)}
                          onDragEnd={() => {
                            setDraggedMissionTask(null);
                            setMissionDropGroupId(null);
                          }}
                          className={`relative cursor-grab active:cursor-grabbing ${
                            draggedMissionTask?.task_id === task.task_id ? "opacity-40" : ""
                          }`}
                        >
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
