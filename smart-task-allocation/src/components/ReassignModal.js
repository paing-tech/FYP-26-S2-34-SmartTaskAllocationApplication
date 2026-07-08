"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import Portal from "@/components/Portal";

// Reassign modal shared by AllocationHistory and the workspace History preview.
// targets = array of allocations; phase = "edit" | "confirm".
export default function ReassignModal({ targets, employees, workspaces, onClose, onDone }) {
  const [workspaceId, setWorkspaceId] = useState(
    targets[0]?.workspaceId ?? workspaces[0]?.workspace_id ?? "",
  );
  const [assigneeId, setAssigneeId] = useState(
    targets.length === 1 ? targets[0].assigneeUserId ?? "" : "",
  );
  const [phase, setPhase] = useState("edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.user_id, employee])),
    [employees],
  );
  const workspaceName = (id) =>
    workspaces.find((workspace) => workspace.workspace_id === id)?.workspace_name ?? "—";

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function confirmReassign() {
    if (!workspaceId) {
      setError("Choose a workspace.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const headers = await authHeaders();
      for (const target of targets) {
        // For bulk, keep each task's own assignee; for single, use the chosen one.
        const assignedTo = targets.length === 1 ? assigneeId : target.assigneeUserId;
        await fetch("/api/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify({
            workspaceId,
            title: target.taskTitle,
            assignedTo,
          }),
        });
      }
      await onDone?.();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
      setIsSubmitting(false);
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
      <div
        className="w-full max-w-lg rounded-[28px] bg-white p-8 shadow-[0_28px_80px_rgba(0,0,0,0.3)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-2xl font-black text-[#0D1E4C]">
          {targets.length > 1 ? `Reassign ${targets.length} tasks` : "Reassign task"}
        </h2>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {phase === "edit" ? (
          <div className="mt-6 space-y-5">
            {targets.length === 1 ? (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#0D1E4C]">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0D1E4C] outline-none focus:border-[#2563EB]"
                >
                  <option value="">Unassigned</option>
                  {employees.map((employee) => (
                    <option key={employee.user_id} value={employee.user_id}>
                      {employee.full_name || employee.username || employee.email}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="block text-sm font-bold text-[#0D1E4C]">Workspace</label>
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0D1E4C] outline-none focus:border-[#2563EB]"
              >
                <option value="">Choose a workspace…</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.workspace_id} value={workspace.workspace_id}>
                    {workspace.workspace_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-2.5 text-sm font-bold text-[#667085] hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!workspaceId) {
                    setError("Choose a workspace.");
                    return;
                  }
                  setError("");
                  setPhase("confirm");
                }}
                className="rounded-full bg-[#0D1E4C] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0a1838]"
              >
                Review
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-[#52627a]">
              This will create {targets.length > 1 ? "these tasks" : "this task"} in{" "}
              <strong>{workspaceName(workspaceId)}</strong> and log the assignment:
            </p>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              {targets.map((target) => {
                const targetAssigneeId =
                  targets.length === 1 ? assigneeId : target.assigneeUserId;
                const assignee = employeeById.get(targetAssigneeId);
                return (
                  <li key={target.id} className="text-sm text-[#0D1E4C]">
                    <strong>{target.taskTitle}</strong> →{" "}
                    {assignee
                      ? assignee.full_name || assignee.username || assignee.email
                      : "Unassigned"}
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPhase("edit")}
                className="rounded-full px-5 py-2.5 text-sm font-bold text-[#667085] hover:bg-slate-100"
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmReassign}
                disabled={isSubmitting}
                className="rounded-full bg-[#0a72e8] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#075fc2] disabled:opacity-60"
              >
                {isSubmitting ? "Reassigning…" : "Confirm reassign"}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </Portal>
  );
}
