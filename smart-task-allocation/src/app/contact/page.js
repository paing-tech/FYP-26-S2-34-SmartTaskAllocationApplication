"use client";

import { useEffect, useRef, useState } from "react";
import LandingNav from "@/components/LandingNav";
import { SUPPORT_INQUIRY_SUBJECTS } from "@/lib/supportInquiry";

// Dedicated home for the nav's "Contact Us" link — a plain page (not a
// modal) so it behaves like every other nav destination. Posts to
// /api/public-contact, which lands in the same support_inquiry table (and
// Platform Admin review queue) as logged-in users' Contact Support, just
// carrying guest_name/guest_email instead of a user_id.
export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");
  const subjectRef = useRef(null);

  useEffect(() => {
    if (!isSubjectOpen) return undefined;

    function handleOutsideClick(event) {
      if (!subjectRef.current?.contains(event.target)) setIsSubjectOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isSubjectOpen]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      setError("Please fill in your name, email, subject, and message.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send your message.");
      setIsSubmitted(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black pb-20 pt-32 text-white">
      <LandingNav />

      <section className="mx-auto mt-4 max-w-3xl px-6 text-center">
        <span className="rounded-full border border-white/15 px-4 py-1 text-lg font-medium text-white/80">
          Contact Us
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">We&apos;d love to hear from you</h1>
        <p className="mt-4 text-base text-white/60">
          Questions, feedback, or a bug to report — send it over and our team will get back to you.
        </p>
      </section>

      <section className="mx-auto mt-14 max-w-md px-6">
        {isSubmitted ? (
          <div className="rounded-3xl border border-white/15 bg-white/5 p-8 text-center backdrop-blur-sm">
            <p className="text-sm text-white/60">
              Your message has been sent to our team.
              <br />
              We&apos;ll get back to you soon.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur-sm"
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40" htmlFor="contact-name">
                Name*
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white placeholder:text-white/30 outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40" htmlFor="contact-email">
                Email*
              </label>
              <input
                id="contact-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white placeholder:text-white/30 outline-none focus:border-[#2563EB]"
              />
            </div>

            <div ref={subjectRef} className="relative">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40" htmlFor="contact-subject">
                Subject*
              </label>
              <button
                id="contact-subject"
                type="button"
                onClick={() => setIsSubjectOpen((current) => !current)}
                aria-expanded={isSubjectOpen}
                className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm font-medium text-white outline-none focus:border-[#2563EB]"
              >
                <span className={subject ? "" : "text-white/30"}>{subject || "Select a subject"}</span>
                <span className="material-symbols-outlined text-xl text-white/60" aria-hidden="true">
                  {isSubjectOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                </span>
              </button>

              {isSubjectOpen ? (
                <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-[#0A0A0A] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                  {SUPPORT_INQUIRY_SUBJECTS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSubject(option);
                        setIsSubjectOpen(false);
                      }}
                      className={`w-full rounded-full px-4 py-2 text-left text-sm font-semibold transition hover:bg-white/10 ${
                        subject === option ? "bg-white/10 text-[#60A5FA]" : "text-white/80"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/40" htmlFor="contact-message">
                Message*
              </label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="How can we help?"
                rows={5}
                className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white placeholder:text-white/30 outline-none focus:border-[#2563EB]"
              />
            </div>

            {error ? <p className="text-center text-sm font-medium text-red-400">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-white/80 bg-white px-5 py-2.5 text-sm font-bold uppercase tracking-normal text-[#1E293B] shadow-[0_0_22px_rgba(37,99,235,0.55)] transition hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(37,99,235,0.75)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send message"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
