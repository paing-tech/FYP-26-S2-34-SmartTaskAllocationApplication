"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { AvatarCircle } from "@/components/WorkspaceBoard";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function PersonGrid({ people, onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {people.map((person) => (
        <button
          key={person.userId}
          type="button"
          onClick={() => onSelect(person)}
          className="flex flex-col items-center gap-1.5 rounded-2xl p-1 text-center transition hover:scale-110"
        >
          <AvatarCircle
            employee={{ full_name: person.fullName, avatar_url: person.avatarUrl }}
            sizeClass="h-20 w-16"
            className="text-sm"
          />
          <span className="line-clamp-2 text-xs font-bold text-[#0D1E4C]">{person.fullName}</span>
        </button>
      ))}
    </div>
  );
}

// Opens below the trigger button — two sections (Managers, Employees), each
// people rendered three-per-row as a stacked avatar+name card. No selection
// state is kept here; picking someone just hands the person back to the
// caller via onSelect and lets WorkforceOverview own what "selected" means.
export default function WorkforcePersonPicker({ onSelect, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/useradmin/workforce-directory", { headers: await authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the directory.");
        if (!cancelled) setData(result);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <button type="button" className="fixed inset-0 z-10" onClick={onClose} aria-label="Close person picker" />
      <div className="absolute right-0 top-full z-20 mt-2 max-h-185 w-102 overflow-y-auto rounded-3xl border border-white/60 bg-slate-100 p-6 shadow-[0_20px_50px_rgba(13,30,76,0.2)] backdrop-blur-xl">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!error && !data ? <p className="text-sm text-[#52627a]">Loading...</p> : null}

        {!error && data ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#94a3b8]">Managers</p>
              {data.managers.length ? (
                <PersonGrid people={data.managers} onSelect={onSelect} />
              ) : (
                <p className="text-xs font-semibold text-[#94a3b8]">No managers yet.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#94a3b8]">Employees</p>
              {data.employees.length ? (
                <PersonGrid people={data.employees} onSelect={onSelect} />
              ) : (
                <p className="text-xs font-semibold text-[#94a3b8]">No employees yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
