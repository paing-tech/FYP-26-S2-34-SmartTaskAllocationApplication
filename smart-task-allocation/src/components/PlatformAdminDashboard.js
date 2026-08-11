"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const GRID_TEMPLATE =
  "minmax(210px,1.5fr) minmax(130px,1fr) minmax(170px,1.2fr) minmax(170px,1.2fr) minmax(120px,0.8fr) minmax(100px,0.7fr) minmax(90px,0.5fr)";

const STATUS_TONES = {
  Suspended: "bg-[#FEE4E2] text-[#B42318]",
};

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex justify-self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        STATUS_TONES[status] ?? "bg-[#D1FADF] text-[#05603A]"
      }`}
    >
      {status}
    </span>
  );
}

function MultiSelectFilter({ label, options, selected, setSelected }) {
  const [isOpen, setIsOpen] = useState(false);

  function toggle(value) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
          selected.length
            ? "border-[#0D1E4C] bg-white/60 text-[#0A2540]"
            : "border-white/60 bg-white/40 text-[#0A2540] hover:bg-white/60"
        }`}
      >
        {label}
        {selected.length ? (
          <span className="min-w-5 rounded-full bg-[#0D1E4C] px-1.5 text-center text-xs font-bold text-white">
            {selected.length}
          </span>
        ) : null}
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen ? (
        <>
          <button className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} aria-label={`Close ${label} filter`} />
          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl border border-white/60 bg-white/85 p-2 shadow-[0_20px_50px_rgba(13,30,76,0.2)] backdrop-blur-xl">
            <div className="max-h-60 overflow-y-auto">
              {options.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#0B1B32] hover:bg-white/70"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    className="h-4 w-4 accent-[#0D1E4C]"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))}
            </div>
            {selected.length ? (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-[#64748B] hover:bg-white/70"
              >
                Clear selection
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function csvValue(value) {
  const stringValue = String(value ?? "");
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export default function PlatformAdminDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState([]);
  const [organizationFilter, setOrganizationFilter] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAccounts() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platformadmin/accounts", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load platform accounts.");
      setAccounts(result.accounts ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadAccounts, 0);
    return () => clearTimeout(timeout);
  }, []);

  const roleOptions = useMemo(
    () => [...new Set(accounts.map((account) => account.role?.role_name ?? "Unassigned"))].sort(),
    [accounts],
  );
  const organizationOptions = useMemo(
    () => [...new Set(accounts.map((account) => account.organization?.organization_name ?? "No organization"))].sort(),
    [accounts],
  );

  const filteredBeforeStatus = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const role = account.role?.role_name ?? "Unassigned";
      const organization = account.organization?.organization_name ?? "No organization";
      const searchable = `${account.email} ${account.username} ${account.job_title ?? ""} ${organization} ${role}`;
      if (query && !searchable.toLowerCase().includes(query)) return false;
      if (roleFilter.length && !roleFilter.includes(role)) return false;
      if (organizationFilter.length && !organizationFilter.includes(organization)) return false;
      return true;
    });
  }, [accounts, organizationFilter, roleFilter, search]);

  const statusCounts = useMemo(() => {
    const counts = { All: filteredBeforeStatus.length, Active: 0, Suspended: 0 };
    for (const account of filteredBeforeStatus) {
      if (account.account_status in counts) counts[account.account_status] += 1;
    }
    return counts;
  }, [filteredBeforeStatus]);

  const visibleAccounts = useMemo(
    () =>
      statusFilter === "All"
        ? filteredBeforeStatus
        : filteredBeforeStatus.filter((account) => account.account_status === statusFilter),
    [filteredBeforeStatus, statusFilter],
  );

  function exportData() {
    const rows = visibleAccounts.map((account) => [
      account.email,
      account.username,
      account.job_title,
      account.organization?.organization_name,
      account.role?.role_name,
      account.account_status,
    ]);
    const csv = ["Email,Username,Job Title,Organization,Role,Status", ...rows.map((row) => row.map(csvValue).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `platform-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {["All", "Active", "Suspended"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                statusFilter === status
                  ? "border-[#0D1E4C] bg-[#0D1E4C] text-white"
                  : "border-white/60 bg-white/40 text-[#0A2540] hover:bg-white/60"
              }`}
            >
              {status}
              <span className={`min-w-5 rounded-full px-1.5 text-center text-xs font-bold ${statusFilter === status ? "bg-white/20" : "bg-[#0D1E4C]/8"}`}>
                {statusCounts[status]}
              </span>
            </button>
          ))}

          <MultiSelectFilter label="Role" options={roleOptions} selected={roleFilter} setSelected={setRoleFilter} />
          <MultiSelectFilter
            label="Organization"
            options={organizationOptions}
            selected={organizationFilter}
            setSelected={setOrganizationFilter}
          />

          <button
            type="button"
            onClick={loadAccounts}
            disabled={isLoading}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#0A2540] disabled:opacity-50"
          >
            <svg className={`h-4.5 w-4.5 ${isLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative w-72">
              <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]" aria-hidden="true">search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users"
                className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
              />
            </div>
            <button
              type="button"
              onClick={exportData}
              className="flex h-12 items-center gap-2 rounded-full border border-[#C7DDEB] bg-white pl-4 pr-5 text-sm font-bold text-[#0D1E4C] shadow-sm transition hover:bg-[#F1F5F9]"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">download</span>
              Export data
            </button>
          </div>
        </div>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}

        <div className="overflow-x-auto pt-3">
          <div className="grid min-w-225 gap-x-2 px-4 text-xs font-bold uppercase tracking-wide text-[#64748B]" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
            <span>Email</span>
            <span>Username</span>
            <span>Job Title</span>
            <span>Organization</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
        </div>
      </div>

      <div className="mt-3 max-h-[62%] min-h-0 space-y-2 overflow-x-auto overflow-y-auto pr-1">
        {visibleAccounts.map((account) => (
          <div
            key={account.user_id}
            className="grid min-w-225 items-center gap-x-2 rounded-2xl bg-white/40 px-4 py-3 backdrop-blur-md"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <a href={`mailto:${account.email}`} className="truncate text-sm font-bold text-[#0B1B32] hover:underline">{account.email}</a>
            <span className="truncate text-sm text-[#475569]">@{account.username}</span>
            <span className="truncate text-sm text-[#475569]">{account.job_title || "—"}</span>
            <span className="truncate text-sm text-[#475569]">{account.organization?.organization_name ?? "No organization"}</span>
            <span className="truncate text-sm text-[#475569]">{account.role?.role_name ?? "—"}</span>
            <StatusBadge status={account.account_status} />
            <span aria-label="No actions available" />
          </div>
        ))}

        {!visibleAccounts.length && !isLoading ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-[#94a3b8]">No accounts match your filters.</p>
        ) : null}
      </div>
    </div>
  );
}
