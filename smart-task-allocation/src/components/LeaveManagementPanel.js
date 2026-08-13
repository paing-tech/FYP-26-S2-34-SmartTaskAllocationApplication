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

function formatDateRanges(dates) {
  if (!dates?.length) return "No dates selected";
  const sorted = [...new Set(dates)].sort();
  const shortDate = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  };
  if (sorted.length === 1) return shortDate(sorted[0]);
  if (sorted.length === 2) return `${shortDate(sorted[0])} – ${shortDate(sorted[1])}`;

  const finalParts = sorted.at(-1).split("-").map(Number);
  const prefixDates = sorted.slice(0, -1);
  const prefix = prefixDates.map((value, index) => {
    const [year, month, day] = value.split("-").map(Number);
    const next = (prefixDates[index + 1] || sorted.at(-1)).split("-").map(Number);
    const showMonth = index === prefixDates.length - 1 || year !== next[0] || month !== next[1];
    const showYear = index === prefixDates.length - 1 || year !== finalParts[0];
    const monthLabel = new Date(year, month - 1, day).toLocaleDateString("en-GB", { month: "short" });
    return `${day}${showMonth ? ` ${monthLabel}` : ""}${showYear ? ` ${String(year).slice(-2)}` : ""}`;
  }).join(", ");
  return `${prefix} - ${shortDate(sorted.at(-1))}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  return [...Array(new Date(year, month, 1).getDay()).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)];
}

function RequestRecord({ record, onUpdated, onCancelled }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDates, setEditDates] = useState(new Set());
  const [editDescription, setEditDescription] = useState("");
  const [editCertificateFile, setEditCertificateFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [detailMonth, setDetailMonth] = useState(() => {
    const [year, month] = (record.dates?.[0] || dateKey(new Date())).split("-").map(Number);
    return new Date(year, month - 1, 1);
  });
  const editFileInputRef = useRef(null);
  const normalizedStatus = String(record.status || "Pending").toLowerCase();
  const isProcessed = normalizedStatus === "approved" || normalizedStatus === "rejected";

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
      <div className={`rounded-3xl bg-white/40 p-3 ${isProcessed ? "flex items-center gap-3" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-[#0D1E4C]">{formatDateRanges(record.dates?.slice(0, 1))}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
              record.leave_type === "sick" ? "bg-sky-100 text-sky-700" : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {record.leave_type === "sick" ? "SICK" : "ANNUAL"}
          </span>
        </div>

        {isProcessed ? (
          <div className="ml-auto flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => setShowDetails(true)} aria-label="View leave request details" className="flex h-7 w-7 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/70"><span className="material-symbols-outlined text-[20px]" aria-hidden="true">description</span></button><span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black text-white ${normalizedStatus === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>{normalizedStatus === "approved" ? "Approved" : "Rejected"}</span></div>
        ) : null}

        {!isEditing && error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}

        {!isProcessed ? <div className="mt-2 flex gap-2">
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
        </div> : null}
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
      {showDetails ? (
        <Portal>
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDetails(false); }}>
            <section className="max-h-[90vh] w-full max-w-xs overflow-y-auto rounded-3xl bg-white/40 p-6 text-[#0D1E4C] shadow-xl backdrop-blur-sm">
              <div className="relative text-center"><p className="text-lg font-black">Your Leave Request</p><p className="mt-1 text-sm font-bold capitalize text-slate-500">{record.leave_type} leave</p><button type="button" onClick={() => setShowDetails(false)} className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/70" aria-label="Close details"><span className="material-symbols-outlined">close</span></button></div>
              <div className="mt-5"><div className="flex items-center justify-between"><button type="button" onClick={() => setDetailMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/70" aria-label="Previous month"><span className="material-symbols-outlined">chevron_left</span></button><h4 className="text-base font-black">{detailMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h4><button type="button" onClick={() => setDetailMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/70" aria-label="Next month"><span className="material-symbols-outlined">chevron_right</span></button></div><div className="mt-2 grid grid-cols-7 text-center text-xs font-black text-slate-400">{WEEKDAYS.map((day) => <span key={day} className="py-2">{day.slice(0, 2)}</span>)}</div><div className="grid grid-cols-7 text-center text-sm font-bold">{monthDays(detailMonth).map((day, index) => { const key = day ? dateKey(new Date(detailMonth.getFullYear(), detailMonth.getMonth(), day)) : ""; const selected = record.dates?.includes(key); return <span key={`${day}-${index}`} className="flex h-10 items-center justify-center"><span className={`flex h-9 w-9 items-center justify-center rounded-full ${selected ? "bg-[#0D1E4C] text-white" : ""}`}>{day}</span></span>; })}</div></div>
              <div className="mt-5 text-center"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Reason</p><p className="mx-auto mt-2 max-w-[15rem] whitespace-pre-wrap break-words text-base">{record.description || "No reason provided."}</p></div>
              {record.certificate_url ? <a href={record.certificate_url} target="_blank" rel="noreferrer" className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/70 bg-white/60 text-sm font-black transition hover:bg-white"><span className="material-symbols-outlined">attach_file</span>View Medical Certificate</a> : null}
              <div className="mt-6 flex justify-center"><span className={`rounded-full px-4 py-2 text-sm font-black text-white ${normalizedStatus === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>{normalizedStatus === "approved" ? "Approved" : "Rejected"}</span></div>
            </section>
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
