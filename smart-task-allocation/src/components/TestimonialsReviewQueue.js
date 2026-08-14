"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const FILTERS = [
  { key: "Pending", label: "Pending review" },
  { key: "Approved", label: "Approved" },
  { key: "Rejected", label: "Rejected" },
];

function StarRating({ value }) {
  if (!value) return <span className="text-xs font-semibold text-[#94a3b8]">No rating</span>;
  return (
    <span className="text-sm text-amber-500" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      <span className="text-[#d4d8e0]">{"★".repeat(5 - value)}</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const tone =
    status === "Approved"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Rejected"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>{status}</span>;
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

// Lives on its own tab in MarketingContentManager rather than inside the
// homepage/pricing "draft + Save changes" flow — every action here (curate,
// approve, reject, feature) is an immediate API call, not a section edit
// that waits to be saved.
export default function TestimonialsReviewQueue() {
  const [testimonials, setTestimonials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("Pending");
  const [error, setError] = useState("");
  const [isCurating, setIsCurating] = useState(false);
  const [curateMessage, setCurateMessage] = useState("");
  const [pendingActionId, setPendingActionId] = useState(null);

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platformadmin/testimonials", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load testimonials.");
      setTestimonials(result.testimonials ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function handleCurate() {
    if (isCurating) return;
    setIsCurating(true);
    setCurateMessage("");
    setError("");
    try {
      const response = await fetch("/api/platformadmin/testimonials/curate", {
        method: "POST",
        headers: await authHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not curate testimonials.");
      setCurateMessage(result.message);
      if (result.drafted) setFilter("Pending");
      await load();
    } catch (curateError) {
      setError(curateError.message);
    } finally {
      setIsCurating(false);
    }
  }

  async function handleAction(testimonialId, action) {
    setPendingActionId(testimonialId);
    setError("");
    try {
      const response = await fetch("/api/platformadmin/testimonials", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ testimonialId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update testimonial.");
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDelete(testimonialId) {
    setPendingActionId(testimonialId);
    setError("");
    try {
      const response = await fetch(`/api/platformadmin/testimonials?testimonialId=${testimonialId}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete testimonial.");
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setPendingActionId(null);
    }
  }

  const visible = testimonials.filter((t) => t.status === filter);
  const countByStatus = Object.fromEntries(FILTERS.map((f) => [f.key, testimonials.filter((t) => t.status === f.key).length]));

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-[#52627a]">
        Loading testimonials...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/60 bg-white/25 px-5 py-3 shadow-[0_20px_60px_rgba(13,30,76,0.15)] backdrop-blur-xl">
        <div className="inline-flex rounded-full border border-white/60 bg-white/30 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                filter === f.key ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
              }`}
            >
              {f.label} ({countByStatus[f.key] ?? 0})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {error ? <span className="text-xs font-bold text-red-600">{error}</span> : null}
          {!error && curateMessage ? <span className="text-xs font-bold text-[#52627a]">{curateMessage}</span> : null}
          <button
            type="button"
            onClick={handleCurate}
            disabled={isCurating}
            className="flex items-center gap-2 rounded-full bg-[#0a2a66] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              auto_awesome
            </span>
            {isCurating ? "Analyzing feedback…" : "Curate from feedback"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[28px] border border-white/60 bg-white/20 p-4 shadow-[0_20px_60px_rgba(13,30,76,0.15)] backdrop-blur-xl">
        {visible.length ? (
          visible.map((testimonial) => (
            <div
              key={testimonial.id}
              className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-[#0D1E4C]">{testimonial.authorName}</p>
                    {testimonial.authorJobTitle ? (
                      <span className="text-xs font-semibold text-[#94a3b8]">{testimonial.authorJobTitle}</span>
                    ) : null}
                  </div>
                  <StarRating value={testimonial.rating} />
                </div>
                <StatusBadge status={testimonial.status} />
              </div>

              <p className="mt-3 text-sm font-medium leading-relaxed text-[#07183b]">
                &ldquo;{testimonial.message}&rdquo;
              </p>

              {testimonial.sourceFeedback ? (
                <p className="mt-2 rounded-lg bg-[#f4f6fb] px-3 py-2 text-xs text-[#61708a]">
                  <span className="font-bold uppercase tracking-wide">Source feedback:</span>{" "}
                  {testimonial.sourceFeedback}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {testimonial.status === "Pending" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAction(testimonial.id, "approve")}
                      disabled={pendingActionId === testimonial.id}
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(testimonial.id, "reject")}
                      disabled={pendingActionId === testimonial.id}
                      className="rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                {testimonial.status === "Approved" ? (
                  <button
                    type="button"
                    onClick={() => handleAction(testimonial.id, "toggle-featured")}
                    disabled={pendingActionId === testimonial.id}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                      testimonial.isFeatured
                        ? "bg-[#0D1E4C] text-white hover:bg-[#061a40]"
                        : "border border-white/60 bg-white/60 text-[#0D1E4C] hover:bg-white"
                    }`}
                  >
                    {testimonial.isFeatured ? "Featured ★" : "Feature this"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDelete(testimonial.id)}
                  disabled={pendingActionId === testimonial.id}
                  className="ml-auto rounded-full px-3 py-1.5 text-xs font-bold text-[#94a3b8] transition hover:bg-white/60 hover:text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-sm font-semibold text-[#52627a]">
            {filter === "Pending"
              ? "No pending testimonials — click \"Curate from feedback\" to have Optimus AI draft some from recent Feedback inquiries."
              : `No ${filter.toLowerCase()} testimonials.`}
          </p>
        )}
      </div>
    </div>
  );
}
