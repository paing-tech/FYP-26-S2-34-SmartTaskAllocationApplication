"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

async function authHeaders() { const supabase = getSupabaseBrowserClient(); const { data } = await supabase.auth.getSession(); return { Authorization: `Bearer ${data.session?.access_token ?? ""}` }; }

export default function ManagerTaskRequests() {
  const [requests, setRequests] = useState([]); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function loadData() { const response = await fetch("/api/task-requests", { headers: await authHeaders(), cache: "no-store" }); const result = await response.json(); if (!response.ok) { setError(result.error || "Could not load requests."); return; } setRequests(result.requests ?? []); }
  useEffect(() => { const timeout = setTimeout(loadData, 0); return () => clearTimeout(timeout); }, []);
  async function decide(requestId, status) { setError(""); setMessage(""); const response = await fetch("/api/task-requests", { method:"PATCH", headers:{"Content-Type":"application/json", ...(await authHeaders())}, body:JSON.stringify({requestId,status}) }); const result=await response.json(); if(!response.ok){setError(result.error||"Could not update request.");return;} setMessage(`Request ${status.toLowerCase()} successfully.`); await loadData(); }
  return <div className="space-y-5"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#2563EB]">Manager review</p><h1 className="mt-2 text-3xl font-black">Employee task requests</h1></div>{error?<p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>:null}{message?<p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</p>:null}<div className="space-y-3">{requests.length===0?<p className="rounded-2xl border border-dashed bg-white/70 p-6 text-center">No employee task requests.</p>:null}{requests.map((row)=><article key={row.request_id} className="rounded-2xl bg-white/80 p-5"><div className="flex flex-wrap justify-between gap-3"><div><strong>{row.employee?.username||row.employee?.email||"Employee"} → {row.task?.title||"Task"}</strong><p className="text-sm text-[#64748B]">{new Date(row.requested_at).toLocaleString()} · {row.status}</p></div>{row.status==="Pending"?<div className="flex gap-2"><button type="button" onClick={()=>decide(row.request_id,"Rejected")} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700">Reject</button><button type="button" onClick={()=>decide(row.request_id,"Approved")} className="rounded-full bg-[#0a2a66] px-4 py-2 text-xs font-bold text-white">Approve</button></div>:null}</div></article>)}</div></div>;
}
