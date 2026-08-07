"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import Portal from "@/components/Portal";

const PRIORITY_TONES = {
  low: { chip: "text-[#15803d]", dot: "bg-[#22c55e]" },
  medium: { chip: "text-[#b45309]", dot: "bg-[#f59e0b]" },
  high: { chip: "text-[#b91c1c]", dot: "bg-[#ef4444]" },
  urgent: { chip: "text-[#b91c1c]", dot: "bg-[#ef4444]" },
};

const STATUS_TONES = {
  open: { chip: "text-[#1d4ed8]", dot: "bg-[#579BFC]" },
  "in progress": { chip: "text-[#b45309]", dot: "bg-[#FDAB3D]" },
  completed: { chip: "text-[#15803d]", dot: "bg-[#00C875]" },
  cancelled: { chip: "text-[#b91c1c]", dot: "bg-[#DF2F4A]" },
};

const AVATAR_COLORS = ["#1E40AF", "#0F766E", "#7C3AED", "#B45309", "#BE185D"];
const STATUS_OPTIONS = ["Open", "In Progress", "Completed", "Cancelled"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
const REPEAT_OPTIONS = ["Never", "Daily", "Weekdays", "Weekends", "Weekly", "Monthly", "Custom"];

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

export function getDisplayName(employee) {
  return employee?.full_name || employee?.username || employee?.email || "Employee";
}

export function AvatarCircle({ className, employee, sizeClass, style }) {
  const name = employee ? getDisplayName(employee) : "";

  if (employee?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full border-2 border-white object-cover ${className ?? ""}`}
        src={employee.avatar_url}
      />
    );
  }

  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-black text-white ${className ?? ""}`}
      style={style ?? { backgroundColor: employee ? AVATAR_COLORS[0] : "#94a3b8" }}
    >
      {employee ? initials(name) : "?"}
    </span>
  );
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

function formatRelativeTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(value);
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDateInputValue(date) {
  if (!date || Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function formatDateSummary(value) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00`);
  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTimeSummary(value) {
  if (!value) return "No time";

  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "No time";

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function getMonthStart(value) {
  const date = value ? new Date(`${value}T00:00`) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Date(safeDate.getFullYear(), safeDate.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toDateTimeInputValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function splitDateTime(value) {
  const inputValue = toDateTimeInputValue(value);
  const time = inputValue.slice(11, 16);

  // combineDateTime always writes "00:00" when time is disabled, so a
  // stored "00:00" is indistinguishable from "no time set" — treat it as
  // no time so the Time toggle doesn't silently re-enable itself on reopen.
  return {
    date: inputValue.slice(0, 10),
    time: time === "00:00" ? "" : time,
  };
}

function combineDateTime({ date, isDateEnabled, isTimeEnabled, time }) {
  if (!isDateEnabled || !date) return "";
  return `${date}T${isTimeEnabled && time ? time : "00:00"}`;
}

function getSmartCreationLabel(task) {
  const reason = task.reasons ?? task.reason;

  if (reason?.creationKind === "chat_automation") {
    return "Prompt to Automation";
  }

  if (reason?.creationKind === "skill_match") {
    return "Matched required skills";
  }

  if (reason?.creationKind === "allocation_history") {
    return "Analyzed allocation history";
  }

  if (reason?.creationKind === "recurring_pattern") {
    return "Detected recurring pattern";
  }

  const reasonText = (Array.isArray(reason?.creation) ? reason.creation : []).join(" ").toLowerCase();

  if (/skill/.test(reasonText)) {
    return "Matched required skills";
  }

  if (/allocation/.test(reasonText)) {
    return "Analyzed allocation history";
  }

  if (/recurring|usually created/.test(reasonText)) {
    return "Detected recurring pattern";
  }

  return "Smart task creation";
}

function getSmartAllocationLabel(task) {
  const reason = task.reasons ?? task.reason;

  if (reason?.allocationKind === "skill_match") {
    return "Matched required skills";
  }

  if (reason?.allocationKind === "history_pattern") {
    return "Matched allocation history";
  }

  if (reason?.allocationKind === "department_match") {
    return "Matched department";
  }

  return "Smart task allocation";
}

function getTaskActionLabels(task) {
  // Creation and allocation are independent facts: a manually-created task can
  // still be auto-allocated by Optimus AI later, and vice versa. Deciding both
  // from the same loose "does this look AI-ish" check mislabels either case.
  const isSmartCreation = task.source === "optimus_ai";
  const isSmartAllocation =
    task.reasons?.allocationKind === "skill_match" || task.latest_assigned_by === "Optimus AI";

  return [
    isSmartCreation ? getSmartCreationLabel(task) : "Created manually",
    task.assigned_to ? (isSmartAllocation ? getSmartAllocationLabel(task) : "Assigned manually") : null,
  ].filter(Boolean);
}

export function buildBoardColumns({ groups, tasks }) {
  const fallbackGroup = {
    group_id: "ungrouped",
    group_name: "To-do",
  };
  const baseGroups = groups.length ? groups : [fallbackGroup];
  // Orphaned tasks (group deleted, etc.) land in "Untitled" if the org has
  // one, rather than silently landing in whichever group happens to sort first.
  const untitledGroup = baseGroups.find((group) => (group.group_name || "").trim().toLowerCase() === "untitled");
  const orphanGroupId = untitledGroup?.group_id ?? baseGroups[0]?.group_id;
  const tasksByGroup = new Map(baseGroups.map((group) => [group.group_id, []]));

  for (const task of tasks) {
    const matchingGroup = baseGroups.find((group) => sameId(group.group_id, task.group_id));
    const key = matchingGroup?.group_id ?? orphanGroupId;
    tasksByGroup.get(key)?.push(task);
  }

  return baseGroups.map((group) => ({
    id: group.group_id,
    name: group.group_name,
    tasks: tasksByGroup.get(group.group_id) ?? [],
  }));
}

// Resolves the display-ready owner/assignee fields TaskCard expects from a
// raw task row (owner_id/assigned_to/assigneeIds) plus an employeesById map.
export function enrichTaskWithPeople(task, employeesById) {
  const owner = employeesById.get(task.owner_id);
  const assignee = employeesById.get(task.assigned_to);
  const assignees = (task.assigneeIds ?? [])
    .map((userId) => employeesById.get(userId))
    .filter(Boolean);

  return {
    ...task,
    assignee: assignee ?? null,
    assignees,
    owner:
      task.source === "optimus_ai"
        ? task.reasons?.agentName || "Optimus AI"
        : owner
          ? getDisplayName(owner)
          : "Manager",
    ownerJobTitle: task.source === "optimus_ai" ? "" : owner ? getOccupation(owner) : "",
  };
}

export function getOccupation(employee) {
  return (
    employee?.job_title ||
    employee?.department?.department_name ||
    employee?.role?.role_name ||
    employee?.email ||
    "No occupation added"
  );
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function formatCompactTimeline(start, end) {
  const endLabel = formatDate(end);
  if (endLabel) return `Due ${endLabel}`;

  const startLabel = formatDate(start);
  return startLabel || "No timeline";
}

// Compact-column variant of AssigneeProfile: timeline text on the left,
// avatar-only stack on the right (no name/occupation text).
function CompactAssigneeRow({ assignees, end, start }) {
  const shown = (assignees?.length ? assignees : [null]).slice(0, 3);
  const extra = (assignees?.length ?? 0) - shown.length;

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/45 px-3 py-2">
      <span className="truncate text-[11px] font-bold text-[#94a3b8]">
        {formatCompactTimeline(start, end)}
      </span>
      <span className="flex shrink-0 items-center -space-x-2">
        {shown.map((employee, index) => (
          <span key={employee?.user_id ?? `unassigned-${index}`} title={employee ? getDisplayName(employee) : "Unassigned"}>
            <AvatarCircle employee={employee} sizeClass="h-7 w-7" />
          </span>
        ))}
        {extra > 0 ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#0D1E4C] text-[10px] font-black text-white">
            +{extra}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function AssigneeProfile({ employee }) {
  if (!employee) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white/45 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#94a3b8] text-[10px] font-black text-white">
            ?
          </span>
          <span className="truncate text-xs font-black text-[#0D1E4C]">Unassigned</span>
        </span>
        <span className="shrink-0 truncate text-right text-[11px] font-semibold text-[#94a3b8]">
          No assignee
        </span>
      </div>
    );
  }

  const name = getDisplayName(employee);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-full bg-white/10 backdrop-blur-3xl px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <AvatarCircle employee={employee} sizeClass="h-7 w-7" />
        <span className="truncate text-xs font-black text-[#0D1E4C]">{name}</span>
      </span>
      <span className="shrink-0 truncate text-right text-[11px] font-semibold text-[#667085]">
        {getOccupation(employee)}
      </span>
    </div>
  );
}

function TimelineRail({ end, start }) {
  const [now] = useState(() => Date.now());
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
        Math.max(0, ((now - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100),
      )
    : null;

  if (!startLabel && !endLabel) {
    return <div className="mt-3 h-1" aria-hidden="true" />;
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

// "On leave" beats task load — it reflects whether the employee is physically
// available right now, which task-count-based busyness can't tell you. The
// default label comes straight from the employee's current availability row
// rather than being hardcoded, so it stays in sync with that table.
function getEmployeeAvailabilityLabel(employee, activeTaskCount) {
  const now = new Date();
  const availabilities = employee?.availabilities ?? [];

  const currentAvailability = availabilities.find((row) => {
    const start = new Date(row?.availability_start);
    const end = new Date(row?.availability_end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

    return now >= start && now <= end;
  });

  const currentStatus = currentAvailability?.status ?? employee?.availability?.status ?? "";

  if (/leave/i.test(currentStatus)) return "On Leave";
  if (activeTaskCount >= 3) return "Busy";

  return currentStatus || "Available";
}

const AVAILABILITY_TONES = {
  Available: "bg-[#ecfdf5] text-[#15803d]",
  Busy: "bg-[#fff7ed] text-[#b45309]",
  "On Leave": "bg-[#fef2f2] text-[#b91c1c]",
};
const DEFAULT_AVAILABILITY_TONE = "bg-[#f1f5f9] text-[#64748b]";

function EmployeeAssignCard({ activeTaskCount, assignedTasks = [], employee, isAssigned, isSubmitting, onAssign }) {
  const name = getDisplayName(employee);
  const availabilityLabel = getEmployeeAvailabilityLabel(employee, activeTaskCount);
  const skills = employee?.skills ?? [];

  return (
    <div className="group relative z-0 hover:z-20">
      {/* Stacked card behind the profile card — peeks out at rest, then
          expands downward on hover to reveal this employee's current
          assignments. */}
      <div className="absolute inset-x-3 top-full z-0 max-h-3 overflow-hidden rounded-b-3xl border border-t-0 border-white/50 bg-white/70 px-4 pb-0 pt-6 shadow-sm backdrop-blur-xl transition-all duration-300 ease-out group-hover:max-h-64 group-hover:pb-4">
        <p className="text-center text-[11px] font-black uppercase tracking-wide text-[#94a3b8]">Assigned to</p>
        <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {assignedTasks.length ? (
            assignedTasks.map((assignedTask) => (
              <div
                key={assignedTask.task_id}
                className="truncate rounded-full bg-white/90 px-3 py-1.5 text-center text-xs font-bold text-[#0D1E4C] shadow-sm"
              >
                {assignedTask.title || "Untitled task"}
              </div>
            ))
          ) : (
            <p className="text-center text-xs font-semibold text-[#94a3b8]">No active tasks</p>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center rounded-3xl border border-white/60 bg-white/70 p-4 text-center shadow-sm backdrop-blur-xl">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${
            AVAILABILITY_TONES[availabilityLabel] ?? DEFAULT_AVAILABILITY_TONE
          }`}
        >
          {availabilityLabel}
        </span>

        <span className="mt-3 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2563EB] text-base font-black text-white">
          {employee?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={employee.avatar_url} alt={name} className="h-full w-full object-cover" />
          ) : (
            initials(name)
          )}
        </span>

        <p className="mt-3 truncate text-sm font-black text-[#0D1E4C]">{name}</p>
        <p className="truncate text-xs font-semibold text-[#667085]">
          {employee?.job_title || "No job title added"}
        </p>
        {employee?.department?.department_name ? (
          <p className="truncate text-xs text-[#94a3b8]">{employee.department.department_name}</p>
        ) : null}

        {employee?.email ? (
          <span className="mt-3 flex max-w-full items-center gap-1.5 truncate rounded-full bg-[#f8faff] px-3 py-1.5 text-xs font-semibold text-[#52627a]">
            <span className="material-symbols-outlined text-sm text-[#94a3b8]" aria-hidden="true">
              mail
            </span>
            <span className="truncate">{employee.email}</span>
          </span>
        ) : null}

        {skills.length ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {skills.map((skill) => (
              <span
                key={skill}
                className="truncate rounded-full bg-[#eef2f8] px-2.5 py-1 text-[10px] font-bold text-[#52627a]"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onAssign(employee.user_id)}
          disabled={isAssigned || isSubmitting}
          className={`mt-4 w-full rounded-2xl px-3 py-2.5 text-xs font-black transition ${
            isAssigned
              ? "cursor-not-allowed bg-[#eef2f8] text-[#94a3b8]"
              : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
          } disabled:cursor-not-allowed disabled:opacity-70`}
        >
          {isAssigned ? "Assigned" : isSubmitting ? "Assigning…" : "Assign"}
        </button>
      </div>
    </div>
  );
}

export function AssignEmployeeModal({ employees, groupName, onAiAssign, onAssign, onClose, onUnassign, task, tasks = [] }) {
  const [query, setQuery] = useState("");
  const [assigningId, setAssigningId] = useState(null);
  const [unassigningId, setUnassigningId] = useState(null);
  const [isAiAssigning, setIsAiAssigning] = useState(false);
  const [error, setError] = useState("");

  const assignedEmployees = task?.assignees ?? [];
  const assignedIds = new Set(assignedEmployees.map((assignee) => assignee.user_id));

  // Every non-terminal task currently assigned to each employee — the count
  // drives the availability label, and the list itself is shown in the
  // card's hover-reveal "Assigned to" panel.
  const activeTasksByEmployeeId = useMemo(() => {
    const map = new Map();
    for (const otherTask of tasks) {
      if (["Completed", "Cancelled"].includes(otherTask.status)) continue;
      for (const userId of otherTask.assigneeIds ?? []) {
        const list = map.get(userId) ?? [];
        list.push(otherTask);
        map.set(userId, list);
      }
    }
    return map;
  }, [tasks]);

  // Only staff with the Employee role can be assigned — managers and user
  // admins are excluded from this picker.
  const assignableEmployees = employees.filter(
    (employee) => String(employee?.role?.role_name ?? "").toLowerCase() === "employee",
  );
  const filteredEmployees = query.trim()
    ? assignableEmployees.filter((employee) =>
        getDisplayName(employee).toLowerCase().includes(query.trim().toLowerCase()),
      )
    : assignableEmployees;

  async function handleAssign(employeeId) {
    setAssigningId(employeeId);
    setError("");

    try {
      await onAssign(employeeId);
    } catch (assignError) {
      setError(assignError.message || "Could not assign employee.");
    } finally {
      setAssigningId(null);
    }
  }

  async function handleUnassign(employeeId) {
    setUnassigningId(employeeId);
    setError("");

    try {
      await onUnassign(employeeId);
    } catch (unassignError) {
      setError(unassignError.message || "Could not remove assignee.");
    } finally {
      setUnassigningId(null);
    }
  }

  async function handleAiAssign() {
    setIsAiAssigning(true);
    setError("");

    try {
      await onAiAssign?.();
    } catch (aiAssignError) {
      setError(aiAssignError.message || "Could not find an AI match for this task.");
    } finally {
      setIsAiAssigning(false);
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_28px_80px_rgba(0,0,0,0.3)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-black text-[#0D1E4C]">
                {task?.title || "Untitled task"}
              </h2>
              {groupName ? (
                <span className="shrink-0 rounded-full bg-[#eef2f8] px-3 py-1 text-xs font-bold text-[#52627a]">
                  {groupName}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {assignedEmployees.map((assignee) => (
                <span
                  key={assignee.user_id}
                  className="flex items-center gap-1.5 rounded-full bg-[#eef2f8] py-1 pl-1 pr-2"
                >
                  <AvatarCircle
                    employee={assignee}
                    sizeClass="h-6 w-6"
                    className="border-0 text-[9px]"
                    style={{ backgroundColor: "#2563EB" }}
                  />
                  <span className="truncate text-xs font-bold text-[#0D1E4C]">
                    {getDisplayName(assignee)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnassign(assignee.user_id)}
                    disabled={unassigningId === assignee.user_id}
                    aria-label={`Remove ${getDisplayName(assignee)}`}
                    className="flex h-4 w-4 shrink-0 items-center justify-center text-[#94a3b8] transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={handleAiAssign}
                disabled={isAiAssigning}
                aria-label="Assign with AI"
                title="Assign with AI"
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-3.5 text-xs font-black text-[#5B21B6] transition hover:bg-[#7C3AED]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  auto_awesome
                </span>
                {isAiAssigning ? "Assigning…" : "Assign with AI"}
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:bg-white/70 hover:scale-110"
              >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
          </div>

          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employees…"
            className="mt-4 h-10 w-full shrink-0 rounded-full border border-[#e6ebf2] bg-[#f8faff] px-4 text-sm font-semibold text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#2563EB]"
          />

          {error ? (
            <p className="mt-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {filteredEmployees.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredEmployees.map((employee) => (
                  <EmployeeAssignCard
                    key={employee.user_id}
                    activeTaskCount={(activeTasksByEmployeeId.get(employee.user_id) ?? []).length}
                    assignedTasks={activeTasksByEmployeeId.get(employee.user_id) ?? []}
                    employee={employee}
                    isAssigned={assignedIds.has(employee.user_id)}
                    isSubmitting={assigningId === employee.user_id}
                    onAssign={handleAssign}
                  />
                ))}
              </div>
            ) : (
              <p className="px-1 py-6 text-center text-sm font-semibold text-[#94a3b8]">
                No employees match your search.
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function TaskCard({ compact = false, employees, groupName, onAiAssign, onApprove, onAssignEmployee, onComplete, onOpen, onReject, onUnassignEmployee, task, tasks, viewOnly = false }) {
  const priorityTone = PRIORITY_TONES[getPriorityKey(task.priority)] ?? PRIORITY_TONES.medium;
  const statusTone = STATUS_TONES[getStatusKey(task.status)] ?? STATUS_TONES.open;
  const actionLabels = getTaskActionLabels(task);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const isAiCreated = task.source === "optimus_ai";
  const isPendingApproval = isAiCreated && task.ai_state !== "accepted";
  const approvedBy = task.reasons?.approvedBy;
  const isCompleted = getStatusKey(task.status) === "completed";

  async function handleApprove(event) {
    event.stopPropagation();
    if (isDeciding) return;
    setIsDeciding(true);
    try {
      await onApprove?.(task);
    } finally {
      setIsDeciding(false);
    }
  }

  async function handleReject(event) {
    event.stopPropagation();
    if (isDeciding) return;
    setIsDeciding(true);
    try {
      await onReject?.(task);
    } finally {
      setIsDeciding(false);
    }
  }

  async function handleComplete(event) {
    event.stopPropagation();
    if (isDeciding || isCompleted) return;
    setIsDeciding(true);
    try {
      await onComplete?.(task);
    } finally {
      setIsDeciding(false);
    }
  }

  return (
    <div className="group relative z-0 pt-11 hover:z-20">
      <div className="absolute inset-x-0 top-2 bottom-0 z-0 translate-y-0 rounded-3xl border border-white/60 bg-white/10 px-4 pt-3 shadow-sm backdrop-blur-xl transition-all duration-200 ease-out group-hover:-bottom-4 group-hover:-translate-y-4">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-[11px] font-bold text-[#0D1E4C]">{task.owner}</span>
          {approvedBy ? (
            <span className="truncate text-[11px] font-bold text-emerald-700">Approved by {approvedBy}</span>
          ) : null}
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
        className={`relative z-10 cursor-pointer rounded-3xl border bg-white/40 shadow-sm backdrop-blur-2xl transition duration-200 group-hover:shadow-lg ${
          isAiCreated
            ? "border-[#2563EB]/70 shadow-[0_0_0_1px_rgba(37,99,235,0.35),0_0_22px_rgba(37,99,235,0.45)]"
            : "border-[#e6ebf2]"
        } ${compact ? "p-3" : "p-4"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 font-black tracking-wide ${statusTone.chip} ${
              compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
            {formatPillLabel(task.status, "Open")}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 font-black tracking-wide ${priorityTone.chip} ${
              compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${priorityTone.dot}`} />
            {formatPillLabel(task.priority, "Medium")}
          </span>
        </div>

        <h4 className={`font-black text-[#0D1E4C] ${compact ? "mt-2 text-sm" : "mt-3 text-base"}`}>
          {task.title || "Untitled task"}
        </h4>
        {compact ? null : <TimelineRail start={task.start_datetime} end={task.end_datetime} />}

        <div className={`space-y-2 ${compact ? "mt-3" : "mt-4"}`}>
          {compact ? (
            <CompactAssigneeRow assignees={task.assignees} start={task.start_datetime} end={task.end_datetime} />
          ) : task.assignees?.length ? (
            task.assignees.map((assignee) => (
              <AssigneeProfile key={assignee.user_id} employee={assignee} />
            ))
          ) : (
            <AssigneeProfile employee={null} />
          )}
          {viewOnly ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isDeciding || isCompleted}
              className={`mt-1 w-full rounded-2xl border text-[11px] font-black transition disabled:cursor-not-allowed ${
                isCompleted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-white/60 bg-slate-200 text-slate-800 hover:scale-[1.05] hover:border-slate-300 disabled:opacity-60"
              } ${compact ? "px-3 py-2" : "px-3 py-2.5"}`}
            >
              {isCompleted ? "Completed" : isDeciding ? "Marking…" : "Mark as Completed"}
            </button>
          ) : isPendingApproval ? (
            <div className="mt-1 inline-flex w-full overflow-hidden rounded-full border border-white/60 bg-slate-200 shadow-sm backdrop-blur-sm">
              <button
                type="button"
                onClick={handleApprove}
                disabled={isDeciding}
                className={`flex flex-1 items-center justify-center text-[11px] font-black text-emerald-700 transition hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-60 ${
                  compact ? "h-9" : "h-11"
                }`}
              >
                Approve
              </button>
              <div className="w-px bg-white/70" />
              <button
                type="button"
                onClick={handleReject}
                disabled={isDeciding}
                className={`flex flex-1 items-center justify-center text-[11px] font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${
                  compact ? "h-9" : "h-11"
                }`}
              >
                Reject
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsAssignOpen(true);
              }}
              className={`mt-1 w-full rounded-2xl border border-slate-200 bg-slate-200 text-[11px] font-black text-slate-800 transition hover:scale-[1.05] hover:border-slate-300 ${
                compact ? "px-3 py-2" : "px-3 py-2.5"
              }`}
            >
              Assign
            </button>
          )}
        </div>
      </div>

      {isAssignOpen ? (
        <AssignEmployeeModal
          employees={employees}
          groupName={groupName}
          task={task}
          tasks={tasks}
          onAiAssign={() => onAiAssign?.(task)}
          onAssign={(employeeId) => onAssignEmployee?.(task, employeeId)}
          onClose={() => setIsAssignOpen(false)}
          onUnassign={(employeeId) => onUnassignEmployee?.(task, employeeId)}
        />
      ) : null}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
        checked ? "bg-[#2563EB]" : "bg-[#cbd5e1]"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function CalendarPicker({ onChange, value }) {
  // Keyed by `value` at the call site, so a changed value remounts this with
  // a freshly derived visibleMonth instead of needing an effect to resync it.
  const [visibleMonth, setVisibleMonth] = useState(() => getMonthStart(value));

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = new Date(year, month, 1).getDay();
  const cells = [
    ...Array.from({ length: leadingEmptyDays }, (_, index) => ({ key: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      key: `day-${index + 1}`,
      day: index + 1,
    })),
  ];
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  return (
    <div className="border-t border-[#e6ebf2] px-4 py-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-black text-[#2563EB] transition hover:bg-[#eff6ff]"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-sm font-black text-[#0D1E4C]">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-black text-[#2563EB] transition hover:bg-[#eff6ff]"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-black text-[#94a3b8]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.day) {
            return <span key={cell.key} className="h-8" />;
          }

          const cellValue = toDateInputValue(new Date(year, month, cell.day));
          const isSelected = cellValue === value;

          return (
            <button
              type="button"
              key={cell.key}
              onClick={() => onChange(cellValue)}
              className={`h-8 rounded-full text-xs font-black transition ${
                isSelected
                  ? "bg-[#2563EB] text-white shadow-[0_6px_16px_rgba(37,99,235,0.25)]"
                  : "text-[#0D1E4C] hover:bg-[#eff6ff]"
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function parseTimeParts(value) {
  const [rawHour, rawMinute] = String(value || "09:00").split(":").map(Number);
  const hour24 = Number.isNaN(rawHour) ? 9 : rawHour;
  const minute = Number.isNaN(rawMinute) ? 0 : rawMinute;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return { hour12, minute, period };
}

function composeTimeValue({ hour12, minute, period }) {
  const normalizedHour = period === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function WheelColumn({ ariaLabel, onSelect, options, value }) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const visibleOptions =
    options.length <= 2
      ? [
          { isBlank: true, offset: -2, renderKey: "blank-top" },
          { ...options.find((option) => option.value !== value), offset: -1, renderKey: "other" },
          { ...options[selectedIndex], offset: 0, renderKey: "selected" },
          { isBlank: true, offset: 1, renderKey: "blank-bottom-1" },
          { isBlank: true, offset: 2, renderKey: "blank-bottom-2" },
        ]
      : Array.from({ length: 5 }, (_, index) => {
          const offset = index - 2;
          const optionIndex = (selectedIndex + offset + options.length) % options.length;

          return {
            ...options[optionIndex],
            offset,
            renderKey: `${options[optionIndex].value}-${offset}`,
          };
        });

  return (
    <div className="min-w-0 flex-1 rounded-2xl">
      <div className="space-y-1 py-1">
        {visibleOptions.map((option) => {
          if (option.isBlank) {
            return <span key={option.renderKey} className="block h-10" />;
          }

          const isSelected = option.offset === 0;

          return (
            <button
              type="button"
              key={option.renderKey}
              onClick={() => onSelect(option.value)}
              aria-label={`${ariaLabel} ${option.label}`}
              className={`block h-10 w-full rounded-full text-center text-lg transition ${
                isSelected
                  ? "border-2 border-[#2563EB] bg-white font-black text-[#0D1E4C] shadow-sm"
                  : "font-bold text-[#94a3b8] opacity-70 hover:text-[#52627a] hover:opacity-100"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppleTimePicker({ onChange, value }) {
  const timeParts = parseTimeParts(value);
  const selectedMinute = Math.min(55, Math.max(0, Math.round(timeParts.minute / 5) * 5));
  const hourOptions = Array.from({ length: 12 }, (_, index) => ({
    label: String(index + 1),
    value: index + 1,
  }));
  const minuteOptions = Array.from({ length: 12 }, (_, index) => {
    const minute = index * 5;
    return {
      label: String(minute).padStart(2, "0"),
      value: minute,
    };
  });
  const periodOptions = ["AM", "PM"].map((period) => ({ label: period, value: period }));

  function updateTime(nextParts) {
    onChange(composeTimeValue({ ...timeParts, ...nextParts }));
  }

  return (
    <div className="border-t border-[#e6ebf2] px-4 py-4">
      <div className="grid grid-cols-3 gap-2 rounded-3xl bg-white/55 p-2">
        <WheelColumn
          ariaLabel="Hour"
          value={timeParts.hour12}
          options={hourOptions}
          onSelect={(hour12) => updateTime({ hour12 })}
        />
        <WheelColumn
          ariaLabel="Minute"
          value={selectedMinute}
          options={minuteOptions}
          onSelect={(minute) => updateTime({ minute })}
        />
        <WheelColumn
          ariaLabel="Period"
          value={timeParts.period}
          options={periodOptions}
          onSelect={(period) => updateTime({ period })}
        />
      </div>
    </div>
  );
}

function DateTimeSection({
  dateEnabled,
  dateValue,
  onDateChange,
  onDateEnabledChange,
  onTimeChange,
  onTimeEnabledChange,
  timeEnabled,
  timeValue,
  title,
}) {
  function toggleDate(value) {
    if (value && !dateValue) {
      onDateChange(toDateInputValue(new Date()));
    }

    if (!value) {
      onTimeEnabledChange(false);
    }

    onDateEnabledChange(value);
  }

  function toggleTime(value) {
    if (value && !dateEnabled) {
      onDateEnabledChange(true);
      if (!dateValue) onDateChange(toDateInputValue(new Date()));
    }

    if (value && !timeValue) {
      onTimeChange("09:00");
    }

    onTimeEnabledChange(value);
  }

  return (
    <section>
      <h4 className="mb-2 text-sm font-black text-[#52627a]">{title}</h4>
      <div className="overflow-hidden rounded-3xl bg-white/60 backdrop-blur-3xl shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="material-symbols-outlined text-xl text-[#94a3b8]" aria-hidden="true">
            calendar_month
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-[#0D1E4C]">Date</span>
            <span className="block text-xs font-bold text-[#2563EB]">
              {dateEnabled ? formatDateSummary(dateValue) : ""}
            </span>
          </span>
          <ToggleSwitch checked={dateEnabled} onChange={toggleDate} />
        </div>
        {dateEnabled ? <CalendarPicker key={dateValue} value={dateValue} onChange={onDateChange} /> : null}
        <div className="mx-4 border-t border-[#e6ebf2]" />
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="material-symbols-outlined text-xl text-[#94a3b8]" aria-hidden="true">
            schedule
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-[#0D1E4C]">Time</span>
            <span className="block text-xs font-bold text-[#2563EB]">
              {dateEnabled && timeEnabled ? formatTimeSummary(timeValue) : ""}
            </span>
          </span>
          <ToggleSwitch
            checked={dateEnabled && timeEnabled}
            onChange={toggleTime}
          />
        </div>
        {dateEnabled && timeEnabled ? (
          <AppleTimePicker value={timeValue} onChange={onTimeChange} />
        ) : null}
      </div>
    </section>
  );
}

function SelectRow({ icon, isLast = false, label, onChange, options, value }) {
  const [isOpen, setIsOpen] = useState(false);

  function selectOption(option) {
    onChange(option);
    setIsOpen(false);
  }

  return (
    <>
      <div className="relative flex items-center gap-3 px-4 py-3">
        {icon ? (
          <span className="material-symbols-outlined text-xl text-[#94a3b8]" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-sm font-black text-[#0D1E4C]">{label}</span>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex min-w-28 items-center justify-end gap-1 py-2 pl-2 text-right text-sm font-black text-[#52627a] outline-none transition hover:text-[#0D1E4C]"
            aria-expanded={isOpen}
          >
            <span>{value}</span>
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              expand_all
            </span>
          </button>

          {isOpen ? (
            <div className="absolute right-0 top-full z-[200] min-w-44 overflow-hidden rounded-3xl border border-white/80 bg-white px-2 py-2 shadow-[0_24px_60px_rgba(13,30,76,0.34)]">
              {options.map((option) => {
                const isSelected = option === value;

                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => selectOption(option)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-semibold rounded-full text-black transition hover:bg-black/10"
                  >
                    <span className="flex w-4 items-center justify-center">
                      {isSelected ? (
                        <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
                          check_small
                        </span>
                      ) : null}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {!isLast ? <div className="mx-4 border-t border-[#e6ebf2]" /> : null}
    </>
  );
}

function GroupPicker({ groups, onChange, value, locked = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedGroup = groups.find((group) => sameId(group.group_id, value));
  const selectedName = selectedGroup?.group_name || "No group";

  function selectGroup(groupId) {
    if (locked) return;
    onChange(groupId);
    setIsOpen(false);
  }

  return (
    <section className="relative z-20 overflow-hidden rounded-3xl bg-white/60 backdrop-blur-3xl shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (!locked) setIsOpen((current) => !current);
        }}
        disabled={locked}
        title={locked ? "Approve this AI-generated task before moving it to a different group." : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition ${
          locked ? "cursor-not-allowed opacity-60" : "hover:bg-white/35"
        }`}
        aria-expanded={isOpen}
      >
        <span className="material-symbols-outlined text-xl text-[#94a3b8]" aria-hidden="true">
          amp_stories
        </span>
        <span className="min-w-0 flex-1 text-sm font-black text-[#0D1E4C]">Group</span>
        <span className="inline-flex min-w-0 max-w-40 shrink-0 items-center justify-end gap-1 text-right text-sm font-black text-[#52627a]">
          <span className="truncate">{selectedName}</span>
          <span
            className={`material-symbols-outlined text-xl ${locked ? "" : `transition-transform ${isOpen ? "rotate-180" : ""}`}`}
            aria-hidden="true"
          >
            {locked ? "lock" : "arrow_drop_down"}
          </span>
        </span>
      </button>

      {isOpen && !locked ? (
        <>
          <div className="mx-4 border-t border-[#e6ebf2]" />
          <div className="space-y-1 px-3 py-2">
            {groups.map((group) => {
              const isSelected = sameId(group.group_id, value);

              return (
                <button
                  type="button"
                  key={group.group_id}
                  onClick={() => selectGroup(group.group_id)}
                  className={`flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-semibold transition ${
                    isSelected ? "bg-black/10 text-[#0D1E4C]" : "text-[#52627a] hover:bg-black/5"
                  }`}
                >
                  <span className="flex w-4 items-center justify-center">
                    {isSelected ? (
                      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
                        check_small
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate">{group.group_name}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function TaskEditPanel({
  groups = [],
  onArchive,
  onClose,
  onDelete,
  onSave,
  onSkillCreate,
  skills = [],
  task,
}) {
  const startParts = splitDateTime(task?.start_datetime);
  const endParts = splitDateTime(task?.end_datetime);
  const [form, setForm] = useState(() => ({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "Open",
    priority: task?.priority ?? "Medium",
    repeat: "Never",
    groupId: task?.group_id ?? "",
    requiredSkillIds: (task?.requiredSkills ?? []).map((skill) => skill.skill_id),
    startDateEnabled: Boolean(startParts.date),
    startDate: startParts.date,
    startTimeEnabled: Boolean(startParts.time),
    startTime: startParts.time,
    endDateEnabled: Boolean(endParts.date),
    endDate: endParts.date,
    endTimeEnabled: Boolean(endParts.time),
    endTime: endParts.time,
  }));
  const isPendingApproval = task?.source === "optimus_ai" && task?.ai_state !== "accepted";
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [openPanel, setOpenPanel] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [isSuggestingSkills, setIsSuggestingSkills] = useState(false);
  const [isWritingDescription, setIsWritingDescription] = useState(false);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);

  // Keyed by task_id at the call site, so switching tasks remounts this panel
  // with fresh state from the useState initializers above instead of needing
  // an effect to resync form/error/openPanel/skillQuery on every task change.

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleSkill(skillId) {
    setForm((current) => {
      const currentIds = current.requiredSkillIds ?? [];
      const nextIds = currentIds.includes(skillId)
        ? currentIds.filter((id) => id !== skillId)
        : [...currentIds, skillId];

      return { ...current, requiredSkillIds: nextIds };
    });
  }

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function suggestSkillsWithAI() {
    if (!form.title.trim() || isSuggestingSkills) return;

    setIsSuggestingSkills(true);

    try {
      const response = await fetch("/api/agent/suggest-skills", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ title: form.title, description: form.description }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not suggest skills.");
      }

      const suggestedIds = Array.isArray(result.skillIds) ? result.skillIds : [];
      setForm((current) => ({
        ...current,
        requiredSkillIds: [...new Set([...current.requiredSkillIds, ...suggestedIds])],
      }));
    } catch (suggestError) {
      setError(suggestError.message || "Could not suggest skills.");
    } finally {
      setIsSuggestingSkills(false);
    }
  }

  async function writeDescriptionWithAI() {
    if (!form.title.trim() || isWritingDescription) return;

    setIsWritingDescription(true);

    try {
      const response = await fetch("/api/agent/write-description", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ title: form.title }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not write a description.");
      }

      updateField("description", result.description ?? "");
    } catch (writeError) {
      setError(writeError.message || "Could not write a description.");
    } finally {
      setIsWritingDescription(false);
    }
  }

  async function handleCreateSkill() {
    const name = skillQuery.trim();
    if (!name || isCreatingSkill || !onSkillCreate) return;

    setIsCreatingSkill(true);

    try {
      const skill = await onSkillCreate(name);

      if (skill) {
        setForm((current) => ({
          ...current,
          requiredSkillIds: current.requiredSkillIds.includes(skill.skill_id)
            ? current.requiredSkillIds
            : [...current.requiredSkillIds, skill.skill_id],
        }));
        setSkillQuery("");
      }
    } catch (createError) {
      setError(createError.message || "Could not create skill.");
    } finally {
      setIsCreatingSkill(false);
    }
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
      await onSave?.(task, {
        title: cleanTitle,
        description: form.description,
        status: form.status,
        priority: form.priority,
        groupId: form.groupId || null,
        requiredSkillIds: form.requiredSkillIds,
        startDatetime: combineDateTime({
          date: form.startDate,
          isDateEnabled: form.startDateEnabled,
          isTimeEnabled: form.startTimeEnabled,
          time: form.startTime,
        }),
        endDatetime: combineDateTime({
          date: form.endDate,
          isDateEnabled: form.endDateEnabled,
          isTimeEnabled: form.endTimeEnabled,
          time: form.endTime,
        }),
      });
      onClose?.();
    } catch (saveError) {
      setError(saveError.message || "Could not save task.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchiveTask() {
    if (!task?.task_id || task?.isNew || !onArchive) return;

    setIsArchiving(true);
    setError("");

    try {
      await onArchive(task);
      onClose?.();
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive task.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleDeleteTask() {
    if (!task?.task_id || task?.isNew || !onDelete) return;

    setIsDeleting(true);
    setError("");

    try {
      await onDelete(task);
      onClose?.();
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete task.");
    } finally {
      setIsDeleting(false);
    }
  }

  const selectedSkills = skills.filter((skill) => form.requiredSkillIds.includes(skill.skill_id));
  const trimmedSkillQuery = skillQuery.trim();
  const filteredSkills = trimmedSkillQuery
    ? skills.filter((skill) => skill.skill_name.toLowerCase().includes(trimmedSkillQuery.toLowerCase()))
    : skills;
  const canCreateSkill =
    Boolean(onSkillCreate) &&
    trimmedSkillQuery.length > 0 &&
    !skills.some((skill) => skill.skill_name.toLowerCase() === trimmedSkillQuery.toLowerCase());

  return createPortal(
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[999] flex w-full items-start justify-end px-7 pb-8 pt-26">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close task editor"
      />
      <form
        onSubmit={handleSave}
        className="pointer-events-auto relative z-10 flex max-h-[calc(100vh-9.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/10 shadow-[0_24px_80px_rgba(13,30,76,0.25)] backdrop-blur-md"
      >
        <div className="grid shrink-0 grid-cols-3 items-center gap-4 px-6 pb-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center justify-self-start rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-110 hover:bg-white/70"
            aria-label="Close task editor"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>
          <h3 className="justify-self-center text-xl font-black text-[#0D1E4C]">Details</h3>
          <button
            type="submit"
            disabled={isSaving}
            className="flex h-11 w-11 items-center justify-center justify-self-end rounded-full bg-[#2563EB] text-white transition hover:scale-110 hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Save task"
          >
            <span className="material-symbols-outlined text-[28px] leading-none" aria-hidden="true">
              check
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <section className="rounded-3xl bg-white/60 backdrop-blur-3xl px-6 py-2 shadow-sm">
            <input
              type="text"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Title"
              className="h-11 w-full border-0 bg-transparent text-lg font-black text-[#0D1E4C] outline-none placeholder:text-[#94a3b8]"
            />
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={3}
              placeholder="Description"
              className="mt-1 w-full resize-none border-0 bg-transparent text-sm font-semibold leading-6 text-[#0D1E4C] outline-none placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              onClick={writeDescriptionWithAI}
              disabled={!form.title.trim() || isWritingDescription}
              className="mb-2 flex items-center gap-1 rounded-full bg-[#2563EB]/10 px-3 py-1.5 text-[11px] font-black text-[#2563EB] transition hover:bg-[#2563EB]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                auto_awesome
              </span>
              {isWritingDescription ? "Writing…" : "Write with AI"}
            </button>
          </section>

          <DateTimeSection
            title="Start Date & Time"
            dateEnabled={form.startDateEnabled}
            dateValue={form.startDate}
            timeEnabled={form.startTimeEnabled}
            timeValue={form.startTime}
            onDateEnabledChange={(value) => updateField("startDateEnabled", value)}
            onDateChange={(value) => updateField("startDate", value)}
            onTimeEnabledChange={(value) => updateField("startTimeEnabled", value)}
            onTimeChange={(value) => updateField("startTime", value)}
          />

          <DateTimeSection
            title="End Date & Time"
            dateEnabled={form.endDateEnabled}
            dateValue={form.endDate}
            timeEnabled={form.endTimeEnabled}
            timeValue={form.endTime}
            onDateEnabledChange={(value) => updateField("endDateEnabled", value)}
            onDateChange={(value) => updateField("endDate", value)}
            onTimeEnabledChange={(value) => updateField("endTimeEnabled", value)}
            onTimeChange={(value) => updateField("endTime", value)}
          />

          <section className="relative z-30 rounded-3xl bg-white/60 backdrop-blur-3xl shadow-sm">
            <SelectRow
              icon="rule"
              label="Status"
              value={form.status}
              options={STATUS_OPTIONS}
              onChange={(value) => updateField("status", value)}
            />
            <SelectRow
              icon="priority_high"
              label="Priority"
              value={form.priority}
              options={PRIORITY_OPTIONS}
              onChange={(value) => updateField("priority", value)}
            />
            <SelectRow
              icon="repeat"
              label="Repeat"
              value={form.repeat}
              options={REPEAT_OPTIONS}
              onChange={(value) => updateField("repeat", value)}
              isLast
            />
          </section>

          <GroupPicker
            groups={groups}
            value={form.groupId}
            onChange={(value) => updateField("groupId", value)}
            locked={isPendingApproval}
          />

          <section className="relative z-0 overflow-hidden rounded-3xl bg-white/70 shadow-sm">
            <button
              type="button"
              onClick={() => setOpenPanel((current) => (current === "attachments" ? "" : "attachments"))}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black text-[#0D1E4C] transition hover:bg-white/70"
            >
              <span>Attachments</span>
              <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-black text-[#2563EB]">
                Open
              </span>
            </button>
            <div className="mx-4 border-t border-[#e6ebf2]" />
            <button
              type="button"
              onClick={() => setOpenPanel((current) => (current === "comments" ? "" : "comments"))}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black text-[#0D1E4C] transition hover:bg-white/70"
            >
              <span>Comments</span>
              <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-black text-[#2563EB]">
                Open
              </span>
            </button>
          </section>

          {openPanel ? (
            <section className="relative z-0 rounded-3xl bg-white/70 px-4 py-4 text-sm font-semibold text-[#667085] shadow-sm">
              {openPanel === "attachments"
                ? "Attachments panel is ready for file/link controls."
                : "Comments panel is ready for discussion controls."}
            </section>
          ) : null}

          <section className="relative z-0 rounded-3xl bg-white/60 backdrop-blur-3xl px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black normal-case text-[#0D1E4C]">Required Skills</p>
              <button
                type="button"
                onClick={suggestSkillsWithAI}
                disabled={!form.title.trim() || isSuggestingSkills}
                className="flex items-center gap-1 rounded-full bg-[#2563EB]/10 px-3 py-1.5 text-[11px] font-black text-[#2563EB] transition hover:bg-[#2563EB]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  auto_awesome
                </span>
                {isSuggestingSkills ? "Suggesting…" : "Suggest with AI"}
              </button>
            </div>

            {selectedSkills.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedSkills.map((skill) => (
                  <button
                    type="button"
                    key={skill.skill_id}
                    onClick={() => toggleSkill(skill.skill_id)}
                    className="flex items-center rounded-full bg-[#2563EB] px-3 py-1 text-xs font-black text-white transition hover:bg-[#1d4ed8]"
                  >
                    {skill.skill_name}
                    <span className="material-symbols-outlined text-sm scale-80" aria-hidden="true">
                      close
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs font-semibold text-[#94a3b8]"></p>
            )}

            <input
              type="text"
              value={skillQuery}
              onChange={(event) => setSkillQuery(event.target.value)}
              placeholder="Search skills…"
              className="mt-3 h-9 w-full rounded-full border border-[#e6ebf2] bg-white/70 px-3 text-xs font-semibold text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#2563EB]"
            />

            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
              {canCreateSkill ? (
                <button
                  type="button"
                  onClick={handleCreateSkill}
                  disabled={isCreatingSkill}
                  className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-[#2563EB]/40 bg-[#2563EB]/5 px-3 py-2 text-left transition hover:bg-[#2563EB]/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-sm text-[#2563EB]" aria-hidden="true">
                    add
                  </span>
                  <span className="truncate text-xs font-black text-[#2563EB]">
                    {isCreatingSkill ? "Creating…" : `Create "${trimmedSkillQuery}"`}
                  </span>
                </button>
              ) : null}

              {filteredSkills.map((skill) => {
                const isSelected = form.requiredSkillIds.includes(skill.skill_id);

                return (
                  <button
                    type="button"
                    key={skill.skill_id}
                    onClick={() => toggleSkill(skill.skill_id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition ${
                      isSelected ? "bg-[#dbeafe]" : "bg-white/60 hover:bg-white"
                    }`}
                  >
                    <span className="truncate text-xs font-black text-[#0D1E4C]">
                      {skill.skill_name}
                    </span>
                    <span className="text-xs font-black text-[#2563EB]">
                      {isSelected ? "Selected" : "Add"}
                    </span>
                  </button>
                );
              })}

              {!filteredSkills.length && !canCreateSkill ? (
                <p className="px-1 text-xs font-semibold text-[#94a3b8]">No matching skills.</p>
              ) : null}
            </div>
          </section>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}

          {!task?.isNew ? (
            <div className="inline-flex w-full overflow-hidden rounded-full border border-white/60 bg-white/30 shadow-sm backdrop-blur-sm">
              <button
                type="button"
                onClick={handleDeleteTask}
                disabled={isDeleting || isArchiving}
                className="flex h-11 flex-1 items-center justify-center text-sm font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
              <div className="w-px bg-white/70" />
              <button
                type="button"
                onClick={handleArchiveTask}
                disabled={isDeleting || isArchiving}
                className="flex h-11 flex-1 items-center justify-center text-sm font-black text-[#0D1E4C] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isArchiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          ) : null}
        </div>

      </form>
    </div>,
    document.body,
  );
}

// Read-only sibling of TaskEditPanel — same slide-in shell, but nothing on
// it is editable. Used by the employee board, where task details are for
// viewing only; the sole action is marking the task complete (also
// available directly on the card).
export function TaskViewPanel({ employees = [], onClose, onComplete, task }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [activePanel, setActivePanel] = useState("details");
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [isLoadingExtras, setIsLoadingExtras] = useState(false);
  const [extrasError, setExtrasError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingAttachmentId, setIsDeletingAttachmentId] = useState(null);
  const [isDeletingCommentId, setIsDeletingCommentId] = useState(null);
  const [commentContextMenu, setCommentContextMenu] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const fileInputRef = useRef(null);
  const taskId = task?.task_id ?? null;

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      setCurrentUserId(data.session?.user?.id ?? null);
    })();
  }, []);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function loadExtras(id) {
    setIsLoadingExtras(true);
    setExtrasError("");

    try {
      const headers = await authHeaders();
      const [commentsResponse, attachmentsResponse] = await Promise.all([
        fetch(`/api/task-comments?taskId=${id}`, { headers }),
        fetch(`/api/task-attachments?taskId=${id}`, { headers }),
      ]);
      const [commentsResult, attachmentsResult] = await Promise.all([
        commentsResponse.json(),
        attachmentsResponse.json(),
      ]);

      setComments(commentsResponse.ok ? commentsResult.comments ?? [] : []);
      setAttachments(attachmentsResponse.ok ? attachmentsResult.attachments ?? [] : []);
    } catch (loadError) {
      setExtrasError(loadError.message);
    } finally {
      setIsLoadingExtras(false);
    }
  }

  useEffect(() => {
    if (!taskId) return;

    (async () => {
      setActivePanel("details");
      setCommentDraft("");
      await loadExtras(taskId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) return null;

  const priorityTone = PRIORITY_TONES[getPriorityKey(task.priority)] ?? PRIORITY_TONES.medium;
  const statusTone = STATUS_TONES[getStatusKey(task.status)] ?? STATUS_TONES.open;
  const isCompleted = getStatusKey(task.status) === "completed";
  const assignees = (task.assigneeIds ?? [])
    .map((userId) => employees.find((employee) => employee.user_id === userId))
    .filter(Boolean);

  async function handleComplete() {
    if (isCompleting || isCompleted) return;
    setIsCompleting(true);
    try {
      await onComplete?.(task);
    } finally {
      setIsCompleting(false);
    }
  }

  async function postComment() {
    const text = commentDraft.trim();
    if (!text || isPostingComment || !taskId) return;

    setIsPostingComment(true);
    setExtrasError("");

    try {
      const response = await fetch("/api/task-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ taskId, commentText: text }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not post comment.");
      }

      setComments((current) => [...current, result.comment]);
      setCommentDraft("");
    } catch (postError) {
      setExtrasError(postError.message);
    } finally {
      setIsPostingComment(false);
    }
  }

  function handleCommentContextMenu(event, comment) {
    if (comment.userId !== currentUserId) return;
    event.preventDefault();
    setCommentContextMenu({ commentId: comment.id, x: event.clientX, y: event.clientY });
  }

  async function deleteComment(commentId) {
    if (isDeletingCommentId) return;

    setIsDeletingCommentId(commentId);
    setExtrasError("");

    try {
      const response = await fetch(`/api/task-comments?commentId=${commentId}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete comment.");
      }

      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (deleteError) {
      setExtrasError(deleteError.message);
    } finally {
      setIsDeletingCommentId(null);
    }
  }

  async function uploadAttachment(file) {
    if (!file || isUploading || !taskId) return;

    setIsUploading(true);
    setExtrasError("");

    try {
      const formData = new FormData();
      formData.append("taskId", String(taskId));
      formData.append("file", file);

      const response = await fetch("/api/task-attachments", {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not upload file.");
      }

      setAttachments((current) => [...current, result.attachment]);
    } catch (uploadError) {
      setExtrasError(uploadError.message);
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteAttachment(attachmentId) {
    if (isDeletingAttachmentId) return;

    setIsDeletingAttachmentId(attachmentId);
    setExtrasError("");

    try {
      const response = await fetch(`/api/task-attachments?attachmentId=${attachmentId}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete attachment.");
      }

      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    } catch (deleteError) {
      setExtrasError(deleteError.message);
    } finally {
      setIsDeletingAttachmentId(null);
    }
  }

  const panelTitle =
    activePanel === "comments" ? "Comments" : activePanel === "attachments" ? "Attachments" : "Details";

  return createPortal(
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[999] flex w-full items-start justify-end px-7 pb-8 pt-26">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close task details"
      />
      <div className="pointer-events-auto relative z-10 flex max-h-[calc(100vh-9.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/10 shadow-[0_24px_80px_rgba(13,30,76,0.25)] backdrop-blur-md">
        <div className="grid shrink-0 grid-cols-3 items-center gap-4 px-6 pb-6 pt-5">
          {activePanel !== "details" ? (
            <button
              type="button"
              onClick={() => setActivePanel("details")}
              className="flex h-11 w-11 items-center justify-center justify-self-start rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-110 hover:bg-white/70"
              aria-label="Back to details"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                arrow_back
              </span>
            </button>
          ) : (
            <div aria-hidden="true" />
          )}
          <h3 className="justify-self-center text-xl font-black text-[#0D1E4C]">{panelTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center justify-self-end rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-110 hover:bg-white/70"
            aria-label="Close task details"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        {activePanel === "details" ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-black tracking-wide ${statusTone.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
                {formatPillLabel(task.status, "Open")}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-black tracking-wide ${priorityTone.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${priorityTone.dot}`} />
                {formatPillLabel(task.priority, "Medium")}
              </span>
            </div>

            <h2 className="text-xl font-black text-[#0D1E4C]">{task.title || "Untitled task"}</h2>

            {task.description ? (
              <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-[#475569]">{task.description}</p>
            ) : (
              <p className="text-sm font-semibold text-[#94a3b8]">No description.</p>
            )}

            <TimelineRail start={task.start_datetime} end={task.end_datetime} />

            <section className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wide text-[#94a3b8]">Assigned to</p>
              {assignees.length ? (
                assignees.map((assignee) => <AssigneeProfile key={assignee.user_id} employee={assignee} />)
              ) : (
                <AssigneeProfile employee={null} />
              )}
            </section>

            {task.requiredSkills?.length ? (
              <section className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wide text-[#94a3b8]">Required skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {task.requiredSkills.map((skill) => (
                    <span
                      key={skill.skill_id}
                      className="rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-[#0D1E4C]"
                    >
                      {skill.skill_name}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex items-center justify-center gap-8 pt-1">
              <button
                type="button"
                onClick={() => setActivePanel("comments")}
                className="flex items-center gap-1.5 text-[#667085] transition hover:text-[#0D1E4C]"
                aria-label="Comments"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
                  />
                </svg>
                <span className="text-xs font-bold">{comments.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("attachments")}
                className="flex items-center gap-1.5 text-[#667085] transition hover:text-[#0D1E4C]"
                aria-label="Attachments"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  attach_file
                </span>
                <span className="text-xs font-bold">{attachments.length}</span>
              </button>
            </div>
          </div>
        ) : activePanel === "comments" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-4">
              {isLoadingExtras ? (
                <p className="py-8 text-center text-sm font-semibold text-[#94a3b8]">Loading comments…</p>
              ) : comments.length ? (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    onContextMenu={(event) => handleCommentContextMenu(event, comment)}
                    className={`rounded-2xl bg-white/45 px-3.5 py-2.5 transition ${
                      comment.userId === currentUserId ? "cursor-context-menu hover:bg-white/65" : ""
                    } ${isDeletingCommentId === comment.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <AvatarCircle employee={comment.author} sizeClass="h-6 w-6" className="text-[9px]" />
                      <span className="truncate text-xs font-black text-[#0D1E4C]">
                        {getDisplayName(comment.author)}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] font-semibold text-[#94a3b8]">
                        {formatRelativeTimestamp(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium leading-5 text-[#334155]">
                      {comment.commentText}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm font-semibold text-[#94a3b8]">No comments yet.</p>
              )}
            </div>

            <div className="shrink-0 border-t border-white/50 px-6 pb-6 pt-4">
              {extrasError ? <p className="mb-2 text-xs font-semibold text-red-600">{extrasError}</p> : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment…"
                  rows={1}
                  className="min-h-11 flex-1 resize-none rounded-2xl border border-white/60 bg-white/50 px-3.5 py-2.5 text-sm font-medium text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#2563EB]/50"
                />
                <button
                  type="button"
                  onClick={postComment}
                  disabled={!commentDraft.trim() || isPostingComment}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/60 bg-slate-200 text-[#0D1E4C] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send comment"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    send
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6">
            {extrasError ? <p className="text-xs font-semibold text-red-600">{extrasError}</p> : null}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) uploadAttachment(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-white/30 px-4 py-6 text-center transition hover:border-[#2563EB]/50 hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-2xl text-[#94a3b8]" aria-hidden="true">
                upload_file
              </span>
              <span className="text-xs font-bold text-[#0D1E4C]">
                {isUploading ? "Uploading…" : "Click to upload a file"}
              </span>
            </button>

            {isLoadingExtras ? (
              <p className="py-8 text-center text-sm font-semibold text-[#94a3b8]">Loading attachments…</p>
            ) : attachments.length ? (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-2xl bg-white/45 px-3.5 py-2.5 transition hover:bg-white/65"
                  >
                    <a
                      href={attachment.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="material-symbols-outlined text-xl text-[#667085]" aria-hidden="true">
                        description
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-[#0D1E4C]">
                          {attachment.fileName}
                        </span>
                        <span className="block text-[10px] font-semibold text-[#94a3b8]">
                          {formatFileSize(attachment.fileSize)} · {getDisplayName(attachment.author)}
                        </span>
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteAttachment(attachment.id)}
                      disabled={isDeletingAttachmentId === attachment.id}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${attachment.fileName}`}
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">
                        close
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm font-semibold text-[#94a3b8]">No attachments yet.</p>
            )}
          </div>
        )}

        {activePanel === "details" ? (
          <div className="shrink-0 px-6 pb-6 pt-2">
            <button
              type="button"
              onClick={handleComplete}
              disabled={isCompleting || isCompleted}
              className={`w-full rounded-2xl border py-3 text-sm font-black transition disabled:cursor-not-allowed ${
                isCompleted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-white/60 bg-slate-200 text-slate-800 hover:scale-[1.02] disabled:opacity-60"
              }`}
            >
              {isCompleted ? "Completed" : isCompleting ? "Marking…" : "Mark as Completed"}
            </button>
          </div>
        ) : null}
      </div>

      {commentContextMenu ? (
        <>
          <button
            type="button"
            className="pointer-events-auto fixed inset-0 z-[1000] cursor-default"
            onClick={() => setCommentContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setCommentContextMenu(null);
            }}
            aria-label="Close menu"
          />
          <div
            className="pointer-events-auto fixed z-[1001] w-40 overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_18px_50px_rgba(7,24,59,0.18)]"
            style={{ top: commentContextMenu.y, left: commentContextMenu.x }}
          >
            <button
              type="button"
              onClick={() => {
                deleteComment(commentContextMenu.commentId);
                setCommentContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-red-600 transition hover:bg-red-50"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                delete
              </span>
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

function DeleteGroupModal({ count, name, onCancel, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm(migrate) {
    setIsSubmitting(true);
    setError("");

    try {
      await onConfirm(migrate);
    } catch (confirmError) {
      setError(confirmError.message || "Could not delete group.");
      setIsSubmitting(false);
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center bg-black/10 p-4 backdrop-blur-sm"
        onClick={onCancel}
      >
        <div
          className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-[0_28px_80px_rgba(0,0,0,0.3)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-black text-[#0D1E4C]">Delete &quot;{name}&quot;?</h2>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              aria-label="Cancel"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:bg-white/70 hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          <p className="mt-3 text-sm font-semibold leading-6 text-[#52627a]">
            {count > 0
              ? `${count} task${count === 1 ? "" : "s"} exist in this group. Do you want to migrate them to a new group?`
              : "This group has no tasks."}
          </p>

          {error ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            {count > 0 ? (
              <button
                type="button"
                onClick={() => handleConfirm(true)}
                disabled={isSubmitting}
                className="rounded-full bg-[#0D1E4C] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a1838] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Migrating…" : "Migrate"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => handleConfirm(false)}
              disabled={isSubmitting}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function ColumnHeader({ count, groupId, name, onGroupCreate, onGroupDelete, onRename, viewOnly = false }) {
  // Keyed by `name` at the call site, so a rename (local or external) remounts
  // this with a fresh draftName instead of needing an effect to resync it.
  const [draftName, setDraftName] = useState(name);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    function close() {
      setIsMenuOpen(false);
    }

    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [isMenuOpen]);

  if (viewOnly) {
    return (
      <div className="mb-4 flex shrink-0 items-center gap-2 px-1">
        <span className="h-4 w-4 rounded-full border-2 border-[#cbd5e1]" />
        <span className="min-w-0 flex-1 truncate text-sm font-black text-[#0D1E4C]">{name}</span>
        <span className="rounded-full bg-[#eef2f8] px-2 py-0.5 text-xs font-bold text-[#94a3b8]">{count}</span>
      </div>
    );
  }

  function saveName() {
    const nextName = draftName.trim();

    if (!nextName) {
      setDraftName(name);
      return;
    }

    if (!Number.isFinite(Number(groupId))) {
      setDraftName(name);
      return;
    }

    if (nextName !== name) {
      onRename?.(groupId, nextName);
    }
  }

  async function handleDeleteConfirm(migrate) {
    if (migrate) {
      const newGroup = await onGroupCreate?.();
      await onGroupDelete?.(groupId, { migrateToGroupId: newGroup?.group_id });
    } else {
      await onGroupDelete?.(groupId, { deleteTasks: true });
    }

    setIsConfirmOpen(false);
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
      <span className="mr-1 rounded-full bg-[#eef2f8] px-2 py-0.5 text-xs font-bold text-[#94a3b8]">
        {count}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsMenuOpen((current) => !current);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#94a3b8] transition hover:bg-white/60 hover:text-[#0D1E4C]"
          aria-label={`${name} group options`}
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            more_horiz
          </span>
        </button>

        {isMenuOpen ? (
          <div
            className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-2xl border border-white/60 bg-white/60 backdrop-blur-3xl shadow-[0_18px_50px_rgba(7,24,59,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsConfirmOpen(true);
              }}
              className="block w-full px-4 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {isConfirmOpen ? (
        <DeleteGroupModal
          count={count}
          name={name}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </div>
  );
}

const BOARD_COLUMN_GAP_PX = 16; // matches the board scroll row's gap-4

// Sizes each column to exactly 1/N of the board's visible width (accounting
// for the gaps between columns), so switching to N columns shows exactly N
// full columns at rest instead of a partial glimpse of the next one.
function getColumnWidthStyle(columnLayout) {
  return { width: `calc((100% - ${(columnLayout - 1) * BOARD_COLUMN_GAP_PX}px) / ${columnLayout})` };
}

export default function WorkspaceBoard({
  columnLayout = 4,
  employees = [],
  error = "",
  groups = [],
  isLoading = false,
  onGroupCreate,
  onGroupDelete,
  onGroupRename,
  onSkillCreate,
  onTaskAiAssign,
  onTaskApprove,
  onTaskArchive,
  onTaskAssignEmployee,
  onTaskComplete,
  onTaskCreate,
  onTaskDelete,
  onTaskReject,
  onTaskUnassignEmployee,
  onTaskUpdate,
  skills = [],
  tasks = [],
  viewOnly = false,
}) {
  const [editingTask, setEditingTask] = useState(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const boardScrollRef = useRef(null);
  const previousGroupCountRef = useRef(groups.length);
  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );

  const columns = useMemo(() => {
    const rawColumns = buildBoardColumns({ groups, tasks });

    return rawColumns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => enrichTaskWithPeople(task, employeesById)),
    }));
  }, [employeesById, groups, tasks]);

  const currentEditingTask = editingTask
    ? tasks.find((task) => task.task_id === editingTask.task_id) ?? editingTask
    : null;

  useEffect(() => {
    const previousGroupCount = previousGroupCountRef.current;
    previousGroupCountRef.current = groups.length;

    if (groups.length > previousGroupCount) {
      requestAnimationFrame(() => {
        const scrollElement = boardScrollRef.current;
        if (scrollElement) {
          scrollElement.scrollTo({
            left: scrollElement.scrollWidth,
            behavior: "smooth",
          });
        }
      });
    }
  }, [groups.length]);

  // Column widths change with the layout, so a stale scroll offset would
  // otherwise land mid-column and show a partial sliver at the left edge.
  useEffect(() => {
    boardScrollRef.current?.scrollTo({ left: 0 });
  }, [columnLayout]);

  function handleOpenNewTask() {
    setEditingTask({
      task_id: "__new_task__",
      title: "",
      description: "",
      status: "Open",
      priority: "Medium",
      group_id: groups[0]?.group_id ?? "",
      assigned_to: null,
      start_datetime: null,
      end_datetime: null,
      source: "manual",
      isNew: true,
    });
  }

  async function handleCreateGroup() {
    if (!onGroupCreate || isCreatingGroup) return;

    setIsCreatingGroup(true);

    try {
      await onGroupCreate();
    } finally {
      setIsCreatingGroup(false);
    }
  }

  useEffect(() => {
    if (!isAddMenuOpen) return;
    function handleWindowClick() {
      setIsAddMenuOpen(false);
    }
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, [isAddMenuOpen]);

  async function handleTaskSave(task, updates) {
    if (task?.isNew) {
      await onTaskCreate?.(updates);
      return;
    }

    await onTaskUpdate?.(task, updates);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-[#52627a]">
        Loading board...
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

  return (
    <div className="relative h-full min-h-0">
      <div ref={boardScrollRef} className="flex h-full min-h-0 gap-4 overflow-x-auto pb-2">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex shrink-0 flex-col"
            style={getColumnWidthStyle(columnLayout)}
          >
            <ColumnHeader
              key={column.name}
              groupId={column.id}
              name={column.name}
              count={column.tasks.length}
              onRename={onGroupRename}
              onGroupCreate={onGroupCreate}
              onGroupDelete={onGroupDelete}
              viewOnly={viewOnly}
            />

            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 pt-2"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)",
              }}
            >
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.task_id}
                  compact={columnLayout === 5}
                  employees={employees}
                  groupName={column.name}
                  onAiAssign={onTaskAiAssign}
                  onApprove={onTaskApprove}
                  onAssignEmployee={onTaskAssignEmployee}
                  onComplete={onTaskComplete}
                  onOpen={setEditingTask}
                  onReject={onTaskReject}
                  onUnassignEmployee={onTaskUnassignEmployee}
                  task={task}
                  tasks={tasks}
                  viewOnly={viewOnly}
                />
              ))}

              {!column.tasks.length ? (
                <div className="rounded-2xl border-2 border-dashed border-[#cbd5e1] py-8 text-center text-sm font-bold text-[#94a3b8]">
                  No tasks in this group.
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {columns.length > columnLayout ? (
          // Reserves scroll-end clearance for the floating "add group" button as
          // its own flex item — CSS padding on the scroll row won't do here,
          // since overflowing columns render straight through padding space.
          <div className="w-16 shrink-0" aria-hidden="true" />
        ) : null}
      </div>

      {!viewOnly ? (
        <div className="absolute right-2 top-1/2 z-30 -translate-y-1/2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsAddMenuOpen((current) => !current);
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/10 text-3xl font-light leading-none text-[#0D1E4C] shadow-[0_12px_30px_rgba(13,30,76,0.18)] backdrop-blur-xl transition hover:scale-105 hover:bg-white"
            aria-label="Add"
          >
            +
          </button>
          {isAddMenuOpen ? (
            <div
              onClick={(event) => event.stopPropagation()}
              className="absolute right-0 -top-4 w-44 px-2 py-2 overflow-hidden rounded-3xl border border-white/60 bg-white backdrop-blur-3xl shadow-[0_18px_50px_rgba(7,24,59,0.18)]"
            >
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  handleOpenNewTask();
                }}
                className="block w-full py-2.5 text-center text-sm font-bold rounded-full text-[#0D1E4C] hover:bg-neutral-100"
              >
                Add New Task
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  handleCreateGroup();
                }}
                disabled={isCreatingGroup}
                className="block w-full py-2.5 text-center text-sm font-bold rounded-full text-[#0D1E4C] hover:bg-neutral-100"
              >
                Add New Group
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {currentEditingTask ? (
        viewOnly ? (
          <TaskViewPanel
            employees={employees}
            onClose={() => setEditingTask(null)}
            onComplete={onTaskComplete}
            task={currentEditingTask}
          />
        ) : (
          <TaskEditPanel
            key={currentEditingTask?.task_id ?? "new"}
            groups={groups}
            skills={skills}
            task={currentEditingTask}
            onArchive={onTaskArchive}
            onClose={() => setEditingTask(null)}
            onDelete={onTaskDelete}
            onSave={handleTaskSave}
            onSkillCreate={onSkillCreate}
          />
        )
      ) : null}
    </div>
  );
}
