"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import Portal from "@/components/Portal";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function formatTicketNumber(value) {
  return value ? `#${String(value).padStart(5, "0")}` : "#—";
}

function formatReplyTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Shared between Platform Admin (viewing/replying to any ticket from the
// dashboard) and a regular user (opening their own ticket from a reply
// notification) — variant changes the requester-facing presentation and the
// primary button's label; both call the exact same endpoints underneath,
// which decide server-side what the caller is actually allowed to do.
export default function TicketDetailModal({ inquiryId, variant = "admin", onClose, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/support-inquiries?inquiryId=${inquiryId}`, { headers: await authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load this ticket.");
        if (active) setTicket(result.inquiry);
      } catch (error) {
        if (active) setLoadError(error.message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [inquiryId]);

  async function sendReply() {
    if (!reply.trim()) return;
    setIsSendingReply(true);
    setActionError("");
    try {
      const response = await fetch("/api/support-inquiries/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ inquiryId, message: reply }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send the reply.");
      setReply("");
      setReplySent(true);
      const ticketResponse = await fetch(`/api/support-inquiries?inquiryId=${inquiryId}`, {
        headers: await authHeaders(),
      });
      const ticketResult = await ticketResponse.json();
      if (ticketResponse.ok) setTicket(ticketResult.inquiry);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsSendingReply(false);
    }
  }

  async function resolveTicket() {
    setIsResolving(true);
    setActionError("");
    try {
      const response = await fetch("/api/support-inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ inquiryId, action: "resolve" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this ticket.");
      onChanged?.();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-300 flex items-center justify-center bg-white/40 px-4">
        <div className="relative w-full max-w-md rounded-4xl border border-white/60 bg-white p-6 shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-slate-100"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>

          {isLoading ? (
            <p className="py-10 text-center text-sm font-semibold text-[#94a3b8]">Loading ticket...</p>
          ) : loadError ? (
            <p className="py-10 text-center text-sm font-medium text-red-600">{loadError}</p>
          ) : ticket ? (
            <>
              <div className="flex items-center gap-2 pr-10">
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-[#64748B]">
                  {formatTicketNumber(ticket.ticketNumber)}
                </span>
                <p className="min-w-0 flex-1 truncate text-center text-lg font-black text-[#0D1E4C]">{ticket.subject}</p>
              </div>

              {variant === "admin" ? (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#94a3b8]">From</p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-bold text-[#0D1E4C]">
                          {ticket.fullName || ticket.username || ticket.guestName || ticket.email || ticket.guestEmail}
                        </p>
                        <p className="shrink-0 text-xs font-medium text-[#64748B]">
                          {ticket.jobTitle || (ticket.guestName ? "Guest" : "—")}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-[#64748B]">
                        {ticket.email || ticket.guestEmail || "—"}
                        {ticket.organizationName ? ` · ${ticket.organizationName}` : ""}
                      </p>
                    </>
                  </div>
                </div>
              ) : null}

              <div className="mt-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#94a3b8]">Message</p>
                <textarea
                  readOnly
                  value={ticket.message}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none"
                />
              </div>

              {ticket.attachmentUrl ? (
                <a
                  href={ticket.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    attach_file
                  </span>
                  View attachment
                </a>
              ) : null}

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setIsReplyOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-[#94a3b8]"
                  aria-expanded={isReplyOpen}
                >
                  <span>Replies</span>
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 border-r-2 border-b-2 border-[#94a3b8] transition-transform ${
                      isReplyOpen ? "rotate-[-135deg] translate-y-0.5" : "rotate-45 -translate-y-0.5"
                    }`}
                  />
                </button>

                {isReplyOpen ? (
                  <div className="mt-4 space-y-3">
                    <div className="max-h-48 space-y-3 overflow-y-auto px-1 py-1">
                      {(ticket.replies ?? []).length ? (
                        ticket.replies.map((item) => (
                          <div
                            key={item.replyId}
                            className={`flex flex-col ${item.isOwn ? "items-end text-right" : "items-start text-left"}`}
                          >
                            <div className="mb-1 flex items-center gap-2 px-2 text-[11px] font-bold text-[#64748B]">
                              <span>{item.isOwn ? "You" : item.authorName}</span>
                              <span className="font-medium text-[#94a3b8]">{formatReplyTime(item.createdAt)}</span>
                            </div>
                            <div
                              className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm font-medium leading-5 ${
                                item.isOwn
                                  ? "rounded-br-md bg-[#0D1E4C] text-white"
                                  : "rounded-bl-md bg-slate-100 text-[#0D1E4C]"
                              }`}
                            >
                              {item.message}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="py-4 text-center text-xs font-semibold text-[#94a3b8]">No replies yet.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey && reply.trim() && !isSendingReply) {
                            event.preventDefault();
                            sendReply();
                          }
                        }}
                        placeholder="Write a reply..."
                        className="min-w-0 flex-1 rounded-full border border-[#8BB0FF] bg-white/60 px-4 py-3 text-sm font-medium text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#2563EB]"
                      />
                      <button
                        type="button"
                        onClick={sendReply}
                        disabled={isSendingReply || !reply.trim()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/60 text-[#0D1E4C] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label={isSendingReply ? "Sending reply" : "Send reply"}
                      >
                        <span className="material-symbols-outlined text-xl" aria-hidden="true">
                          send
                        </span>
                      </button>
                    </div>
                    {replySent ? <p className="text-center text-xs font-semibold text-emerald-700">Reply sent.</p> : null}
                  </div>
                ) : null}
              </div>

              {actionError ? <p className="mt-3 text-center text-sm font-medium text-red-600">{actionError}</p> : null}

              {ticket.status === "open" ? (
                <button
                  type="button"
                  onClick={resolveTicket}
                  disabled={isResolving}
                  className="mt-4 w-full rounded-full bg-[#0D1E4C] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResolving ? "..." : variant === "admin" ? "Mark Resolved" : "Close Ticket"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
