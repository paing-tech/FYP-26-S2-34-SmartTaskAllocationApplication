"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import EmployeeProfileCard from "@/components/EmployeeProfileCard";
import HoverPill from "@/components/HoverPill";

function formatDateHeader(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

export default function AllocationHistory({ onClose } = {}) {
  const [allocations, setAllocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [error, setError] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function loadAll() {
    try {
      const headers = await authHeaders();
      const [allocRes, empRes] = await Promise.all([
        fetch("/api/allocations", { headers }),
        fetch("/api/employees", { headers }),
      ]);
      const allocData = await allocRes.json();
      const empData = await empRes.json();
      if (!allocRes.ok) throw new Error(allocData.error || "Could not load allocations.");
      setAllocations(allocData.allocations ?? []);
      setEmployees(empData.employees ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.user_id, e])),
    [employees],
  );

  // Group allocations by calendar date (already sorted desc by API).
  const grouped = useMemo(() => {
    const groups = [];
    const indexByDate = new Map();
    for (const allocation of allocations) {
      const dateKey = formatDateHeader(allocation.assignedAt);
      if (!indexByDate.has(dateKey)) {
        indexByDate.set(dateKey, groups.length);
        groups.push({ dateKey, items: [] });
      }
      groups[indexByDate.get(dateKey)].items.push(allocation);
    }
    return groups;
  }, [allocations]);

  function toggleSelect(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Reassign immediately hands the task(s) over to the current manager —
  // no picker, no confirmation step.
  async function handleReassign(taskIds) {
    if (!taskIds.length || isReassigning) return;
    setIsReassigning(true);
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "reassign-task", taskIds }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not reassign task.");
      }
      setSelectedIds(new Set());
      await loadAll();
    } catch (reassignError) {
      setError(reassignError.message);
    } finally {
      setIsReassigning(false);
    }
  }

  const selectedAllocations = allocations.filter((a) => selectedIds.has(a.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: title + Bulk Reassign */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <h2 className="text-lg font-black text-[#0D1E4C]">Allocation History</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleReassign(selectedAllocations.map((allocation) => allocation.taskId))}
            disabled={!selectedIds.size || isReassigning}
            className="rounded-full bg-[#0a72e8] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#075fc2] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Bulk Reassign{selectedIds.size ? ` (${selectedIds.size})` : ""}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close allocation history"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:bg-white/70 hover:scale-110"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                close
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pr-1">
        {grouped.map((group) => (
          <div key={group.dateKey}>
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.15em] text-[#0D1E4C]/60">
              {group.dateKey}
            </h3>
            <div className="space-y-2">
              {group.items.map((allocation) => {
                const employee = employeeById.get(allocation.assigneeUserId);
                const byAI = /optimus/i.test(allocation.assignedBy);
                return (
                  <div
                    key={allocation.id}
                    className="relative flex flex-wrap items-center gap-x-2 gap-y-2 rounded-full border border-white/50 bg-white/30 px-4 py-3 backdrop-blur-sm transition-[z-index] hover:z-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(allocation.id)}
                      onChange={() => toggleSelect(allocation.id)}
                      className="mr-2 h-5 w-5 rounded border-[#b8c4d8] text-[#07183b]"
                      aria-label="Select allocation"
                    />
                    <HoverPill
                      label={allocation.assigneeName}
                      tone="blue"
                      variant="card"
                      detail={
                        <EmployeeProfileCard
                          employee={employee ?? { full_name: allocation.assigneeName }}
                        />
                      }
                    />
                    <span className="text-sm leading-7 text-[#52627a]">was assigned to</span>
                    <HoverPill
                      label={allocation.taskTitle}
                      maxWidthClass="max-w-[340px]"
                      detail={
                        <span className="block text-sm text-[#0D1E4C]">
                          <span className="block font-bold break-words">{allocation.taskTitle}</span>
                          <span className="block text-xs text-[#667085]">
                            Status: {allocation.status ?? "Assigned"}
                          </span>
                        </span>
                      }
                    />
                    <span className="text-sm leading-7 text-[#52627a]">by</span>
                    <HoverPill label={allocation.assignedBy} tone={byAI ? "purple" : "slate"} />
                    <span className="text-sm text-[#52627a]">
                      on {formatDateTime(allocation.assignedAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleReassign([allocation.taskId])}
                      disabled={isReassigning}
                      className="ml-auto rounded-full border border-[#0a72e8] px-4 py-1.5 text-sm font-bold text-[#0a72e8] transition hover:bg-[#0a72e8] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reassign
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!grouped.length ? (
          <p className="rounded-2xl border border-dashed border-white/60 px-6 py-12 text-center text-sm font-medium text-[#0D1E4C]/60">
            No allocations yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
