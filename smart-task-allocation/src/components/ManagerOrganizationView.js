"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import OrganizationCanvas from "@/components/OrganizationCanvas";
import ProfileDetailCard from "@/components/ProfileDetailCard";

// Same org chart User Admin edits, locked to view-only for managers — no
// setup/create-organization flow here since only User Admin ever creates one.
export default function ManagerOrganizationView() {
  const [organization, setOrganization] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const response = await fetch("/api/my-organization", {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not load organization.");
        }
        setOrganization(result.organization ?? null);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      {error ? (
        <p className="mx-6 mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex h-full items-center justify-center text-sm font-semibold text-[#52627a]">
          Loading organization...
        </div>
      ) : organization ? (
        <div className="min-h-0 flex-1">
          <OrganizationCanvas organization={organization} onAccountClick={setSelectedAccount} readOnly />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm font-semibold text-[#52627a]">
          Your organization hasn&apos;t been set up yet.
        </div>
      )}

      {selectedAccount ? (
        <ProfileDetailCard userId={selectedAccount.user_id} viewOnly onClose={() => setSelectedAccount(null)} />
      ) : null}
    </div>
  );
}
