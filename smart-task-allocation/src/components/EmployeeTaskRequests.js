"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function dateRange(task) {
  if (!task?.start_datetime || !task?.end_datetime) return "Schedule not set";
  return `${new Date(task.start_datetime).toLocaleString()} – ${new Date(task.end_datetime).toLocaleString()}`;
}

export default function EmployeeTaskRequests() {
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [availableTasks, setAvailableTasks] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setError("");
    try {
      const headers = await authHeaders();
      const [taskResponse, requestResponse] = await Promise.all([
        fetch("/api/employee-tasks", { headers, cache: "no-store" }),
        fetch("/api/task-requests", { headers, cache: "no-store" }),
      ]);
      const [taskResult, requestResult] = await Promise.all([taskResponse.json(), requestResponse.json()]);
      if (!taskResponse.ok) throw new Error(taskResult.error || "Could not load assigned tasks.");
      if (!requestResponse.ok) throw new Error(requestResult.error || "Could not load task requests.");
      setAssignedTasks(taskResult.tasks ?? []);
      setAvailableTasks(requestResult.availableTasks ?? []);
      setRequests(requestResult.requests ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => { const timeout = setTimeout(loadData, 0); return () => clearTimeout(timeout); }, []);

  async function requestTask(taskId) {
    setError(""); setMessage("");
    const response = await fetch("/api/task-requests", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ taskId }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Could not request this task."); return; }
    setMessage("Task request submitted successfully with Pending status.");
    await loadData();
  }

  async function cancelRequest(requestId) {
    setError(""); setMessage("");
    const response = await fetch("/api/task-requests", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ requestId, status: "Cancelled" }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Could not cancel this request."); return; }
    setMessage("Pending request cancelled successfully.");
    await loadData();
  }

  async function startTask(taskId) {
    setError(""); setMessage("");
    const response = await fetch("/api/employee-tasks", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ taskId, action: "start" }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Could not start this task."); return; }
    setMessage("Task status updated to In Progress.");
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#2563EB]">Employee task centre</p><h1 className="mt-2 text-3xl font-black">Available tasks & my requests</h1></div>
      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</p> : null}

      <section className="rounded-3xl bg-white/80 p-5">
        <h2 className="text-xl font-black">Assigned tasks</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {assignedTasks.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-sm">No assigned tasks.</p> : null}
          {assignedTasks.map((task) => <article key={task.task_id} className="rounded-2xl border border-[#E2E8F0] p-4"><div className="flex justify-between gap-3"><div><strong>{task.title}</strong><p className="mt-1 text-sm text-[#64748B]">{dateRange(task)}</p></div><span className="h-fit rounded-full bg-[#EEF2F8] px-3 py-1 text-xs font-bold">{task.status}</span></div>{["Open","Assigned","Not Started"].includes(task.status) ? <button type="button" onClick={() => startTask(task.task_id)} className="mt-4 rounded-full bg-[#0a2a66] px-4 py-2 text-xs font-bold text-white">Start task</button> : null}</article>)}
        </div>
      </section>

      <section className="rounded-3xl bg-white/80 p-5">
        <h2 className="text-xl font-black">Available tasks</h2><p className="text-sm text-[#64748B]">Only open, unallocated tasks are listed.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {availableTasks.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-sm font-bold">No available tasks at the moment.</p> : null}
          {availableTasks.map((task) => <article key={task.task_id} className="rounded-2xl border border-[#E2E8F0] p-4"><strong>{task.title}</strong><p className="mt-1 text-sm text-[#64748B]">{dateRange(task)}</p><p className="mt-2 text-sm">Required skills: {(task.requiredSkills ?? []).map((skill) => skill.skill_name).join(", ") || "None"}</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setSelectedTask(task)} className="rounded-full border border-[#C7DDEB] px-4 py-2 text-xs font-bold">View details</button><button type="button" onClick={() => requestTask(task.task_id)} className="rounded-full bg-[#2563EB] px-4 py-2 text-xs font-bold text-white">Request task</button></div></article>)}
        </div>
      </section>

      <section className="rounded-3xl bg-white/80 p-5">
        <h2 className="text-xl font-black">My requests</h2>
        <div className="mt-4 space-y-3">
          {requests.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-sm">No task requests submitted.</p> : null}
          {requests.map((row) => <article key={row.request_id} className="rounded-2xl border border-[#E2E8F0] p-4"><div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setSelectedRequest(row)} className="text-left"><strong>{row.task?.title || "Task"}</strong><p className="text-sm text-[#64748B]">Submitted {new Date(row.requested_at).toLocaleString()}</p></button><span className="h-fit rounded-full bg-[#EEF2F8] px-3 py-1 text-xs font-bold">{row.status}</span></div>{row.status === "Pending" ? <button type="button" onClick={() => cancelRequest(row.request_id)} className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700">Cancel request</button> : null}</article>)}
        </div>
      </section>

      {selectedTask ? <DetailModal title={selectedTask.title} onClose={() => setSelectedTask(null)}><p>{selectedTask.description || "No description"}</p><p className="mt-3 font-bold">{dateRange(selectedTask)}</p><p className="mt-2">Status: Open for requests · Available positions: 1</p><p className="mt-2">Required skills: {(selectedTask.requiredSkills ?? []).map((skill) => skill.skill_name).join(", ") || "None"}</p></DetailModal> : null}
      {selectedRequest ? <DetailModal title={`Request for ${selectedRequest.task?.title || "task"}`} onClose={() => setSelectedRequest(null)}><p>Submitted: {new Date(selectedRequest.requested_at).toLocaleString()}</p><p className="mt-2">Current status: <strong>{selectedRequest.status}</strong></p><p className="mt-2 text-sm text-[#64748B]">Status history: Pending at submission{selectedRequest.status !== "Pending" ? ` → ${selectedRequest.status}` : ""}.</p></DetailModal> : null}
    </div>
  );
}

function DetailModal({ title, children, onClose }) {
  return <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/25 p-4" onClick={onClose}><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex justify-between gap-4"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="text-xl">×</button></div><div className="mt-4 text-sm leading-6">{children}</div></div></div>;
}
