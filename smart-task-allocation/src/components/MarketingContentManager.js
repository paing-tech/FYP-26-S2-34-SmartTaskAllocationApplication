"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { SITE_CONTENT_DEFAULTS } from "@/lib/siteContentSchema";
import { FeatureIcon } from "@/components/FeatureShowcase";
import { SocialIcon } from "@/components/LandingFooter";
import TestimonialsReviewQueue from "@/components/TestimonialsReviewQueue";

function isSameContent(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Renders exactly like the live text it replaces (same className), just with
// a subtle focus ring so it reads as editable without changing the look at
// rest. tone="dark" is for editing on a light section background.
function EditableInput({ className = "", onChange, placeholder, tone = "light", value }) {
  const ring = tone === "dark" ? "focus:ring-[#0D1E4C]/20" : "focus:ring-white/30";
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`-mx-1 rounded-md bg-transparent px-1 outline-none ring-1 ring-transparent transition ${ring} ${className}`}
    />
  );
}

function EditableTextarea({ className = "", onChange, rows = 2, tone = "light", value }) {
  const ring = tone === "dark" ? "focus:ring-[#0D1E4C]/20" : "focus:ring-white/30";
  return (
    <textarea
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      className={`-mx-1 block w-full resize-none rounded-md bg-transparent px-1 outline-none ring-1 ring-transparent transition ${ring} ${className}`}
    />
  );
}

// Small ✕ that only appears on hover of its "group" ancestor.
function RemoveButton({ label = "Remove", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-red-600"
    >
      <span className="material-symbols-outlined text-sm" aria-hidden="true">
        close
      </span>
    </button>
  );
}

function AddGhost({ children, className = "", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl border border-dashed border-current/30 text-sm font-bold opacity-60 transition hover:border-current/60 hover:opacity-100 ${className}`}
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        add
      </span>
      {children}
    </button>
  );
}

function CheckIcon({ color }) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
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

// Wraps a section with the eye-icon show/hide toggle at its top-right
// corner, matching how it'll actually disappear from the live site.
function SectionFrame({ children, hidden, onToggleHidden }) {
  return (
    <div className="group/section relative">
      <button
        type="button"
        onClick={onToggleHidden}
        aria-label={hidden ? "Hidden on the live site — click to show" : "Visible on the live site — click to hide"}
        title={hidden ? "Hidden on the live site — click to show" : "Visible on the live site — click to hide"}
        className={`absolute right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm transition ${
          hidden
            ? "border-red-400/60 bg-red-500/90 text-white hover:bg-red-500"
            : "border-white/30 bg-black/40 text-white opacity-0 hover:bg-black/60 group-hover/section:opacity-100"
        }`}
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          {hidden ? "visibility_off" : "visibility"}
        </span>
      </button>
      <div className={hidden ? "opacity-40 grayscale" : ""}>{children}</div>
    </div>
  );
}

function NavPreview({ draft, onChange }) {
  const navItems = draft.navItems ?? [];

  function updateField(key, value) {
    onChange({ ...draft, [key]: value });
  }

  function updateItem(index, key, value) {
    onChange({ ...draft, navItems: navItems.map((item, i) => (i === index ? { ...item, [key]: value } : item)) });
  }

  function removeItem(index) {
    onChange({ ...draft, navItems: navItems.filter((_, i) => i !== index) });
  }

  function addItem() {
    onChange({ ...draft, navItems: [...navItems, { label: "New link", href: "/" }] });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 bg-[#05070d] px-[6%] py-6">
      <div className="flex shrink-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={draft.logoUrl} alt="Logo" className="h-12 w-12 object-cover" />
        <EditableInput
          value={draft.brand}
          onChange={(value) => updateField("brand", value)}
          className="text-md font-extrabold text-white"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80">
        {navItems.map((item, index) => (
          <div key={index} className="group relative flex flex-col items-center rounded-2xl px-2 py-1">
            <RemoveButton onClick={() => removeItem(index)} label={`Remove ${item.label}`} />
            <EditableInput
              value={item.label}
              onChange={(value) => updateItem(index, "label", value)}
              className="w-24 text-center"
            />
            <EditableInput
              value={item.href}
              onChange={(value) => updateItem(index, "href", value)}
              className="w-24 text-center text-[9px] text-white/40"
              placeholder="/link"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          aria-label="Add nav link"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-white/30 text-white/60 transition hover:border-white/60 hover:text-white"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            add
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <EditableInput
          value={draft.signInLabel}
          onChange={(value) => updateField("signInLabel", value)}
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white"
        />
        <EditableInput
          value={draft.ctaLabel}
          onChange={(value) => updateField("ctaLabel", value)}
          className="rounded-full border border-[#1E40AF]/40 bg-[#1E40AF]/20 px-6 py-3 text-sm font-bold text-white"
        />
      </div>

      <div className="w-full">
        <EditableInput
          value={draft.logoUrl}
          onChange={(value) => updateField("logoUrl", value)}
          className="w-full max-w-xs text-[10px] text-white/30"
          placeholder="Logo image URL"
        />
      </div>
    </div>
  );
}

function HeroPreview({ draft, onChange }) {
  function updateField(key, value) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="relative overflow-hidden bg-black px-[6%] py-20">
      {/* Static glow standing in for the live LaserFlow WebGL beam — kept out
          of the editor for performance; the real animated beam still renders
          on the live site. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-full w-[45%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.45),transparent_70%)]"
      />

      <div className="relative z-10 max-w-[600px]">
        <EditableTextarea
          value={draft.headline}
          onChange={(value) => updateField("headline", value)}
          rows={2}
          className="bg-[linear-gradient(90deg,#FFFFFF_0%,#FFFFFF_30%,#2563EB_45%,#000000_95%)] bg-clip-text text-4xl font-bold leading-[1.2] tracking-[0.8] text-transparent lg:text-6xl"
        />
        <EditableInput
          value={draft.subheadline}
          onChange={(value) => updateField("subheadline", value)}
          className="mt-4 block text-base font-light text-white"
        />
        <div className="mt-10 inline-flex h-14 min-w-56 items-center justify-center gap-2 rounded-full border border-white/80 bg-white px-8 text-sm font-bold uppercase text-[#1E293B]">
          <EditableInput
            value={draft.ctaLabel}
            onChange={(value) => updateField("ctaLabel", value)}
            tone="dark"
            className="text-center font-bold uppercase"
          />
          <span className="text-2xl leading-none">→</span>
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-14 aspect-[1512/940] w-[85%] overflow-hidden rounded-[20px] border-2 border-[#2563EB] bg-[#120F17] shadow-[0_0_60px_rgba(37,99,235,0.5)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={draft.heroImageUrl} alt="Dashboard preview" className="h-full w-full object-contain" />
      </div>
      <div className="relative z-10 mt-3 flex justify-center">
        <EditableInput
          value={draft.heroImageUrl}
          onChange={(value) => updateField("heroImageUrl", value)}
          className="w-full max-w-md text-center text-xs text-white/30"
          placeholder="Dashboard preview image URL"
        />
      </div>
    </div>
  );
}

const FEATURE_ICON_OPTIONS = ["allocation", "team", "workspace", "schedule", "ai", "analytics"];

function FeaturesPreview({ draft, onChange }) {
  const items = draft.items ?? [];

  function updateField(key, value) {
    onChange({ ...draft, [key]: value });
  }

  function updateItem(index, key, value) {
    onChange({ ...draft, items: items.map((item, i) => (i === index ? { ...item, [key]: value } : item)) });
  }

  function removeItem(index) {
    onChange({ ...draft, items: items.filter((_, i) => i !== index) });
  }

  function addItem() {
    onChange({
      ...draft,
      items: [...items, { title: "New feature", description: "Description", icon: "workspace", videoId: "" }],
    });
  }

  return (
    <div className="bg-white px-[6%] py-14 text-[#0D1E4C]">
      <EditableInput
        value={draft.heading}
        onChange={(value) => updateField("heading", value)}
        tone="dark"
        className="block max-w-[720px] text-2xl font-bold leading-[1.1] tracking-tight lg:text-4xl"
      />

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((feature, index) => (
          <div key={index} className="group relative rounded-2xl border border-[#0D1E4C]/10 p-4">
            <RemoveButton onClick={() => removeItem(index)} label={`Remove ${feature.title}`} />
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0D1E4C]/[0.06] text-[#0D1E4C]">
                <FeatureIcon name={feature.icon} />
              </span>
              <select
                value={feature.icon}
                onChange={(event) => updateItem(index, "icon", event.target.value)}
                className="rounded-md border border-[#0D1E4C]/10 bg-transparent px-1 py-0.5 text-[10px] text-[#0D1E4C]/60 outline-none"
              >
                {FEATURE_ICON_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <EditableInput
              value={feature.title}
              onChange={(value) => updateItem(index, "title", value)}
              tone="dark"
              className="mt-2 block text-base font-bold"
            />
            <EditableTextarea
              value={feature.description}
              onChange={(value) => updateItem(index, "description", value)}
              tone="dark"
              rows={2}
              className="mt-1 text-xs leading-relaxed text-[#0D1E4C]/70"
            />
            <EditableInput
              value={feature.videoId}
              onChange={(value) => updateItem(index, "videoId", value)}
              tone="dark"
              className="mt-2 block text-[10px] text-[#0D1E4C]/40"
              placeholder="video-file-name"
            />
          </div>
        ))}

        <AddGhost onClick={addItem} className="min-h-[140px] flex-col text-[#0D1E4C]">
          Add feature
        </AddGhost>
      </div>
    </div>
  );
}

function TestimonialsPreview({ draft, onChange }) {
  function updateField(key, value) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="bg-white px-4 py-12 text-center">
      <div className="mx-auto max-w-[600px]">
        <EditableInput
          value={draft.badge}
          onChange={(value) => updateField("badge", value)}
          tone="dark"
          className="inline-block rounded-lg border border-[#0D1E4C]/15 px-4 py-1 text-center text-sm font-medium text-[#0D1E4C]"
        />
        <EditableInput
          value={draft.heading}
          onChange={(value) => updateField("heading", value)}
          tone="dark"
          className="mt-5 block text-center text-3xl font-bold tracking-tight text-[#0D1E4C]"
        />
        <EditableInput
          value={draft.subheading}
          onChange={(value) => updateField("subheading", value)}
          tone="dark"
          className="mt-4 block text-center text-[#0D1E4C]/70"
        />
      </div>
      <p className="mt-6 text-xs font-semibold text-[#94a3b8]">
        Real testimonials from users are pulled in live and shown below this header — review and approve them under the &ldquo;Testimonials&rdquo; tab above.
      </p>
    </div>
  );
}

function PricingPreview({ draft, onChange }) {
  const plans = draft.plans ?? [];

  function updateField(key, value) {
    onChange({ ...draft, [key]: value });
  }

  function updatePlan(index, key, value) {
    onChange({ ...draft, plans: plans.map((plan, i) => (i === index ? { ...plan, [key]: value } : plan)) });
  }

  function removePlan(index) {
    onChange({ ...draft, plans: plans.filter((_, i) => i !== index) });
  }

  function addPlan() {
    onChange({
      ...draft,
      plans: [
        ...plans,
        {
          name: "New Plan",
          color: "#2563EB",
          tag: "",
          price: "$0",
          cadence: "/monthly",
          description: "Plan description",
          features: [],
          cta: "Try Optima",
          highlighted: false,
        },
      ],
    });
  }

  function updateFeature(planIndex, featureIndex, value) {
    const nextFeatures = plans[planIndex].features.map((feature, i) => (i === featureIndex ? value : feature));
    updatePlan(planIndex, "features", nextFeatures);
  }

  function removeFeature(planIndex, featureIndex) {
    updatePlan(
      planIndex,
      "features",
      plans[planIndex].features.filter((_, i) => i !== featureIndex),
    );
  }

  function addFeature(planIndex) {
    updatePlan(planIndex, "features", [...plans[planIndex].features, "New feature"]);
  }

  return (
    <div className="bg-black px-6 py-14 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <EditableInput
          value={draft.badge}
          onChange={(value) => updateField("badge", value)}
          className="inline-block rounded-full border border-white/15 px-4 py-1 text-center text-lg font-medium text-white/80"
        />
        <EditableInput
          value={draft.heading}
          onChange={(value) => updateField("heading", value)}
          className="mt-6 block text-center text-3xl font-bold tracking-tight sm:text-4xl"
        />
        <EditableTextarea
          value={draft.subheading}
          onChange={(value) => updateField("subheading", value)}
          rows={2}
          className="mt-4 text-center text-base text-white/60"
        />
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-8 md:grid-cols-3">
        {plans.map((plan, planIndex) => (
          <div
            key={planIndex}
            className="group relative flex flex-col rounded-[28px] border border-white/10 bg-[#0b0b0d] p-6"
          >
            <RemoveButton onClick={() => removePlan(planIndex)} label={`Remove ${plan.name}`} />

            <div className="flex items-center justify-between gap-3">
              <EditableInput
                value={plan.name}
                onChange={(value) => updatePlan(planIndex, "name", value)}
                className="text-lg font-bold"
              />
              <input
                type="color"
                value={plan.color}
                onChange={(event) => updatePlan(planIndex, "color", event.target.value)}
                aria-label={`${plan.name} accent color`}
                className="h-6 w-6 shrink-0 cursor-pointer rounded-full border border-white/20 bg-transparent"
              />
            </div>

            <EditableInput
              value={plan.tag}
              onChange={(value) => updatePlan(planIndex, "tag", value)}
              placeholder="Tag (optional)"
              className="mt-2 w-fit rounded-full border border-white/25 px-3 py-1 text-xs font-medium text-white/70"
            />

            <div className="mt-4 flex items-end gap-1">
              <EditableInput
                value={plan.price}
                onChange={(value) => updatePlan(planIndex, "price", value)}
                className="w-20 text-4xl font-black tracking-tight"
              />
              <EditableInput
                value={plan.cadence}
                onChange={(value) => updatePlan(planIndex, "cadence", value)}
                className="mb-1 w-24 text-xs font-medium text-white/50"
              />
            </div>

            <EditableTextarea
              value={plan.description}
              onChange={(value) => updatePlan(planIndex, "description", value)}
              rows={2}
              className="mt-3 text-xs leading-relaxed text-white/60"
            />

            <div className="my-4 h-px w-full bg-white/10" />

            <div className="flex flex-col gap-2">
              {(plan.features ?? []).map((feature, featureIndex) => (
                <div
                  key={featureIndex}
                  className="group/feature relative flex items-center gap-2 text-xs font-medium text-white/85"
                >
                  <CheckIcon color={plan.color} />
                  <EditableInput
                    value={feature}
                    onChange={(value) => updateFeature(planIndex, featureIndex, value)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeFeature(planIndex, featureIndex)}
                    aria-label="Remove feature"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/30 opacity-0 transition group-hover/feature:opacity-100 hover:text-red-400"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addFeature(planIndex)}
                className="mt-1 text-left text-xs font-bold text-white/40 transition hover:text-white/70"
              >
                + Add feature
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs font-bold text-white/50">
              <input
                type="checkbox"
                checked={Boolean(plan.highlighted)}
                onChange={(event) => updatePlan(planIndex, "highlighted", event.target.checked)}
              />
              Highlighted
            </label>

            <EditableInput
              value={plan.cta}
              onChange={(value) => updatePlan(planIndex, "cta", value)}
              className="mt-6 rounded-full border border-white/20 py-3 text-center text-sm font-bold"
            />
          </div>
        ))}

        <AddGhost onClick={addPlan} className="min-h-[300px] flex-col text-white">
          Add plan
        </AddGhost>
      </div>
    </div>
  );
}

function FooterPreview({ draft, onChange }) {
  const socialLinks = draft.socialLinks ?? [];

  function updateField(key, value) {
    onChange({ ...draft, [key]: value });
  }

  function updateSocial(index, key, value) {
    onChange({
      ...draft,
      socialLinks: socialLinks.map((social, i) => (i === index ? { ...social, [key]: value } : social)),
    });
  }

  function removeSocial(index) {
    onChange({ ...draft, socialLinks: socialLinks.filter((_, i) => i !== index) });
  }

  function addSocial() {
    onChange({ ...draft, socialLinks: [...socialLinks, { name: "New link", href: "https://" }] });
  }

  return (
    <div className="bg-black px-6 py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 lg:flex-row lg:justify-between">
        <EditableInput
          value={draft.copyrightText}
          onChange={(value) => updateField("copyrightText", value)}
          className="w-full text-center text-sm text-white/45 lg:w-auto lg:text-left"
        />

        <div className="flex flex-wrap items-center justify-center gap-3">
          {socialLinks.map((social, index) => (
            <div
              key={index}
              className="group relative flex flex-col items-center gap-1 rounded-xl border border-white/10 px-3 py-2"
            >
              <RemoveButton onClick={() => removeSocial(index)} label={`Remove ${social.name}`} />
              <SocialIcon name={social.name} />
              <EditableInput
                value={social.name}
                onChange={(value) => updateSocial(index, "name", value)}
                className="w-20 text-center text-[10px] text-white/60"
              />
              <EditableInput
                value={social.href}
                onChange={(value) => updateSocial(index, "href", value)}
                className="w-28 text-center text-[9px] text-white/30"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addSocial}
            aria-label="Add social link"
            className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/20 text-white/40 transition hover:border-white/50 hover:text-white/80"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              add
            </span>
          </button>
        </div>

        <div className="text-center">
          <EditableInput
            value={draft.aboutLabel}
            onChange={(value) => updateField("aboutLabel", value)}
            className="block text-center text-sm text-white/45"
          />
          <EditableInput
            value={draft.aboutTooltip}
            onChange={(value) => updateField("aboutTooltip", value)}
            className="mt-1 block text-center text-xs text-white/30"
          />
        </div>
      </div>
    </div>
  );
}

export default function MarketingContentManager() {
  const [tab, setTab] = useState("homepage");
  const [draftByKey, setDraftByKey] = useState(SITE_CONTENT_DEFAULTS);
  const [savedByKey, setSavedByKey] = useState(SITE_CONTENT_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function load() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/platformadmin/content", { headers: await authHeaders() });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load site content.");
      }

      setDraftByKey(result.content);
      setSavedByKey(result.content);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirtyKeys = Object.keys(draftByKey).filter((key) => !isSameContent(draftByKey[key], savedByKey[key]));

  function updateSection(key, nextContent) {
    setJustSaved(false);
    setDraftByKey((current) => ({ ...current, [key]: nextContent }));
  }

  function toggleHidden(key) {
    updateSection(key, { ...draftByKey[key], hidden: !draftByKey[key].hidden });
  }

  async function handleSaveAll() {
    setIsSaving(true);
    setError("");

    try {
      const headers = await authHeaders();

      for (const key of dirtyKeys) {
        const response = await fetch("/api/platformadmin/content", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ contentKey: key, content: draftByKey[key] }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Could not save "${key}".`);
        }
      }

      setSavedByKey(draftByKey);
      setJustSaved(true);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleDiscardAll() {
    setJustSaved(false);
    setDraftByKey(savedByKey);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-[#52627a]">
        Loading marketing site preview...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/60 bg-white/25 px-5 py-3 shadow-[0_20px_60px_rgba(13,30,76,0.15)] backdrop-blur-xl">
        <div className="inline-flex rounded-full border border-white/60 bg-white/30 p-1">
          <button
            type="button"
            onClick={() => setTab("homepage")}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${
              tab === "homepage" ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
            }`}
          >
            Homepage
          </button>
          <button
            type="button"
            onClick={() => setTab("pricing")}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${
              tab === "pricing" ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
            }`}
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => setTab("testimonials")}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${
              tab === "testimonials" ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"
            }`}
          >
            Testimonials
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {tab === "testimonials" ? null : (
            <>
              {error ? <span className="text-xs font-bold text-red-600">{error}</span> : null}
              {!error && justSaved && !dirtyKeys.length ? (
                <span className="text-xs font-bold text-emerald-600">Saved — live on the site.</span>
              ) : null}
              {dirtyKeys.length ? (
                <>
                  <span className="text-xs font-bold text-[#52627a]">
                    {dirtyKeys.length} section{dirtyKeys.length > 1 ? "s" : ""} changed
                  </span>
                  <button
                    type="button"
                    onClick={handleDiscardAll}
                    className="rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-bold text-[#52627a] transition hover:bg-white/70"
                  >
                    Discard
                  </button>
                </>
              ) : null}
            </>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={tab === "testimonials" || !dirtyKeys.length || isSaving}
            className={`rounded-full bg-[#0a2a66] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-50 ${
              tab === "testimonials" ? "hidden" : ""
            }`}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-[28px] border border-white/60 shadow-[0_20px_60px_rgba(13,30,76,0.15)]">
        {tab === "testimonials" ? (
          <TestimonialsReviewQueue />
        ) : tab === "homepage" ? (
          <div>
            <SectionFrame hidden={draftByKey.nav.hidden} onToggleHidden={() => toggleHidden("nav")}>
              <NavPreview draft={draftByKey.nav} onChange={(next) => updateSection("nav", next)} />
            </SectionFrame>
            <SectionFrame hidden={draftByKey.hero.hidden} onToggleHidden={() => toggleHidden("hero")}>
              <HeroPreview draft={draftByKey.hero} onChange={(next) => updateSection("hero", next)} />
            </SectionFrame>
            <SectionFrame hidden={draftByKey.features.hidden} onToggleHidden={() => toggleHidden("features")}>
              <FeaturesPreview draft={draftByKey.features} onChange={(next) => updateSection("features", next)} />
            </SectionFrame>
            <SectionFrame
              hidden={draftByKey.testimonials_section.hidden}
              onToggleHidden={() => toggleHidden("testimonials_section")}
            >
              <TestimonialsPreview
                draft={draftByKey.testimonials_section}
                onChange={(next) => updateSection("testimonials_section", next)}
              />
            </SectionFrame>
            <SectionFrame hidden={draftByKey.footer.hidden} onToggleHidden={() => toggleHidden("footer")}>
              <FooterPreview draft={draftByKey.footer} onChange={(next) => updateSection("footer", next)} />
            </SectionFrame>
          </div>
        ) : (
          <div>
            <SectionFrame hidden={draftByKey.nav.hidden} onToggleHidden={() => toggleHidden("nav")}>
              <NavPreview draft={draftByKey.nav} onChange={(next) => updateSection("nav", next)} />
            </SectionFrame>
            <SectionFrame hidden={draftByKey.pricing.hidden} onToggleHidden={() => toggleHidden("pricing")}>
              <PricingPreview draft={draftByKey.pricing} onChange={(next) => updateSection("pricing", next)} />
            </SectionFrame>
          </div>
        )}
      </div>
    </div>
  );
}
