"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro / Team" },
];

const USER_TYPE_SECTIONS = [
  { key: "useradmin", label: "User Admin", featureKeys: ["optimus_ai"] },
  { key: "manager", label: "Manager", featureKeys: ["optimus_ai", "ai_auto_assign", "allocation_history"] },
  { key: "employee", label: "Employee", featureKeys: ["optimus_ai"] },
];

const SHORT_DESCRIPTIONS = {
  optimus_ai: "Chat with Optimus AI and create tasks.",
  ai_auto_assign: "Assign tasks to the best-matched employee automatically.",
  allocation_history: "View allocation records and reassign tasks.",
};

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
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="min-w-0">
        <p className="text-sm font-black text-[#0D1E4C]">{featureFlag.feature_name}</p>
        <p className="mt-0.5 text-xs font-medium text-[#667085]">
          {SHORT_DESCRIPTIONS[featureFlag.feature_key] || featureFlag.description}
        </p>
      </div>

      <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-white/70 bg-white/60 p-1 shadow-sm">
        {PLAN_OPTIONS.map((option) => {
          // "Pro / Team" is the minimum-requirement option — selected
          // whenever the stored tier is pro OR (legacy) team, but choosing
          // it always writes 'pro' so the plan-rank check in
          // PlanProvider.js naturally lets Team orgs through too.
          const isSelected =
            option.value === "pro"
              ? featureFlag.required_plan === "pro" || featureFlag.required_plan === "team"
              : featureFlag.required_plan === option.value;
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
  const [activeRole, setActiveRole] = useState(USER_TYPE_SECTIONS[0].key);
  const sectionRefs = useRef({});

  const sections = useMemo(() => {
    const featureByKey = new Map(featureFlags.map((featureFlag) => [featureFlag.feature_key, featureFlag]));
    const knownKeys = new Set(USER_TYPE_SECTIONS.flatMap((section) => section.featureKeys));
    const grouped = USER_TYPE_SECTIONS.map((section) => ({
      key: section.key,
      label: section.label,
      features: section.featureKeys.map((key) => featureByKey.get(key)).filter(Boolean),
    })).filter((section) => section.features.length);
    const uncategorized = featureFlags.filter((featureFlag) => !knownKeys.has(featureFlag.feature_key));

    return uncategorized.length ? [...grouped, { key: "other", label: "Other", features: uncategorized }] : grouped;
  }, [featureFlags]);

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

  // The left tab is purely a quick-jump — the right side is one continuous
  // scroll through every role's features, not a per-role page swap.
  function jumpToRole(key) {
    setActiveRole(key);
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[10%] shrink-0" aria-hidden="true" />

      <div className="w-[20%] shrink-0 pr-6">
        <h1 className="text-2xl font-black text-[#0D1E4C]">Feature Gating</h1>
        <p className="mb-3 mt-8 text-xs font-black uppercase tracking-wide text-[#94a3b8]">Role</p>
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => jumpToRole(section.key)}
              className={`block w-full rounded-full px-4 py-2 text-left text-sm font-bold transition ${
                activeRole === section.key ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex min-h-0 w-[60%] shrink-0 flex-col">
        <h1 className="invisible text-2xl font-black" aria-hidden="true">
          Feature Gating
        </h1>
        <p className="mb-3 mt-8 text-xs font-black uppercase tracking-wide text-[#94a3b8]">Features</p>

        {error ? (
          <p className="mb-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pb-8 pr-2">
          {sections.map((section) => (
            <section key={section.key} ref={(el) => (sectionRefs.current[section.key] = el)}>
              <h2 className="mb-4 text-lg font-black text-[#0D1E4C]">{section.label}</h2>
              <div className="divide-y divide-white/50 overflow-hidden rounded-[28px] border border-white/60 bg-white/30 shadow-sm backdrop-blur-xl">
                {section.features.map((featureFlag) => (
                  <FeatureFlagRow
                    key={featureFlag.feature_key}
                    featureFlag={featureFlag}
                    isSaving={savingKey === featureFlag.feature_key}
                    onChangePlan={changePlan}
                  />
                ))}
              </div>
            </section>
          ))}

          {!sections.length && !isLoading ? (
            <p className="rounded-2xl border-2 border-dashed border-[#cbd5e1] px-6 py-10 text-center text-sm font-bold text-[#94a3b8]">
              No gated features registered yet.
            </p>
          ) : null}
        </div>
      </div>

      <div className="w-[10%] shrink-0" aria-hidden="true" />
    </div>
  );
}
