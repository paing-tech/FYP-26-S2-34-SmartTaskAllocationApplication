"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

function formatTimestamp(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function AppealAvatar({ appeal }) {
  const name = appeal.fullName || appeal.username || appeal.email || "Account";

  if (appeal.profilePictureUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={appeal.profilePictureUrl} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C7DDEB] text-[#0D1E4C]">
      <svg className="h-3/5 w-3/5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    </div>
  );
}

function AppealRow({ appeal, busyAction, onReactivate, onDismiss }) {
  const isBusy = Boolean(busyAction);

  return (
    <li className="space-y-2 rounded-2xl bg-white/40 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AppealAvatar appeal={appeal} />
          <p className="min-w-0 truncate text-sm font-bold text-[#0B1B32]">
            {appeal.fullName || appeal.username || appeal.email}
          </p>
        </div>
        <span className="shrink-0 pr-2 text-xs font-semibold text-[#64748B]">{formatTimestamp(appeal.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-xs font-medium text-[#475569]">{appeal.reason}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={onReactivate}
          className="rounded-full bg-[#0D1E4C] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "reactivate" ? "Reactivating..." : "Reactivate"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onDismiss}
          className="rounded-full px-3 py-1.5 text-xs font-bold text-[#B42318] transition hover:bg-[#FEE4E2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "dismiss" ? "Dismissing..." : "Dismiss"}
        </button>
      </div>
    </li>
  );
}

export default function AccountAppeals({ onAccountsChanged }) {
  const [appeals, setAppeals] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function loadAppeals() {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/account-appeal", { headers: await authHeaders() });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load account appeals.");
      }

      setAppeals(result.appeals ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadAppeals, 0);
    return () => clearTimeout(timeout);
  }, []);

  async function runAction(appealId, action) {
    if (busy) return;
    setBusy({ appealId, action });
    setError("");

    try {
      const response = await fetch("/api/account-appeal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ appealId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update appeal.");

      await loadAppeals();
      onAccountsChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md">
      <h2 className="shrink-0 px-5 py-3 text-lg font-black text-[#0D1E4C]">
        Account Appeals
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {error ? <p className="mb-2 text-sm font-medium text-red-600">{error}</p> : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading appeals...</p> : null}

        {!isLoading && !error && !appeals.length ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">No pending appeals.</p>
        ) : null}

        <ul className="space-y-2">
          {appeals.map((appeal) => (
            <AppealRow
              key={appeal.appealId}
              appeal={appeal}
              busyAction={busy?.appealId === appeal.appealId ? busy.action : null}
              onReactivate={() => runAction(appeal.appealId, "reactivate")}
              onDismiss={() => runAction(appeal.appealId, "dismiss")}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
