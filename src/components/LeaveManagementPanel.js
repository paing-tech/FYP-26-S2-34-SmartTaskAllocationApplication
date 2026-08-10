"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import LeaveDatePicker from "@/components/LeaveDatePicker";
import Portal from "@/components/Portal";

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
  const [editCertificateFile, setEditCertificateFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const editFileInputRef = useRef(null);

  function startEditing() {
    setEditDates(new Set(record.dates));
    setEditDescription(record.description || "");
    setEditCertificateFile(null);
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

  function handleEditFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setEditCertificateFile(file);
  }

  async function handleSave() {
    if (!editDates.size) {
      setError("Select at least one date.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("leaveRequestId", record.leave_request_id);
      formData.append("dates", JSON.stringify([...editDates]));
      formData.append("description", editDescription);
      if (editCertificateFile) formData.append("certificate", editCertificateFile);

      const response = await fetch("/api/leave-requests", {
        method: "PATCH",
        headers: await authHeaders(),
        body: formData,
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

  return (
    <>
      <div className="rounded-3xl bg-white/40 p-3">
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

        {!isEditing && error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}

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

      {isEditing ? (
        <Portal>
          <div
            className="fixed inset-0 z-[75] flex items-center justify-center p-4"
            onClick={() => setIsEditing(false)}
          >
          <div
            className="relative w-full max-w-xs rounded-3xl bg-white/40 backdrop-blur-sm p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#94a3b8] transition hover:scale-110 hover:bg-slate-100 hover:text-[#0D1E4C]"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>

            <p className="text-center text-sm font-black text-[#0D1E4C]">Request Leave</p>

            <div className="mt-3 space-y-3">
              <LeaveDatePicker selectedDates={editDates} onToggleDate={toggleEditDate} />

              <textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                placeholder="Reason for leave"
                rows={2}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]"
              />

              <button
                type="button"
                onClick={() => editFileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-bold text-[#0D1E4C] transition hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  attach_file
                </span>
                {editCertificateFile
                  ? editCertificateFile.name
                  : record.certificate_url
                    ? "Replace medical certificate"
                    : "Medical Certificate"}
              </button>
              <input
                ref={editFileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                className="hidden"
                onChange={handleEditFileChange}
              />

              {error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full rounded-full bg-[#0D1E4C] py-2.5 text-sm font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}
    </>
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

        <div className="space-y-2">
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
