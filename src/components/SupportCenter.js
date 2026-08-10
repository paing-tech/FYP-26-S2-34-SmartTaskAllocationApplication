"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-[#C7DDEB] bg-white px-4 text-sm text-[#0B1B32] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

async function authHeaders() {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  } catch {
    return {};
  }
}

function Notice({ error, message }) {
  if (error) return <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>;
  if (message) return <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>;
  return null;
}

export default function SupportCenter({ allowFeedback = true, publicMode = false }) {
  const [inquiry, setInquiry] = useState({ name: "", email: "", subject: "", message: "" });
  const [inquiryError, setInquiryError] = useState("");
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [feedback, setFeedback] = useState({ rating: "5", category: "General", message: "" });
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  function updateInquiry(field, value) {
    setInquiry((current) => ({ ...current, [field]: value }));
  }

  async function submitInquiry(event) {
    event.preventDefault();
    setInquiryError("");
    setInquiryMessage("");
    try {
      const response = await fetch("/api/contact-support", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(inquiry),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit the inquiry.");
      setInquiryMessage(`Support inquiry submitted successfully. Reference ${result.reference}.`);
      setInquiry({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setInquiryError(error.message);
    }
  }

  async function submitFeedback(event) {
    event.preventDefault();
    setFeedbackError("");
    setFeedbackMessage("");
    try {
      const response = await fetch("/api/user-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(feedback),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit feedback.");
      setFeedbackMessage("Feedback submitted successfully for Platform Admin review.");
      setFeedback((current) => ({ ...current, message: "" }));
    } catch (error) {
      setFeedbackError(error.message);
    }
  }

  return (
    <div className={`grid gap-6 ${allowFeedback ? "xl:grid-cols-2" : "mx-auto max-w-3xl"}`}>
      <form onSubmit={submitInquiry} className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2563EB]">Platform support</p>
        <h1 className="mt-2 text-2xl font-black text-[#07183b]">Contact support</h1>
        <p className="mt-2 text-sm leading-6 text-[#52627a]">
          {publicMode
            ? "Send a question without signing in. The Platform Admin support queue will retain the inquiry and its status."
            : "Send an account, workflow, or technical question to the Platform Admin support queue."}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-[#0B1B32]">
            Name
            <input value={inquiry.name} onChange={(e) => updateInquiry("name", e.target.value)} required className={inputClass} />
          </label>
          <label className="text-sm font-bold text-[#0B1B32]">
            Contact email
            <input type="email" value={inquiry.email} onChange={(e) => updateInquiry("email", e.target.value)} required className={inputClass} />
          </label>
        </div>
        <label className="mt-4 block text-sm font-bold text-[#0B1B32]">
          Subject
          <input value={inquiry.subject} onChange={(e) => updateInquiry("subject", e.target.value)} required className={inputClass} />
        </label>
        <label className="mt-4 block text-sm font-bold text-[#0B1B32]">
          Message
          <textarea
            value={inquiry.message}
            onChange={(e) => updateInquiry("message", e.target.value)}
            required
            rows={6}
            className="mt-2 w-full rounded-xl border border-[#C7DDEB] bg-white px-4 py-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </label>
        <Notice error={inquiryError} message={inquiryMessage} />
        <button type="submit" className="mt-5 rounded-full bg-[#0a2a66] px-6 py-3 text-sm font-bold text-white hover:bg-[#061a40]">
          Send inquiry
        </button>
      </form>

      {allowFeedback ? (
        <form onSubmit={submitFeedback} className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-sm backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2563EB]">User feedback</p>
          <h2 className="mt-2 text-2xl font-black text-[#07183b]">Share workflow feedback</h2>
          <p className="mt-2 text-sm leading-6 text-[#52627a]">
            Feedback begins in Pending status and becomes public only after Platform Admin approval.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-[#0B1B32]">
              Rating
              <select
                value={feedback.rating}
                onChange={(e) => setFeedback((current) => ({ ...current, rating: e.target.value }))}
                className={inputClass}
              >
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-[#0B1B32]">
              Category
              <select
                value={feedback.category}
                onChange={(e) => setFeedback((current) => ({ ...current, category: e.target.value }))}
                className={inputClass}
              >
                <option>Task allocation</option>
                <option>Availability</option>
                <option>Attendance</option>
                <option>Account management</option>
                <option>General</option>
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-bold text-[#0B1B32]">
            Comment
            <textarea
              value={feedback.message}
              onChange={(e) => setFeedback((current) => ({ ...current, message: e.target.value }))}
              maxLength={1000}
              required
              rows={8}
              className="mt-2 w-full rounded-xl border border-[#C7DDEB] bg-white px-4 py-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </label>
          <p className="mt-1 text-right text-xs font-semibold text-[#64748B]">Maximum 1000 characters · {feedback.message.length}/1000</p>
          <Notice error={feedbackError} message={feedbackMessage} />
          <button type="submit" className="mt-5 rounded-full bg-[#2563EB] px-6 py-3 text-sm font-bold text-white hover:bg-[#1E40AF]">
            Submit feedback
          </button>
        </form>
      ) : null}
    </div>
  );
}
