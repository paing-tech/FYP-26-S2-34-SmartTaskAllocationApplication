"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { SUPPORT_INQUIRY_SUBJECTS } from "@/lib/supportInquiry";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function formatTimestamp(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function AnnouncementComposer({ onSent }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Please provide a title and a message.");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ title, body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send the announcement.");
      setTitle("");
      setBody("");
      onSent?.();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl bg-white/40 p-4 backdrop-blur-md">
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#94a3b8]" htmlFor="announcement-title">
          Title
        </label>
        <input
          id="announcement-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What's the announcement about?"
          className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#0D1E4C]"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#94a3b8]" htmlFor="announcement-body">
          Message
        </label>
        <textarea
          id="announcement-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder="Write the announcement every user will see..."
          className="w-full resize-none rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#0D1E4C]"
        />
      </div>
      <button
        type="submit"
        disabled={isSending}
        className="rounded-full bg-[#0D1E4C] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSending ? "Sending..." : "Send to all users"}
      </button>
    </form>
  );
}

function AnnouncementHistory({ announcements, isLoading, error }) {
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {isLoading ? <p className="text-sm text-[#52627a]">Loading announcements...</p> : null}
      {!isLoading && !error && !announcements.length ? (
        <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">No announcements sent yet.</p>
      ) : null}
      {announcements.map((item) => (
        <div key={item.announcementId} className="rounded-2xl bg-white/40 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-bold text-[#0B1B32]">{item.title}</p>
            <span className="shrink-0 text-xs font-semibold text-[#64748B]">{formatTimestamp(item.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs font-medium text-[#475569]">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

const INQUIRY_TABS = ["Open", "Resolved", "All"];

function InquiryRow({ inquiry, busy, onResolve, onReopen }) {
  const isBusy = Boolean(busy);
  const requesterName = inquiry.fullName || inquiry.username || inquiry.email || "Unknown user";

  return (
    <li className="space-y-2 rounded-2xl bg-white/40 px-4 py-3 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#0B1B32]">{inquiry.subject}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-[#64748B]">
            {requesterName}
            {inquiry.organizationName ? ` · ${inquiry.organizationName}` : ""}
          </p>
        </div>
        <span className="shrink-0 pr-1 text-xs font-semibold text-[#64748B]">{formatTimestamp(inquiry.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-xs font-medium text-[#475569]">{inquiry.message}</p>
      {inquiry.attachmentUrl ? (
        <a
          href={inquiry.attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            attach_file
          </span>
          View attachment
        </a>
      ) : null}
      <div className="flex items-center gap-2">
        {inquiry.status === "open" ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={onResolve}
            className="rounded-full bg-[#0D1E4C] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "resolve" ? "Resolving..." : "Mark Resolved"}
          </button>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={onReopen}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-[#0D1E4C] transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "reopen" ? "Reopening..." : "Reopen"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function PlatformAdminSupport() {
  const [announcements, setAnnouncements] = useState([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState("");

  const [inquiries, setInquiries] = useState([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [inquiriesError, setInquiriesError] = useState("");
  const [inquiryTab, setInquiryTab] = useState("Open");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [busyInquiry, setBusyInquiry] = useState(null);

  async function loadAnnouncements() {
    setIsLoadingAnnouncements(true);
    setAnnouncementsError("");
    try {
      const response = await fetch("/api/announcements", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load announcements.");
      setAnnouncements(result.announcements ?? []);
    } catch (loadError) {
      setAnnouncementsError(loadError.message);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }

  async function loadInquiries() {
    setIsLoadingInquiries(true);
    setInquiriesError("");
    try {
      const response = await fetch("/api/support-inquiries", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load support tickets.");
      setInquiries(result.inquiries ?? []);
    } catch (loadError) {
      setInquiriesError(loadError.message);
    } finally {
      setIsLoadingInquiries(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadAnnouncements();
      loadInquiries();
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  async function runInquiryAction(inquiryId, action) {
    if (busyInquiry) return;
    setBusyInquiry({ inquiryId, action });
    setInquiriesError("");
    try {
      const response = await fetch("/api/support-inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ inquiryId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this ticket.");
      await loadInquiries();
    } catch (actionError) {
      setInquiriesError(actionError.message);
    } finally {
      setBusyInquiry(null);
    }
  }

  const filteredInquiries = useMemo(() => {
    return inquiries
      .filter((inquiry) => inquiryTab === "All" || inquiry.status === inquiryTab.toLowerCase())
      .filter((inquiry) => categoryFilter === "All" || inquiry.subject === categoryFilter);
  }, [inquiries, inquiryTab, categoryFilter]);

  const openCount = useMemo(() => inquiries.filter((inquiry) => inquiry.status === "open").length, [inquiries]);

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <section className="flex h-full min-h-0 flex-col gap-3">
        <h2 className="shrink-0 text-lg font-black text-[#0D1E4C]">Announcements</h2>
        <AnnouncementComposer onSent={loadAnnouncements} />
        <AnnouncementHistory announcements={announcements} isLoading={isLoadingAnnouncements} error={announcementsError} />
      </section>

      <section className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="text-lg font-black text-[#0D1E4C]">User Tickets</h2>
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-full border border-white/60 bg-white/40 px-3 py-1.5 text-xs font-bold text-[#0D1E4C] outline-none"
            >
              <option value="All">All categories</option>
              {SUPPORT_INQUIRY_SUBJECTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div className="flex rounded-full border border-white/60 bg-white/40 p-1">
              {INQUIRY_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInquiryTab(tab)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    inquiryTab === tab ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
                  }`}
                >
                  {tab}
                  {tab === "Open" && openCount > 0 ? ` (${openCount})` : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {inquiriesError ? <p className="mb-2 text-sm font-medium text-red-600">{inquiriesError}</p> : null}
          {isLoadingInquiries ? <p className="text-sm text-[#52627a]">Loading tickets...</p> : null}
          {!isLoadingInquiries && !inquiriesError && !filteredInquiries.length ? (
            <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">No tickets here.</p>
          ) : null}

          <ul className="space-y-2">
            {filteredInquiries.map((inquiry) => (
              <InquiryRow
                key={inquiry.inquiryId}
                inquiry={inquiry}
                busy={busyInquiry?.inquiryId === inquiry.inquiryId ? busyInquiry.action : null}
                onResolve={() => runInquiryAction(inquiry.inquiryId, "resolve")}
                onReopen={() => runInquiryAction(inquiry.inquiryId, "reopen")}
              />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
