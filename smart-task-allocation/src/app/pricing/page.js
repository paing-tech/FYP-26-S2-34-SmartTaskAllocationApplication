"use client";

import { useEffect, useState } from "react";
import LandingNav from "@/components/LandingNav";
import LanyardShowcase from "@/components/LanyardShowcase";
import PlanCards from "@/components/PlanCards";
import { useSiteContent } from "@/lib/useSiteContent";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function PricingPage() {
  const content = useSiteContent("pricing");
  const [currentPlan, setCurrentPlan] = useState(null);
  const [changingTier, setChangingTier] = useState(null);
  const [error, setError] = useState("");

  // A logged-out visitor sees the static "sign up" CTA (PlanCards falls
  // back to that automatically when currentPlan stays null). Only a
  // signed-in org member gets the plan-aware Current Plan/Upgrade/Downgrade
  // buttons below.
  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) return;

      const response = await fetch("/api/organization-plan", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();

      if (response.ok && result.plan) {
        setCurrentPlan(result.plan);
      }
    })();
  }, []);

  async function selectPlan(tier) {
    if (changingTier) return;

    setChangingTier(tier);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/organization-plan", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ plan: tier }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not change plan.");
      }

      setCurrentPlan(tier);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setChangingTier(null);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 pb-10 pt-32 text-white">
      <LandingNav />

      {!content.hidden ? (
        <>
          <section className="mx-auto mt-4 max-w-3xl text-center">
            <span className="rounded-full border border-white/15 px-4 py-1 text-lg font-medium text-white/80">
              {content.badge}
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">{content.heading}</h1>
            <p className="mt-4 text-base text-white/60">{content.subheading}</p>
            {error ? <p className="mt-4 text-sm font-medium text-red-400">{error}</p> : null}
          </section>

          <section className="relative isolate mx-auto mt-16 max-w-6xl pb-60">
            <PlanCards changingTier={changingTier} currentPlan={currentPlan} onSelectPlan={selectPlan} />
          </section>
        </>
      ) : null}

      <div className="-mx-6">
        <LanyardShowcase />
      </div>
    </main>
  );
}
