"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import OrganizationCanvas from "@/components/OrganizationCanvas";
import EmployeeProfileCard from "@/components/EmployeeProfileCard";

// Same org chart User Admin edits, locked to view-only for managers — no
// setup/create-organization flow here since only User Admin ever creates one.
export default function ManagerOrganizationView() {
  const [organization, setOrganization] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [skillFilter, setSkillFilter] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const headers = { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
        const [response, employeeResponse] = await Promise.all([
          fetch("/api/my-organization", { headers }),
          fetch("/api/employees", { headers }),
        ]);
        const [result, employeeResult] = await Promise.all([response.json(), employeeResponse.json()]);
        if (!response.ok) throw new Error(result.error || "Could not load organization.");
        if (!employeeResponse.ok) throw new Error(employeeResult.error || "Could not load employees.");
        setOrganization(result.organization ?? null);
        setEmployees(employeeResult.employees ?? []);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filteredEmployees = useMemo(() => {
    const skill = skillFilter.trim().toLowerCase();
    const start = availabilityStart ? new Date(availabilityStart) : null;
    const end = availabilityEnd ? new Date(availabilityEnd) : null;
    return employees.filter((employee) => {
      const skills = [
        ...(employee.skills ?? []),
        ...(employee.skill_details ?? []).map((item) => item.name),
      ].map((item) => String(item).toLowerCase());
      if (skill && !skills.some((item) => item.includes(skill))) return false;
      if (start && end) {
        const rows = employee.availabilities?.length ? employee.availabilities : employee.availability ? [employee.availability] : [];
        if (!rows.some((row) => String(row.status).toLowerCase() === "available" && new Date(row.availability_start) <= start && new Date(row.availability_end) >= end)) return false;
      }
      return true;
    });
  }, [employees, skillFilter, availabilityStart, availabilityEnd]);

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
        <>
          <div className="mx-4 mt-3 shrink-0 rounded-2xl border border-white/60 bg-white/55 p-4">
            <div className="flex flex-wrap gap-2">
              <input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} placeholder="Filter by required skill" className="h-10 min-w-52 flex-1 rounded-full border border-[#C7DDEB] px-4 text-sm outline-none" />
              <input type="datetime-local" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} aria-label="Availability start" className="h-10 rounded-full border border-[#C7DDEB] px-3 text-sm" />
              <input type="datetime-local" value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} aria-label="Availability end" className="h-10 rounded-full border border-[#C7DDEB] px-3 text-sm" />
              <button type="button" onClick={() => { setSkillFilter(""); setAvailabilityStart(""); setAvailabilityEnd(""); }} className="rounded-full border border-[#C7DDEB] px-4 text-sm font-bold">Clear</button>
            </div>
            <p className="mt-2 text-xs font-bold text-[#64748B]">{filteredEmployees.length} matching employee{filteredEmployees.length === 1 ? "" : "s"}</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {filteredEmployees.map((employee) => <button type="button" key={employee.user_id} onClick={() => setSelectedAccount(employee)} className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-bold shadow-sm">{employee.full_name || employee.username}</button>)}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <OrganizationCanvas organization={organization} onAccountClick={(account) => setSelectedAccount(employees.find((employee) => employee.user_id === account.user_id) || account)} readOnly />
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-sm font-semibold text-[#52627a]">
          Your organization hasn&apos;t been set up yet.
        </div>
      )}

      {selectedAccount ? (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedAccount(null)}>
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setSelectedAccount(null)} aria-label="Close employee details" className="absolute -right-3 -top-3 z-10 h-9 w-9 rounded-full bg-[#0D1E4C] font-bold text-white">×</button>
            <EmployeeProfileCard employee={selectedAccount} defaultExpanded />
          </div>
        </div>
      ) : null}
    </div>
  );
}
