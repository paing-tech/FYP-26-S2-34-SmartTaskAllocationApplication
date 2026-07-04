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
const STATUS_OPTIONS = ["Open", "In Progress", "Completed", "Cancelled"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

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
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function toDateTimeInputValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
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

function TimelineRail({ end, start }) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const hasValidRange =
    startDate &&
    endDate &&
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    endDate.getTime() > startDate.getTime();

  const currentPosition = hasValidRange
    ? Math.min(
        100,
        Math.max(
          0,
          ((Date.now() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100,
        ),
      )
    : null;

  if (!startLabel && !endLabel) {
    return (
      <div className="mt-3 rounded-xl bg-[#f8fafc] px-3 py-2 text-[11px] font-black uppercase tracking-wide text-[#94a3b8]">
        No timeline
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 text-[11px] font-black tracking-wide text-[#94a3b8]">
        <span className="truncate">{startLabel || "No start"}</span>
        <span className="truncate text-right">{endLabel ? `Due ${endLabel}` : "No end"}</span>
      </div>
      <div className="relative mt-2 h-4">
        <div className="absolute left-1.5 right-1.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[#dbe4f0]" />
        <span className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-[#94a3b8] shadow-sm" />
        <span className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-[#94a3b8] shadow-sm" />
        {currentPosition !== null ? (
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.18)]"
            style={{ left: `${currentPosition}%` }}
            title="Today"
          />
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({ onOpen, task }) {
  const priorityTone = PRIORITY_TONES[getPriorityKey(task.priority)] ?? PRIORITY_TONES.medium;
  const statusTone = STATUS_TONES[getStatusKey(task.status)] ?? STATUS_TONES.open;
  const actionLabels = getTaskActionLabels(task);

  return (
    <div className="group relative z-0 pt-11 hover:z-20">
      <div className="absolute inset-x-0 top-2 bottom-0 z-0 translate-y-0 rounded-3xl border border-white/60 bg-white/10 px-4 pt-3 shadow-sm backdrop-blur-xl transition-all duration-200 ease-out group-hover:-bottom-4 group-hover:-translate-y-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#0D1E4C]">{task.owner}</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold leading-4 text-[#2563EB] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {actionLabels.join(" · ")}
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen?.(task)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen?.(task);
          }
        }}
        className="relative z-10 cursor-pointer rounded-3xl border border-[#e6ebf2] bg-white/40 p-4 shadow-sm backdrop-blur-2xl transition duration-200 group-hover:shadow-lg"
      >
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
        <TimelineRail start={task.start_datetime} end={task.end_datetime} />

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 rounded-full border border-white/60 bg-white/60 px-3 py-2 text-[11px] font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-200 hover:scale-110"
          >
            Assign
          </button>
          <Avatars names={task.assignees} />
        </div>
      </div>
    </div>
  );
}

function TaskEditPanel({ employees, onClose, onSave, task }) {
  const [form, setForm] = useState(() => ({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "Open",
    priority: task?.priority ?? "Medium",
    assignedTo: task?.assigned_to ?? "",
    startDatetime: toDateTimeInputValue(task?.start_datetime),
    endDatetime: toDateTimeInputValue(task?.end_datetime),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? "Open",
      priority: task?.priority ?? "Medium",
      assignedTo: task?.assigned_to ?? "",
      startDatetime: toDateTimeInputValue(task?.start_datetime),
      endDatetime: toDateTimeInputValue(task?.end_datetime),
    });
    setError("");
  }, [task]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event) {
    event.preventDefault();
    const cleanTitle = form.title.trim();

    if (!cleanTitle) {
      setError("Task name is required.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await onSave?.(task, { ...form, title: cleanTitle });
      onClose?.();
    } catch (saveError) {
      setError(saveError.message || "Could not save task.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-[#0D1E4C]/30 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close task editor"
      />
      <form
        onSubmit={handleSave}
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-white/60 bg-white/90 shadow-[0_24px_80px_rgba(13,30,76,0.25)] backdrop-blur-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e6ebf2] px-6 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#94a3b8]">Task details</p>
            <h3 className="text-xl font-black text-[#0D1E4C]">Edit task</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dbe4f0] bg-white text-xl font-black text-[#0D1E4C] transition hover:bg-[#eef2f8]"
            aria-label="Close task editor"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">Task name</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4f0] bg-white/80 px-3 text-sm font-bold text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-[#dbe4f0] bg-white/80 px-3 py-3 text-sm font-semibold leading-6 text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4f0] bg-white/80 px-3 text-sm font-bold text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">Priority</span>
              <select
                value={form.priority}
                onChange={(event) => updateField("priority", event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4f0] bg-white/80 px-3 text-sm font-bold text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">Start date</span>
              <input
                type="datetime-local"
                value={form.startDatetime}
                onChange={(event) => updateField("startDatetime", event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4f0] bg-white/80 px-3 text-sm font-bold text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">End date</span>
              <input
                type="datetime-local"
                value={form.endDatetime}
                onChange={(event) => updateField("endDatetime", event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4f0] bg-white/80 px-3 text-sm font-bold text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wide text-[#52627a]">Assignee</span>
              {form.assignedTo ? (
                <button
                  type="button"
                  onClick={() => updateField("assignedTo", "")}
                  className="text-xs font-black text-[#DF2F4A] transition hover:text-[#b91c1c]"
                >
                  Remove assignee
                </button>
              ) : null}
            </div>
            <select
              value={form.assignedTo}
              onChange={(event) => updateField("assignedTo", event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4f0] bg-white/80 px-3 text-sm font-bold text-[#0D1E4C] outline-none transition focus:border-[#2563EB]"
            >
              <option value="">Unassigned</option>
              {employees.map((employee) => (
                <option key={employee.user_id} value={employee.user_id}>
                  {getDisplayName(employee)}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-[#e6ebf2] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#dbe4f0] bg-white px-5 py-2 text-sm font-black text-[#52627a] transition hover:bg-[#eef2f8]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-[#2563EB] px-5 py-2 text-sm font-black text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
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
  onTaskUpdate,
  tasks = [],
}) {
  const [editingTask, setEditingTask] = useState(null);
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

  const currentEditingTask = editingTask
    ? tasks.find((task) => task.task_id === editingTask.task_id) ?? editingTask
    : null;

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

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4 pt-6">
            {column.tasks.map((task) => (
              <TaskCard key={task.task_id} task={task} onOpen={setEditingTask} />
            ))}

            {!column.tasks.length ? (
              <div className="rounded-2xl border-2 border-dashed border-[#cbd5e1] py-8 text-center text-sm font-bold text-[#94a3b8]">
                No tasks in this group.
              </div>
            ) : null}
          </div>
        </div>
      ))}
      {currentEditingTask ? (
        <TaskEditPanel
          employees={employees}
          task={currentEditingTask}
          onClose={() => setEditingTask(null)}
          onSave={onTaskUpdate}
        />
      ) : null}
    </div>
  );
}
