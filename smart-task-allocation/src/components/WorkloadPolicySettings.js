"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function WorkloadPolicySettings() {
  const [workloadTaskLimit, setWorkloadTaskLimit] = useState("8");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch("/api/organization-workload-policy", { headers: await authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the workload policy.");
        setWorkloadTaskLimit(String(result.workloadTaskLimit ?? 8));
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/organization-workload-policy", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ workloadTaskLimit: Number(workloadTaskLimit) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the workload policy.");
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <p className="text-lg font-black text-[#0D1E4C]">Workload Policy</p>
      <p className="mt-1 text-xs font-semibold text-[#64748B]">
        Maximum active tasks a person can carry at once — Insights&apos; Workload Distribution chart marks anyone
        past this as Overloaded.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm font-medium text-[#94a3b8]">Loading…</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-[#94a3b8]">Active task limit</span>
            <input
              type="number"
              min="1"
              value={workloadTaskLimit}
              onChange={(event) => setWorkloadTaskLimit(event.target.value)}
              className="w-32 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#0D1E4C] outline-none focus:border-[#2563EB]"
            />
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-full bg-[#0D1E4C] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>

          {saved ? <span className="text-xs font-bold text-emerald-600">Saved</span> : null}
        </div>
      )}

      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
