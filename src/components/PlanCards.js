"use client";

import Link from "next/link";
import ElectricBorder from "@/components/ElectricBorder";
import { useSiteContent } from "@/lib/useSiteContent";

function CheckIcon({ color }) {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const PLAN_RANK = { starter: 0, pro: 1, team: 2 };

function getPlanTier(plan) {
  return (plan.name || "").trim().toLowerCase();
}

function getCtaLabel(tier, currentPlan) {
  if (tier === currentPlan) return "Current Plan";

  const rank = PLAN_RANK[tier] ?? 0;
  const currentRank = PLAN_RANK[currentPlan] ?? 0;

  if (rank < currentRank) {
    if (tier === "pro") return "Switch to Pro";
    if (tier === "starter") return "Switch to Starter";
    return "Switch Plan";
  }
  if (tier === "pro") return "Upgrade to Pro";
  if (tier === "team") return "Choose Team";
  return "Switch Plan";
}

function PlanCard({ isChanging, onSelectPlan, plan, currentPlan }) {
  const tier = getPlanTier(plan);
  // currentPlan is only ever passed by a signed-in, plan-aware caller — a
  // logged-out visitor on the public /pricing page gets null here and
  // falls back to the original static "sign up" link.
  const isPlanAware = Boolean(currentPlan);
  const isCurrent = isPlanAware && tier === currentPlan;
  const ctaLabel = isPlanAware ? getCtaLabel(tier, currentPlan) : plan.cta;

  return (
    <div className="group relative h-full">
      {/* Colored glow that hugs the card's edge (box-shadow follows the rounded
          outline) and stays behind every card. Fades in just after the border. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[28px] opacity-0 transition-opacity duration-500 delay-200 group-hover:opacity-80"
        style={{ boxShadow: `0 0 40px 6px ${plan.color}` }}
      />
      <ElectricBorder
        color={plan.color}
        speed={1}
        chaos={plan.highlighted ? 0.05 : 0.005}
        thickness={1.5}
        borderRadius={28}
        showOnHover
        className="h-full"
      >
        <div className="flex h-full flex-col rounded-[28px] border border-white/10 bg-[#0b0b0d] p-8 transition-colors duration-300 group-hover:border-transparent">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold" style={{ color: plan.color }}>
              {plan.name}
            </h3>
            {plan.tag ? (
              <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-medium text-white/70">
                {plan.tag}
              </span>
            ) : null}
          </div>

          <div className="mt-6 flex items-end gap-1">
            <span className="text-6xl font-black tracking-tight text-white">{plan.price}</span>
            <span className="mb-2 text-sm font-medium text-white/50">{plan.cadence}</span>
          </div>

          <p className="mt-4 min-h-[3.5rem] text-sm leading-relaxed text-white/60">{plan.description}</p>

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="flex flex-col gap-4">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm font-medium text-white/85">
                <CheckIcon color={plan.color} />
                {feature}
              </li>
            ))}
          </ul>

          {isPlanAware ? (
            <button
              type="button"
              onClick={() => onSelectPlan?.(tier)}
              disabled={isCurrent || isChanging}
              className={`mt-auto flex h-13 w-full items-center justify-center rounded-full py-3.5 text-sm font-bold transition disabled:cursor-not-allowed ${
                isCurrent
                  ? "border border-white/15 text-white/40"
                  : plan.highlighted
                    ? "bg-white text-[#0b0b0d] hover:bg-white/90"
                    : "border border-white/20 text-white hover:border-white/50 hover:bg-white/5"
              } ${isChanging ? "opacity-60" : ""}`}
            >
              {isChanging ? "Updating…" : ctaLabel}
            </button>
          ) : (
            <Link href="/signup" className="mt-auto pt-8">
              <span
                className={`flex h-13 w-full items-center justify-center rounded-full py-3.5 text-sm font-bold transition ${
                  plan.highlighted
                    ? "bg-white text-[#0b0b0d] hover:bg-white/90"
                    : "border border-white/20 text-white hover:border-white/50 hover:bg-white/5"
                }`}
              >
                {ctaLabel}
              </span>
            </Link>
          )}
        </div>
      </ElectricBorder>
    </div>
  );
}

// Shared by the public /pricing marketing page and the in-app "choose a
// plan" modal. Same CMS-backed card content either way (site_content's
// "pricing" section) — only the CTA behavior differs, switched by whether
// `currentPlan` is provided.
export default function PlanCards({ changingTier = null, className = "", currentPlan = null, onSelectPlan }) {
  const content = useSiteContent("pricing");

  return (
    <div className={`grid gap-8 md:grid-cols-3 ${className}`}>
      {(content.plans ?? []).map((plan) => (
        <PlanCard
          key={plan.name}
          plan={plan}
          currentPlan={currentPlan}
          isChanging={changingTier === getPlanTier(plan)}
          onSelectPlan={onSelectPlan}
        />
      ))}
    </div>
  );
}
