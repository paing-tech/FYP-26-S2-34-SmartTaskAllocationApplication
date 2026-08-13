"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PLAN_RANK = { starter: 0, pro: 1, team: 2 };
const PLAN_LABEL = { starter: "Starter", pro: "Pro", team: "Team" };
const PLAN_COLOR = { starter: "#2563EB", pro: "#7C3AED", team: "#CA8A04" };

const TYPE_TONES = {
  suspended: "#B42318",
  activated: "#05603A",
};

const FILTER_OPTIONS = [
  { type: "joined", label: "Joined", color: "#0D1E4C" },
  { type: "activated", label: "Activated", color: "#05603A" },
  { type: "suspended", label: "Suspended", color: "#B42318" },
  { type: "plan_change", label: "Plan Change", color: "#7C3AED" },
];

const MAX_EMAILS_SHOWN = 4;

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function EmailList({ emails }) {
  const shown = emails.slice(0, MAX_EMAILS_SHOWN);
  const remaining = emails.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((email) => (
        <span key={email} className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
          {email}
        </span>
      ))}
      {remaining > 0 ? <span className="text-xs font-semibold text-[#64748B]">+{remaining} more</span> : null}
    </span>
  );
}

function EntryBody({ entry }) {
  if (entry.type === "plan_change") {
    const [fromPlan, toPlan] = (entry.detail ?? "").split("->");
    const verb = (PLAN_RANK[toPlan] ?? 0) > (PLAN_RANK[fromPlan] ?? 0) ? "upgraded" : "switched";
    return (
      <>
        <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
          {entry.organizationName ?? "An organization"}
        </span>
        <span className="text-sm font-semibold text-[#52627a]">{verb} from</span>
        <span className="text-sm font-black" style={{ color: PLAN_COLOR[fromPlan] }}>
          {PLAN_LABEL[fromPlan] ?? fromPlan}
        </span>
        <span className="text-sm font-semibold text-[#52627a]">to</span>
        <span className="text-sm font-black" style={{ color: PLAN_COLOR[toPlan] }}>
          {PLAN_LABEL[toPlan] ?? toPlan}
        </span>
      </>
    );
  }

  const verb = entry.type === "joined" ? "joined" : entry.type === "suspended" ? "was suspended" : "was activated";

  return (
    <>
      <EmailList emails={entry.emails} />
      <span className="text-sm font-semibold" style={{ color: TYPE_TONES[entry.type] ?? "#52627a" }}>
        {verb}
      </span>
    </>
  );
}

export default function PlatformAdminActivityLog() {
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterMenuRef = useRef(null);

  useEffect(() => {
    if (!isFilterOpen) return undefined;

    function handleOutsideClick(event) {
      if (!filterMenuRef.current?.contains(event.target)) setIsFilterOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isFilterOpen]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setError("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/platformadmin/activity-log", { headers: await authHeaders() });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load activity logs.");
        }

        setActivity(result.activity ?? []);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredActivity = activity.filter((entry) => {
    if (selectedTypes.length && !selectedTypes.includes(entry.type)) return false;
    if (normalizedSearch) {
      const searchable = `${entry.emails.join(" ")} ${entry.organizationName ?? ""} ${entry.type} ${entry.detail ?? ""}`;
      return searchable.toLowerCase().includes(normalizedSearch);
    }
    return true;
  });

  function toggleType(type) {
    setSelectedTypes((current) => (current.includes(type) ? current.filter((value) => value !== type) : [...current, type]));
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <h2 className="text-lg font-black text-[#0D1E4C]">Activity Logs</h2>

        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <span
              className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#64748B]"
              aria-hidden="true"
            >
              search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search activity"
              className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
          </div>

          <div ref={filterMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsFilterOpen((open) => !open)}
              aria-label="Filter activity"
              aria-expanded={isFilterOpen}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/70 shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl transition hover:bg-white/60 ${
                isFilterOpen || selectedTypes.length ? "bg-[#0D1E4C] text-white" : "bg-white/35 text-[#0D1E4C]"
              }`}
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                filter_list
              </span>
              {selectedTypes.length ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-black text-white">
                  {selectedTypes.length}
                </span>
              ) : null}
            </button>

            {isFilterOpen ? (
              <div className="absolute right-0 top-6 z-40 w-44 rounded-[20px] border border-white/70 bg-white/60 p-2 shadow-[0_20px_55px_rgba(13,30,76,0.22)] backdrop-blur-3xl">
                <div className="space-y-0.5">
                  {FILTER_OPTIONS.map((option) => {
                    const checked = selectedTypes.includes(option.type);
                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => toggleType(option.type)}
                        className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1 text-left text-xs font-semibold transition hover:bg-white/70"
                        style={{ color: option.color }}
                      >
                        {checked ? (
                          <span className="material-symbols-outlined text-[16px]" style={{ color: option.color }} aria-hidden="true">
                            check_circle
                          </span>
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border bg-white/40" style={{ borderColor: option.color }} />
                        )}
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {selectedTypes.length ? (
                  <button
                    type="button"
                    onClick={() => setSelectedTypes([])}
                    className="mt-2 w-full rounded-full px-2 py-1.5 text-[11px] font-bold text-[#64748B] transition hover:bg-white/70 hover:text-[#0D1E4C]"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        ) : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading activity...</p> : null}

        {!isLoading && !error && !filteredActivity.length ? (
          <p className="rounded-2xl border border-dashed border-white/60 px-6 py-8 text-center text-sm font-medium text-[#0D1E4C]/60">
            {activity.length ? "No matching activity." : "No platform activity yet."}
          </p>
        ) : (
          <div className="divide-y divide-white/50">
            {filteredActivity.map((entry) => (
              <div key={entry.activityId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                <EntryBody entry={entry} />
                <span className="ml-auto shrink-0 text-xs font-medium text-[#64748B]">{formatDateTime(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
