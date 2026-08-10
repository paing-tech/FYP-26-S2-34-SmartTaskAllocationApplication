"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PublicFeedbackPageContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public-feedback", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load public feedback.");
        if (!cancelled) setItems(result.feedback ?? []);
      })
      .catch((loadError) => !cancelled && setError(loadError.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const average = useMemo(
    () => items.length ? (items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / items.length).toFixed(1) : "0.0",
    [items],
  );

  return (
    <main className="min-h-screen bg-[#C7DDEB] px-6 py-12 text-[#07183b]">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="rounded-full bg-white/70 px-5 py-2 text-sm font-bold">Back to Optima</Link>
          <Link href="/support" className="rounded-full bg-[#0a2a66] px-5 py-2 text-sm font-bold text-white">Contact support</Link>
        </div>
        <section className="mt-12 rounded-[40px] border border-white/70 bg-white/55 p-8 shadow-sm backdrop-blur sm:p-12">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#2563EB]">Approved customer feedback</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">What Optima users say</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#52627a]">
            Only feedback approved by Platform Admin is shown here. Pending, hidden, and rejected records remain private.
          </p>
          <div className="mt-6 flex gap-3 text-sm font-bold">
            <span className="rounded-full bg-white px-4 py-2">{items.length} approved responses</span>
            <span className="rounded-full bg-white px-4 py-2">{average} average rating</span>
          </div>
        </section>

        {loading ? <p className="mt-8 text-center font-bold">Loading approved feedback...</p> : null}
        {error ? <p className="mt-8 rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[#83A6CE] bg-white/50 p-10 text-center">
            <h2 className="text-2xl font-black">No user feedback is currently available.</h2>
            <p className="mt-2 text-[#52627a]">Approved feedback will appear here after Platform Admin review.</p>
          </div>
        ) : null}
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm">
              <p className="text-lg text-amber-500" aria-label={`${item.rating} out of 5 stars`}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</p>
              <h2 className="mt-4 text-lg font-black">{item.subject || item.category}</h2>
              <p className="mt-3 leading-7 text-[#334155]">{item.message}</p>
              <div className="mt-5 border-t border-[#E2E8F0] pt-4 text-sm">
                <p className="font-bold">{item.name}</p>
                <p className="text-[#64748B]">{new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
