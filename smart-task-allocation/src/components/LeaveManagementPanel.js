"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import LeaveDatePicker from "@/components/LeaveDatePicker";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function formatDateLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Local-date-safe "+1 day" — deliberately avoids toISOString(), which
// converts to UTC and can shift the date backward/forward across midnight
// for any timezone offset from UTC, silently breaking contiguous-range
// detection below.
function addOneDay(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Groups a sorted list of "YYYY-MM-DD" strings into contiguous ranges so a
// 5-day request reads as "Jul 22 – Jul 26, 2026" instead of five separate dates.
function formatDateRanges(dates) {
  if (!dates?.length) return "No dates selected";
  const sorted = [...dates].sort();
  const ranges = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i];
    const nextDayStr = addOneDay(previous);

    if (current !== nextDayStr) {
      ranges.push(rangeStart === previous ? formatDateLabel(rangeStart) : `${formatDateLabel(rangeStart)} – ${formatDateLabel(previous)}`);
      rangeStart = current;
    }
    previous = current;
  }

  return ranges.join(", ");
}

function RequestRecord({ record, onUpdated, onCancelled }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDates, setEditDates] = useState(new Set());
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setEditDates(new Set(record.dates));
    setEditDescription(record.description || "");
    setIsEditing(true);
    setError("");
  }

  function toggleEditDate(dateStr) {
    setEditDates((current) => {
      const next = new Set(current);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  async function handleSave() {
    if (!editDates.size) {
      setError("Select at least one date.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/leave-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          leaveRequestId: record.leave_request_id,
          dates: [...editDates],
          description: editDescription,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update your leave request.");
      onUpdated?.(result.request);
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelRequest() {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/leave-requests?leaveRequestId=${record.leave_request_id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not cancel your leave request.");
      onCancelled?.(record.leave_request_id);
    } catch (cancelError) {
      setError(cancelError.message);
      setIsSaving(false);
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-2xl bg-white/60 p-3">
        <LeaveDatePicker selectedDates={editDates} onToggleDate={toggleEditDate} />
        <textarea
          value={editDescription}
          onChange={(event) => setEditDescription(event.target.value)}
          rows={2}
          className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]"
        />
        {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            className="flex-1 rounded-full border border-slate-200 py-2 text-xs font-bold text-[#52627a] transition hover:bg-slate-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-full bg-[#0D1E4C] py-2 text-xs font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-[#0D1E4C]">{formatDateRanges(record.dates)}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
            record.leave_type === "sick" ? "bg-sky-100 text-sky-700" : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {record.leave_type === "sick" ? "SICK" : "ANNUAL"}
        </span>
      </div>

      {record.description ? <p className="mt-1 text-xs font-medium text-[#52627a]">{record.description}</p> : null}

      {record.certificate_url ? (
        <a
          href={record.certificate_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            attach_file
          </span>
          View certificate
        </a>
      ) : null}

      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={startEditing}
          className="flex-1 rounded-full border border-slate-200 py-1.5 text-xs font-bold text-[#0D1E4C] transition hover:bg-slate-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleCancelRequest}
          disabled={isSaving}
          className="flex-1 rounded-full border border-red-200 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel request
        </button>
      </div>
    </div>
  );
}

export default function LeaveManagementPanel() {
  const [requests, setRequests] = useState([]);
  const [loadError, setLoadError] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/leave-requests", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load your leave requests.");
      setRequests(result.requests ?? []);
    } catch (error) {
      setLoadError(error.message);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadRequests, 0);
    return () => clearTimeout(timeout);
  }, [loadRequests]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <p className="text-lg font-black text-[#0D1E4C]">Leave Requests</p>

      <div className="mt-3 flex-1">
        {loadError ? <p className="mt-2 text-xs font-bold text-red-600">{loadError}</p> : null}

        <div className="mt-2 space-y-2">
          {requests.length ? (
            requests.map((record) => (
              <RequestRecord
                key={record.leave_request_id}
                record={record}
                onUpdated={(updated) =>
                  setRequests((current) =>
                    current.map((item) => (item.leave_request_id === updated.leave_request_id ? updated : item)),
                  )
                }
                onCancelled={(id) => setRequests((current) => current.filter((item) => item.leave_request_id !== id))}
              />
            ))
          ) : (
            <p className="text-sm font-medium text-[#94a3b8]">No leave requests yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
