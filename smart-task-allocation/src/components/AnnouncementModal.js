"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const ANNOUNCEMENT_TYPES = [
  "New Features Available",
  "New AI Agent Features",
  "Scheduled Maintenance",
  "Platform Update Available",
  "System Maintenance Completed",
  "Custom Message",
];

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AnnouncementModal({ onClose, onSent }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const typeRef = useRef(null);

  useEffect(() => {
    if (!isTypeOpen) return undefined;

    function handleOutsideClick(event) {
      if (!typeRef.current?.contains(event.target)) setIsTypeOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isTypeOpen]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title || !message.trim()) {
      setError("Please select an announcement type and enter a message.");
      return;
    }

    setIsSending(true);
    setError("");
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ title, body: message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send the announcement.");
      await onSent?.();
      onClose();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setIsSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-300 flex items-center justify-center bg-white/40 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-modal-title"
        className="relative w-full max-w-md rounded-4xl border border-white/60 bg-white/40 p-6 shadow-2xl backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-slate-100"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>

        <div className="flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-2xl text-[#0D1E4C]" aria-hidden="true">campaign</span>
          <h2 id="announcement-modal-title" className="text-lg font-black text-[#0D1E4C]">Announcement</h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div ref={typeRef} className="relative">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#94a3b8]">
              Announcement type*
            </label>
            <button
              type="button"
              onClick={() => setIsTypeOpen((current) => !current)}
              aria-expanded={isTypeOpen}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#0D1E4C]"
            >
              <span className={title ? "" : "text-[#94a3b8]"}>{title || "Select an announcement"}</span>
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                {isTypeOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
              </span>
            </button>

            {isTypeOpen ? (
              <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-white/60 bg-slate-100/90 p-1.5 shadow-[0_16px_40px_rgba(13,30,76,0.18)] backdrop-blur-sm">
                {ANNOUNCEMENT_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setTitle(option);
                      setIsTypeOpen(false);
                    }}
                    className={`w-full rounded-full px-4 py-2 text-left text-sm font-semibold transition hover:bg-white/80 ${
                      title === option ? "bg-white/80 text-[#2563EB]" : "text-[#061a40]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="announcement-message" className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#94a3b8]">
              Message*
            </label>
            <textarea
              id="announcement-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Write the announcement every user will see..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#0D1E4C]"
            />
          </div>

          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isSending}
            className="h-12 w-full rounded-full bg-[#0D1E4C] text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Announcing..." : "Announce"}
          </button>
        </form>
      </section>
    </div>,
    document.body,
  );
}
