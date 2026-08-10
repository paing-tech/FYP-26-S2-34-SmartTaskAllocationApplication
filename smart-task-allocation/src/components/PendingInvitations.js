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

function InvitationRow({ invitation, busyAction, onApprove, onResend, onCancel }) {
  const isBusy = Boolean(busyAction);

  return (
    <li className="space-y-2 rounded-2xl bg-white/40 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-bold text-[#0B1B32]">{invitation.email}</p>
        <span className="shrink-0 pr-2 text-xs font-semibold text-[#64748B]">{invitation.roleName ?? "No role"}</span>
      </div>
      <p className="truncate text-xs font-medium text-[#64748B]">
        Invited by {invitation.invitedByName ?? "Unknown"} on {formatTimestamp(invitation.createdAt)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={onApprove}
          className="rounded-full bg-[#0D1E4C] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "approve" ? "Approving..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-xs font-bold text-[#B42318] transition hover:bg-[#FEE4E2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "cancel" ? "Cancelling..." : "Cancel"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onResend}
          className="ml-auto rounded-full border border-[#C7DDEB] px-3 py-1.5 text-xs font-bold text-[#0D1E4C] transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "resend" ? "Resending..." : "Resend"}
        </button>
      </div>
    </li>
  );
}

export default function PendingInvitations({ onAccountsChanged }) {
  const [invitations, setInvitations] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function loadInvitations() {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/pending-invitations", { headers: await authHeaders() });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load pending invitations.");
      }

      setInvitations(result.invitations ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadInvitations, 0);
    return () => clearTimeout(timeout);
  }, []);

  async function runAction(userId, action, run) {
    if (busy) return;
    setBusy({ userId, action });
    setError("");

    try {
      await run();
      await loadInvitations();
      onAccountsChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(null);
    }
  }

  function approveInvitation(invitation) {
    return runAction(invitation.userId, "approve", async () => {
      const response = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          userId: invitation.userId,
          accountStatus: "Active",
          action: "approve",
          targetLabel: invitation.email,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not approve invitation.");
    });
  }

  function resendInvitation(invitation) {
    return runAction(invitation.userId, "resend", async () => {
      const response = await fetch("/api/pending-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ userId: invitation.userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not resend invitation.");
    });
  }

  function cancelInvitation(invitation) {
    return runAction(invitation.userId, "cancel", async () => {
      const params = new URLSearchParams({
        userId: invitation.userId,
        action: "delete",
        targetLabel: invitation.email,
      });
      const response = await fetch(`/api/accounts?${params.toString()}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not cancel invitation.");
    });
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md">
      <h2 className="shrink-0 border-b border-white/60 px-5 py-3 text-sm font-black text-[#0D1E4C]">
        Pending Invitations
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {error ? <p className="mb-2 text-sm font-medium text-red-600">{error}</p> : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading invitations...</p> : null}

        {!isLoading && !error && !invitations.length ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">No pending invitations.</p>
        ) : null}

        <ul className="space-y-2">
          {invitations.map((invitation) => (
            <InvitationRow
              key={invitation.userId}
              invitation={invitation}
              busyAction={busy?.userId === invitation.userId ? busy.action : null}
              onApprove={() => approveInvitation(invitation)}
              onResend={() => resendInvitation(invitation)}
              onCancel={() => cancelInvitation(invitation)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
