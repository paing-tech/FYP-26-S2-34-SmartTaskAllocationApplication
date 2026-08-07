"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
];

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

function FeatureFlagRow({ featureFlag, isSaving, onChangePlan }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/60 bg-white/40 px-5 py-4 backdrop-blur-xl">
      <div className="min-w-0">
        <p className="text-sm font-black text-[#0D1E4C]">{featureFlag.feature_name}</p>
        {featureFlag.description ? (
          <p className="mt-0.5 max-w-lg text-xs font-medium text-[#667085]">{featureFlag.description}</p>
        ) : null}
      </div>

      <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-white/70 bg-white/60 p-1 shadow-sm">
        {PLAN_OPTIONS.map((option) => {
          const isSelected = featureFlag.required_plan === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangePlan(featureFlag.feature_key, option.value)}
              disabled={isSaving}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/70"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Lets Platform Admin decide which plan tier unlocks each already-wired
// gating checkpoint (Optimus AI chat, AI auto-assign, Allocation History,
// ...). This controls HOW PREMIUM an existing checkpoint is — adding a
// brand new checkpoint still requires wiring a guard() call into that
// feature's code.
export default function FeatureFlagsManager() {
  const [featureFlags, setFeatureFlags] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  async function loadFeatureFlags() {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/feature-flags", { headers: await authHeaders() });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load feature flags.");
      }

      setFeatureFlags(result.featureFlags ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadFeatureFlags();
    })();
  }, []);

  async function changePlan(featureKey, requiredPlan) {
    if (savingKey) return;

    const previous = featureFlags;
    setSavingKey(featureKey);
    setFeatureFlags((current) =>
      current.map((flag) => (flag.feature_key === featureKey ? { ...flag, required_plan: requiredPlan } : flag)),
    );
    setError("");

    try {
      const response = await fetch("/api/feature-flags", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ featureKey, requiredPlan }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not update feature.");
      }
    } catch (changeError) {
      setFeatureFlags(previous);
      setError(changeError.message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-black text-[#0D1E4C]">Feature Gating</h1>
      <p className="mt-1 text-sm font-medium text-[#667085]">
        Choose the minimum plan tier required to use each premium feature.
      </p>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {featureFlags.map((featureFlag) => (
          <FeatureFlagRow
            key={featureFlag.feature_key}
            featureFlag={featureFlag}
            isSaving={savingKey === featureFlag.feature_key}
            onChangePlan={changePlan}
          />
        ))}

        {!featureFlags.length && !isLoading ? (
          <p className="rounded-2xl border-2 border-dashed border-[#cbd5e1] px-6 py-10 text-center text-sm font-bold text-[#94a3b8]">
            No gated features registered yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
