"use client";

import { useEffect, useMemo, useState } from "react";

const PRIORITY_TONES = {
  low: { chip: "bg-[#ecfdf5] text-[#15803d]", dot: "bg-[#22c55e]" },
  medium: { chip: "bg-[#fff7ed] text-[#b45309]", dot: "bg-[#f59e0b]" },
  high: { chip: "bg-[#fef2f2] text-[#b91c1c]", dot: "bg-[#ef4444]" },
  urgent: { chip: "bg-[#fef2f2] text-[#b91c1c]", dot: "bg-[#ef4444]" },
};

const STATUS_TONES = {
  open: { chip: "bg-[#eff6ff] text-[#1d4ed8]", dot: "bg-[#579BFC]" },
  "in progress": { chip: "bg-[#fff7ed] text-[#b45309]", dot: "bg-[#FDAB3D]" },
  completed: { chip: "bg-[#ecfdf5] text-[#15803d]", dot: "bg-[#00C875]" },
  cancelled: { chip: "bg-[#fef2f2] text-[#b91c1c]", dot: "bg-[#DF2F4A]" },
};

const AVATAR_COLORS = ["#1E40AF", "#0F766E", "#7C3AED", "#B45309", "#BE185D"];

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

function getDisplayName(employee) {
  return employee?.full_name || employee?.username || employee?.email || "Employee";
}

function getPriorityKey(priority) {
  const normalized = String(priority || "Medium").toLowerCase();

  if (normalized === "low") return "low";
  if (normalized === "high") return "high";
  if (normalized === "urgent") return "urgent";

  return "medium";
}

function getStatusKey(status) {
  return String(status || "Open").toLowerCase();
}

function formatPillLabel(value, fallback) {
  return String(value || fallback).trim().toUpperCase();
}

function formatDate(value) {
  if (!value) return "No due date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getTaskActionLabels(task) {
  const actionSource = `${task.owner ?? ""} ${task.latest_assigned_by ?? ""}`;
  const isSmartAction = /optimus|ai/i.test(actionSource);

  return [
    isSmartAction ? "Smart task creation" : "Created manually",
    task.assigned_to ? (isSmartAction ? "Smart task allocation" : "Assigned manually") : null,
  ].filter(Boolean);
}

function buildBoardColumns({ groups, tasks }) {
  const fallbackGroup = {
    group_id: "ungrouped",
    group_name: "To-do",
  };
  const baseGroups = groups.length ? groups : [fallbackGroup];
  const firstGroupId = baseGroups[0]?.group_id;
  const tasksByGroup = new Map(baseGroups.map((group) => [group.group_id, []]));

  for (const task of tasks) {
    const key = tasksByGroup.has(task.group_id) ? task.group_id : firstGroupId;
    tasksByGroup.get(key)?.push(task);
  }

  return baseGroups.map((group) => ({
    id: group.group_id,
    name: group.group_name,
    tasks: tasksByGroup.get(group.group_id) ?? [],
  }));
}

function Avatars({ names }) {
  if (!names.length) {
    return <span className="text-[11px] font-semibold text-[#94a3b8]">Unassigned</span>;
  }

  return (
    <div className="flex -space-x-2">
      {names.map((name, index) => (
        <span
          key={name}
          title={name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white"
          style={{ backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
        >
          {initials(name)}
        </span>
      ))}
    </div>
  );
}

function TaskCard({ task }) {
  const priorityTone = PRIORITY_TONES[getPriorityKey(task.priority)] ?? PRIORITY_TONES.medium;
  const statusTone = STATUS_TONES[getStatusKey(task.status)] ?? STATUS_TONES.open;
  const isAi = /optimus|ai/i.test(task.owner);
  const actionLabels = getTaskActionLabels(task);

  return (
    <div className="group relative z-0 pt-11 hover:z-20">
      <div className="absolute inset-x-0 top-0 bottom-0 z-0 translate-y-0 rounded-2xl border border-[#e6ebf2] bg-[#eef2f8] px-4 pt-3 shadow-sm transition-transform duration-200 ease-out group-hover:-translate-y-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-4 w-4 rounded-full text-center text-[9px] font-black leading-4 text-white ${
              isAi ? "bg-[#7C3AED]" : "bg-[#1E40AF]"
            }`}
          >
            {isAi ? "*" : initials(task.owner)[0]}
          </span>
          <span className="text-[11px] font-bold text-[#0D1E4C]">{task.owner}</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold leading-4 text-[#2563EB] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {actionLabels.join(" · ")}
        </p>
      </div>

      <div className="relative z-10 rounded-2xl border border-[#e6ebf2] bg-white p-4 shadow-sm transition duration-200 group-hover:shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${statusTone.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
            {formatPillLabel(task.status, "Open")}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${priorityTone.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${priorityTone.dot}`} />
            {formatPillLabel(task.priority, "Medium")} PRIORITY
          </span>
        </div>

        <h4 className="mt-3 text-base font-black text-[#0D1E4C]">{task.title || "Untitled task"}</h4>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#667085]">
          {task.description || "No description added."}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0 text-[11px] font-semibold text-[#94a3b8]">
            <span className="truncate">{formatDate(task.end_datetime)}</span>
          </div>
          <Avatars names={task.assignees} />
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ groupId, name, count, onRename }) {
  const [draftName, setDraftName] = useState(name);

  useEffect(() => {
    setDraftName(name);
  }, [name]);

  function saveName() {
    const nextName = draftName.trim();

    if (!nextName) {
      setDraftName(name);
      return;
    }

    if (nextName !== name) {
      onRename?.(groupId, nextName);
    }
  }

  return (
    <div className="mb-4 flex shrink-0 items-center gap-2 px-1">
      <span className="h-4 w-4 rounded-full border-2 border-[#cbd5e1]" />
      <input
        type="text"
        value={draftName}
        onBlur={saveName}
        onChange={(event) => setDraftName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            setDraftName(name);
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-black text-[#0D1E4C] outline-none transition hover:border-white/60 hover:bg-white/35 focus:border-[#1E40AF]/40 focus:bg-white/70"
        aria-label={`Rename ${name}`}
      />
      <span className="rounded-full bg-[#eef2f8] px-2 py-0.5 text-xs font-bold text-[#94a3b8]">
        {count}
      </span>
    </div>
  );
}

export default function WorkspaceBoard({
  currentWorkspace,
  employees = [],
  error = "",
  groups = [],
  isLoading = false,
  onGroupRename,
  tasks = [],
}) {
  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );

  const columns = useMemo(() => {
    const rawColumns = buildBoardColumns({ groups, tasks });

    return rawColumns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => {
        const owner = employeesById.get(task.owner_id);
        const assignee = employeesById.get(task.assigned_to);

        return {
          ...task,
          assignees: assignee ? [getDisplayName(assignee)] : [],
          owner: owner ? getDisplayName(owner) : "Manager",
        };
      }),
    }));
  }, [employeesById, groups, tasks]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-[#52627a]">
        Loading workspace board...
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

  if (!currentWorkspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-[#52627a]">
        No workspace found.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-x-auto pb-2">
      {columns.map((column) => (
        <div key={column.id} className="flex w-80 shrink-0 flex-col">
          <ColumnHeader
            groupId={column.id}
            name={column.name}
            count={column.tasks.length}
            onRename={onGroupRename}
          />

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4">
            {column.tasks.map((task) => (
              <TaskCard key={task.task_id} task={task} />
            ))}

            {!column.tasks.length ? (
              <div className="rounded-2xl border-2 border-dashed border-[#cbd5e1] py-8 text-center text-sm font-bold text-[#94a3b8]">
                No tasks in this group.
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
