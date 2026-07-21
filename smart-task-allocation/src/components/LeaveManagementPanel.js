"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="flex items-center gap-2"
    >
      <span className="text-sm font-black text-[#0D1E4C]">{label}</span>
      <span className={`flex h-6 w-11 items-center rounded-full p-1 transition ${checked ? "bg-[#2563EB]" : "bg-slate-300"}`}>
        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

function NewRequestForm({ onCreated }) {
  const [selectedDates, setSelectedDates] = useState(new Set());
  const [description, setDescription] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [certificateFile, setCertificateFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  function toggleDate(dateStr) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setCertificateFile(file);
  }

  async function handleSubmit() {
    if (!selectedDates.size) {
      setError("Select at least one date.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("dates", JSON.stringify([...selectedDates]));
      formData.append("description", description);
      formData.append("isEmergency", String(isEmergency));
      if (certificateFile) formData.append("certificate", certificateFile);

      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your leave request.");

      setSelectedDates(new Set());
      setDescription("");
      setIsEmergency(false);
      setCertificateFile(null);
      onCreated?.(result.request);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white/50 p-4">
      <LeaveDatePicker selectedDates={selectedDates} onToggleDate={toggleDate} />

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Reason for leave"
        rows={2}
        className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#2563EB]"
      />

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0D1E4C] transition hover:bg-slate-50"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            attach_file
          </span>
          {certificateFile ? certificateFile.name : "Attach certificate"}
        </button>
        <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" className="hidden" onChange={handleFileChange} />

        <ToggleSwitch checked={isEmergency} onChange={() => setIsEmergency((current) => !current)} label="Emergency" />
      </div>

      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="mt-3 w-full rounded-full bg-[#0D1E4C] py-2.5 text-sm font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Submitting…" : "Submit Request"}
      </button>
    </div>
  );
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
        {record.is_emergency ? (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">EMERGENCY</span>
        ) : null}
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
      <p className="text-lg font-black text-[#0D1E4C]">Request Leave</p>

      <div className="mt-4">
        <NewRequestForm onCreated={(created) => setRequests((current) => [created, ...current])} />
      </div>

      <div className="mt-5 flex-1">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-[#94a3b8]">Your requests</p>

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
