"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const ACTION_VERBS = {
  approve: "approved",
  suspend: "suspended",
  activate: "activated",
  promote: "promoted",
  demote: "demoted",
  delete: "deleted",
};

const ACTION_TONES = {
  suspend: "text-[#B42318]",
  delete: "text-[#B42318]",
  demote: "text-[#B42318]",
  activate: "text-[#05603A]",
  approve: "text-[#05603A]",
  promote: "text-[#1D4ED8]",
};

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

export default function AccountActivityLog() {
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setError("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/account-activity", { headers: await authHeaders() });
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

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md">
      <h2 className="shrink-0 px-5 py-3 text-lg font-black text-[#0D1E4C]">
        Activity Logs
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading activity...</p> : null}

        {!isLoading && !error && !activity.length ? (
          <p className="rounded-2xl border border-dashed border-white/60 px-6 py-8 text-center text-sm font-medium text-[#0D1E4C]/60">
            No account activity yet.
          </p>
        ) : (
          <div className="divide-y divide-white/50">
            {activity.map((entry) => (
              <div key={entry.activityId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                <span className="text-sm font-bold text-[#0B1B32]">{entry.actorName}</span>
                <span className={`text-sm font-semibold ${ACTION_TONES[entry.action] ?? "text-[#52627a]"}`}>
                  {ACTION_VERBS[entry.action] ?? entry.action}
                </span>
                <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
                  {entry.targetLabel ?? "an account"}
                </span>
                <span className="ml-auto shrink-0 text-xs font-medium text-[#64748B]">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
