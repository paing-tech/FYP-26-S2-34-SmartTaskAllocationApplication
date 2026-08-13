"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { SUPPORT_INQUIRY_SUBJECTS } from "@/lib/supportInquiry";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function ContactSupportModal({ onClose }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const subjectRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isSubjectOpen) return undefined;

    function handleOutsideClick(event) {
      if (!subjectRef.current?.contains(event.target)) setIsSubjectOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isSubjectOpen]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setAttachment(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError("Please provide a subject and a message.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("subject", subject);
      formData.append("message", message);
      if (attachment) formData.append("attachment", attachment);

      const response = await fetch("/api/support-inquiries", {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your ticket.");
      setIsSubmitted(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-300 flex items-center justify-center bg-white/40 px-4">
      <div className="relative w-full max-w-md rounded-4xl border border-white/60 bg-white/40 backdrop-blur-sm p-6 shadow-2xl">
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

        <div className="flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-xl text-[#0D1E4C]" aria-hidden="true">
            contact_support
          </span>
          <p className="text-lg font-black text-[#0D1E4C]">Contact Support</p>
        </div>

        {isSubmitted ? (
          <div className="mt-6 space-y-4 text-center">
            <p className="text-sm font-semibold text-[#334155]">
              Your ticket has been sent to our support team.
              <br />
              We&apos;ll get back to you soon.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-[#0D1E4C] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#061a40]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">

            

            <div ref={subjectRef} className="relative">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#94a3b8]" htmlFor="support-subject">
                Subject*
              </label>
              <button
                id="support-subject"
                type="button"
                onClick={() => setIsSubjectOpen((current) => !current)}
                aria-expanded={isSubjectOpen}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#0D1E4C]"
              >
                <span className={subject ? "" : "text-[#94a3b8]"}>{subject || "Select a subject"}</span>
                <span className="material-symbols-outlined text-xl text-[#0D1E4C]" aria-hidden="true">
                  {isSubjectOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                </span>
              </button>

              {isSubjectOpen ? (
                <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-white/60 bg-slate-100/80 p-1.5 shadow-[0_16px_40px_rgba(13,30,76,0.18)] backdrop-blur-sm">
                  {SUPPORT_INQUIRY_SUBJECTS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSubject(option);
                        setIsSubjectOpen(false);
                      }}
                      className={`w-full rounded-full px-4 py-2 text-left text-sm font-semibold transition hover:bg-white/80 ${
                        subject === option ? "bg-white/80 text-[#2563EB]" : "text-[#061a40]"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#94a3b8]" htmlFor="support-message">
                Message*
              </label>
              <textarea
                id="support-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Describe your issue or question..."
                rows={5}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-[#0D1E4C] outline-none focus:border-[#0D1E4C]"
              />
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#0D1E4C] transition hover:bg-slate-100"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  attach_file
                </span>
                Attachment
              </button>

              {attachment ? (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-[#0D1E4C]">
                  <span className="material-symbols-outlined text-base text-[#94a3b8]" aria-hidden="true">
                    description
                  </span>
                  <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    aria-label="Remove attachment"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#94a3b8] transition  hover:text-red-600"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm font-medium text-center text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0D1E4C] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                "Sending..."
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    send
                  </span>
                  Send
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
