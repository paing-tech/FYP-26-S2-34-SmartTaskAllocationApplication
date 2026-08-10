"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function PlatformOperationsConsole() {
  const [data, setData] = useState({ activity: [], feedback: [], inquiries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [replyByInquiry, setReplyByInquiry] = useState({});

  async function loadData() {
    setError("");
    try {
      const response = await fetch("/api/platformadmin/operations", { headers: await authHeaders(), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load platform operations.");
      setData(result);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadData, 0);
    return () => clearTimeout(timeout);
  }, []);

  async function postAction(payload, successMessage) {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/platformadmin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete the platform action.");
      setMessage(successMessage);
      await loadData();
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  const visibleActivity = useMemo(() => {
    const search = logSearch.trim().toLowerCase();
    return data.activity.filter((row) => `${row.actor} ${row.action} ${row.target}`.toLowerCase().includes(search));
  }, [data.activity, logSearch]);

  const analyzedFeedback = useMemo(() => data.feedback.filter((row) => {
    if (ratingFilter !== "All" && Number(row.rating) !== Number(ratingFilter)) return false;
    if (dateFilter && String(row.createdAt).slice(0, 10) !== dateFilter) return false;
    return true;
  }), [data.feedback, ratingFilter, dateFilter]);

  const averageRating = analyzedFeedback.length
    ? (analyzedFeedback.reduce((sum, row) => sum + Number(row.rating || 0), 0) / analyzedFeedback.length).toFixed(1)
    : "—";

  return (
    <div className="h-full overflow-y-auto rounded-3xl border border-white/70 bg-white/45 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563EB]">Platform Admin</p>
          <h1 className="mt-2 text-3xl font-black text-[#07183b]">Operations, feedback & inquiries</h1>
        </div>
        <button type="button" onClick={loadData} className="rounded-full bg-[#0a2a66] px-5 py-2.5 text-sm font-bold text-white">Refresh</button>
      </div>
      {loading ? <p className="mt-6 font-semibold">Loading platform records...</p> : null}
      {error ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      <section className="mt-7 rounded-3xl bg-white/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-black">System activity logs</h2><p className="text-sm text-[#64748B]">Actor, action, target, and timestamp, newest first.</p></div>
          <input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Search activity logs" className="h-11 rounded-full border border-[#C7DDEB] px-4 text-sm outline-none" />
        </div>
        <div className="mt-4 max-h-72 overflow-auto">
          {visibleActivity.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm">No matching activity logs.</p> : null}
          {visibleActivity.map((row) => (
            <div key={row.id} className="grid gap-2 border-b border-[#E2E8F0] py-3 text-sm md:grid-cols-[1fr_1.2fr_1.4fr_1fr]">
              <strong>{row.actor}</strong><span>{row.action}</span><span className="truncate">{row.target || "—"}</span><time>{formatDate(row.createdAt)}</time>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl bg-white/80 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-xl font-black">Feedback moderation & analysis</h2><p className="text-sm text-[#64748B]">Approve public feedback or retain it as Hidden/Rejected.</p></div>
          <div className="flex gap-2">
            <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className="h-10 rounded-xl border border-[#C7DDEB] px-3 text-sm"><option>All</option>{[5,4,3,2,1].map((r)=><option key={r}>{r}</option>)}</select>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-10 rounded-xl border border-[#C7DDEB] px-3 text-sm" />
            <button type="button" onClick={() => { setRatingFilter("All"); setDateFilter(""); }} className="rounded-xl border border-[#C7DDEB] px-3 text-sm font-bold">Clear</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#EEF5FF] p-4"><p className="text-xs font-bold uppercase">Response count</p><p className="mt-1 text-3xl font-black">{analyzedFeedback.length}</p></div>
          <div className="rounded-2xl bg-[#EEF5FF] p-4"><p className="text-xs font-bold uppercase">Average rating</p><p className="mt-1 text-3xl font-black">{averageRating}</p></div>
          <div className="rounded-2xl bg-[#EEF5FF] p-4"><p className="text-xs font-bold uppercase">Rating distribution</p><p className="mt-1 text-sm font-black">{[5,4,3,2,1].map((r) => `${r}★ ${analyzedFeedback.filter((x) => Number(x.rating) === r).length}`).join(" · ")}</p></div>
        </div>
        {analyzedFeedback.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm font-bold">No feedback data found.</p> : null}
        <div className="mt-4 space-y-3">
          {analyzedFeedback.map((row) => (
            <article key={row.feedbackId} className="rounded-2xl border border-[#E2E8F0] p-4">
              <div className="flex flex-wrap justify-between gap-3"><div><strong>{row.userName}</strong><p className="text-sm text-[#64748B]">{row.rating}/5 · {row.category} · {formatDate(row.createdAt)}</p></div><span className="rounded-full bg-[#EEF2F8] px-3 py-1 text-xs font-bold">{row.status}</span></div>
              <p className="mt-3 text-sm leading-6">{row.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">{["Approved","Hidden","Rejected"].map((status) => <button key={status} type="button" onClick={() => postAction({ type:"feedback-status", feedbackId:row.feedbackId, status }, `Feedback marked ${status}.`)} className="rounded-full border border-[#C7DDEB] px-4 py-2 text-xs font-bold">{status}</button>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl bg-white/80 p-5">
        <h2 className="text-xl font-black">Contact inquiries</h2>
        <p className="text-sm text-[#64748B]">Review sender details, reply history, and current status.</p>
        {data.inquiries.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm">No contact inquiries.</p> : null}
        <div className="mt-4 space-y-4">
          {data.inquiries.map((row) => (
            <article key={row.logId} className="rounded-2xl border border-[#E2E8F0] p-4">
              <div className="flex flex-wrap justify-between gap-3"><div><strong>{row.subject}</strong><p className="text-sm text-[#64748B]">{row.name} · {row.email} · {formatDate(row.createdAt)}</p></div><select value={row.status || "Open"} onChange={(e) => postAction({ type:"inquiry-status", logId:row.logId, status:e.target.value }, "Inquiry status updated.")} className="h-9 rounded-xl border border-[#C7DDEB] px-3 text-sm"><option>Open</option><option>In Progress</option><option>Resolved</option></select></div>
              <p className="mt-3 text-sm leading-6">{row.message}</p>
              {(row.replies ?? []).map((reply, index) => <div key={`${row.logId}-${index}`} className="mt-3 rounded-xl bg-[#EEF5FF] p-3 text-sm"><strong>Platform reply</strong><p>{reply.message}</p><time className="text-xs text-[#64748B]">{formatDate(reply.createdAt)}</time></div>)}
              <textarea value={replyByInquiry[row.logId] || ""} onChange={(e) => setReplyByInquiry((current) => ({ ...current, [row.logId]: e.target.value }))} placeholder="Reply message (required)" rows={3} className="mt-3 w-full rounded-xl border border-[#C7DDEB] p-3 text-sm outline-none" />
              <button type="button" onClick={() => postAction({ type:"inquiry-reply", logId:row.logId, status:row.status || "Open", reply:replyByInquiry[row.logId] || "" }, "Reply recorded successfully.")} className="mt-2 rounded-full bg-[#0a2a66] px-5 py-2 text-xs font-bold text-white">Record reply</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
