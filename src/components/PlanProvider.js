"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import Portal from "@/components/Portal";
import PlanCards from "@/components/PlanCards";

const PLAN_RANK = { starter: 0, pro: 1, team: 2 };

const PlanContext = createContext(null);

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

// Wraps every signed-in dashboard (see SideMenuLayout) with the org's plan
// + the feature-flag registry, and owns the two gating modals — the
// "locked feature" prompt and the "choose a plan" card picker it opens
// into. Any component can call usePlanGate().guard(featureKey, fn) to run
// fn only if the org's plan clears that feature's required_plan bar.
export function PlanProvider({ children }) {
  const [plan, setPlan] = useState(null);
  const [featureFlags, setFeatureFlags] = useState([]);
  const [lockedFeatureKey, setLockedFeatureKey] = useState(null);
  const [isChoosingPlan, setIsChoosingPlan] = useState(false);
  const [changingTier, setChangingTier] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const headers = await authHeaders();
      const [planResponse, flagsResponse] = await Promise.all([
        fetch("/api/organization-plan", { headers }),
        fetch("/api/feature-flags", { headers }),
      ]);
      const [planResult, flagsResult] = await Promise.all([planResponse.json(), flagsResponse.json()]);

      if (planResponse.ok) setPlan(planResult.plan ?? "starter");
      if (flagsResponse.ok) setFeatureFlags(flagsResult.featureFlags ?? []);
    })();
  }, []);

  const featureByKey = useMemo(
    () => new Map(featureFlags.map((flag) => [flag.feature_key, flag])),
    [featureFlags],
  );

  const isLocked = useCallback(
    (featureKey) => {
      // No org (e.g. Platform Admin) or not loaded yet — never block.
      if (!plan) return false;
      const feature = featureByKey.get(featureKey);
      if (!feature) return false;
      return (PLAN_RANK[plan] ?? 0) < (PLAN_RANK[feature.required_plan] ?? 0);
    },
    [plan, featureByKey],
  );

  const guard = useCallback(
    (featureKey, onAllowed) => {
      if (isLocked(featureKey)) {
        setLockedFeatureKey(featureKey);
        return;
      }
      onAllowed?.();
    },
    [isLocked],
  );

  async function selectPlan(tier) {
    if (changingTier) return;

    setChangingTier(tier);
    setError("");

    try {
      const response = await fetch("/api/organization-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ plan: tier }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not change plan.");
      }

      setPlan(tier);
      setIsChoosingPlan(false);
      setLockedFeatureKey(null);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setChangingTier(null);
    }
  }

  function closeAll() {
    setLockedFeatureKey(null);
    setIsChoosingPlan(false);
    setError("");
  }

  const openPlanPicker = useCallback(() => setIsChoosingPlan(true), []);

  const lockedFeature = lockedFeatureKey ? featureByKey.get(lockedFeatureKey) : null;
  const value = useMemo(
    () => ({ plan, isLocked, guard, openPlanPicker }),
    [plan, isLocked, guard, openPlanPicker],
  );

  return (
    <PlanContext.Provider value={value}>
      {children}

      {lockedFeature ? (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
            onClick={() => setLockedFeatureKey(null)}
          >
            <div
              className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#0b0b0d] p-16 text-center shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            >
              <Image
                src="/premium-optima.png"
                alt="Optima Premium"
                width={96}
                height={96}
                className="mx-auto h-40 w-40 object-contain"
              />
              <p className="mt-5 whitespace-nowrap text-sm font-medium text-white">
                Upgrade to Pro or Team to unlock this feature
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setLockedFeatureKey(null)}
                  className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={() => setIsChoosingPlan(true)}
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0b0b0d] transition hover:bg-white/90"
                >
                  View Plans
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {isChoosingPlan ? (
        <Portal>
          <div className="fixed inset-0 z-[110] flex min-h-screen flex-col justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-md">
            <div className="relative mx-auto flex w-full max-w-6xl items-center justify-center pb-6 pt-2">
              <h2 className="text-2xl font-black text-white">Choose your plan</h2>
              <button
                type="button"
                onClick={closeAll}
                aria-label="Close"
                className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white transition hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            {error ? (
              <p className="mx-auto mb-4 max-w-6xl text-sm font-medium text-red-400">{error}</p>
            ) : null}
            <div className="mx-auto max-w-6xl pb-10">
              <PlanCards changingTier={changingTier} currentPlan={plan} onSelectPlan={selectPlan} />
            </div>
          </div>
        </Portal>
      ) : null}
    </PlanContext.Provider>
  );
}

export function usePlanGate() {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error("usePlanGate must be used within a PlanProvider");
  }
  return ctx;
}
