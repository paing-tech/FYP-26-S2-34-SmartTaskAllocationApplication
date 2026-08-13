"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import Portal from "@/components/Portal";
import PlatformAdminActivityLog from "@/components/PlatformAdminActivityLog";
import AssignmentSelectors from "@/components/AssignmentSelectors";
import { SUPPORT_INQUIRY_SUBJECTS } from "@/lib/supportInquiry";
import TicketDetailModal from "@/components/TicketDetailModal";

function formatTicketNumber(value) {
  return value ? `#${String(value).padStart(5, "0")}` : "#—";
}

const TICKET_STATUS_TONES = {
  open: "bg-[#DBEAFE] text-[#1D4ED8]",
  resolved: "bg-[#DCFCE7] text-[#166534]",
};

function TicketStatusBadge({ status }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold capitalize ${
        TICKET_STATUS_TONES[status] ?? "bg-slate-100 text-[#64748B]"
      }`}
    >
      {status}
    </span>
  );
}

// Lighter than the font's default weight (400) so the search icon reads as
// less heavy next to the input text — same treatment AccountsPageContent
// uses so both dashboards read as the same visual language.
const ICON_WEIGHT = { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" };
const BOLD_ICON_WEIGHT = { fontVariationSettings: "'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 20" };

const GRID_TEMPLATE =
  "minmax(210px,1.5fr) minmax(130px,1fr) minmax(170px,1.2fr) minmax(170px,1.2fr) minmax(120px,0.8fr) minmax(100px,0.7fr) minmax(110px,0.7fr) minmax(90px,0.5fr)";

const STATUS_TONES = {
  Suspended: "bg-[#FEE4E2] text-[#B42318]",
  Unassigned: "bg-[#E2E8F0] text-[#64748B]",
};

const SELECTED_STATUS_TONES = {
  All: "border-[#0D1E4C] bg-[#0D1E4C] text-white",
  Active: "border-emerald-700 bg-emerald-700 text-white",
  Suspended: "border-red-700 bg-red-700 text-white",
  Unassigned: "border-slate-700 bg-slate-700 text-white",
};

const PLAN_TIERS = ["starter", "pro", "team"];

// Blue/purple/gold step-up in perceived value from tier to tier — plain
// colored text when idle, filled color only once a tier is selected.
const PLAN_TIER_TONES = {
  starter: {
    label: "Starter",
    idle: "border-transparent text-[#2563EB] hover:bg-[#EFF6FF]",
    active: "border-[#2563EB] bg-[#2563EB] text-white",
  },
  pro: {
    label: "Pro",
    idle: "border-transparent text-[#7C3AED] hover:bg-[#F5F3FF]",
    active: "border-[#7C3AED] bg-[#7C3AED] text-white",
  },
  team: {
    label: "Team",
    idle: "border-transparent text-[#CA8A04] hover:bg-[#FFFBEB]",
    active: "border-[#CA8A04] bg-gradient-to-r from-[#CA8A04] to-[#EAB308] text-white",
  },
};

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function formatCreatedAt(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function AccountActionsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.5-3.2 2.3-5 5.5-5 1.1 0 2 .2 2.8.6" />
      <circle cx="17.5" cy="16.5" r="2.5" />
      <path d="M17.5 12.5v1M17.5 19.5v1M13.5 16.5h1M20.5 16.5h1M14.7 13.7l.7.7M19.6 18.6l.7.7M20.3 13.7l-.7.7M15.4 18.6l-.7.7" />
    </svg>
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
        aria-expanded={isOpen}
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
              {options.length ? (
                options.map((option) => (
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
                ))
              ) : (
                <p className="px-2 py-2 text-xs text-[#94a3b8]">No {label.toLowerCase()}s</p>
              )}
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

const IconButton = forwardRef(function IconButton({ icon, label, onClick, disabled = false }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {typeof icon === "string" ? (
        <span className="material-symbols-outlined text-[20px]" style={ICON_WEIGHT} aria-hidden="true">
          {icon}
        </span>
      ) : (
        icon
      )}
    </button>
  );
});

// Same trigger + Portal-positioned panel pattern as User Admin's account
// actions menu, rather than a centered modal — anchored to the button so it
// reads as a lightweight inline action, not an interruption.
function PlanOverrideMenu({ account, onSaved }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const buttonRef = useRef(null);
  const currentPlan = account.organization?.plan ?? "starter";

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setError("");
    setIsOpen(true);
  }

  async function choosePlan(tier) {
    if (isSaving) return;
    if (tier === currentPlan) {
      setIsOpen(false);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/platformadmin/organization-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ organizationId: account.organization_id, plan: tier }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update the plan.");
      setIsOpen(false);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative">
      <IconButton
        ref={buttonRef}
        icon="diamond"
        label={account.organization_id ? "Override plan" : "No organization to override"}
        disabled={!account.organization_id}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
      />

      {isOpen && menuPosition ? (
        <Portal>
          <div className="fixed inset-0 z-90" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-90 w-48 rounded-3xl border border-white/60 bg-white/20 backdrop-blur-sm p-2 shadow-[0_20px_50px_rgba(13,30,76,0.2)]"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
              {account.organization?.organization_name ?? "Plan"}
            </p>
            <div className="space-y-1 p-1">
              {PLAN_TIERS.map((tier) => {
                const tone = PLAN_TIER_TONES[tier];
                const isActive = tier === currentPlan;
                return (
                  <button
                    key={tier}
                    type="button"
                    disabled={isSaving}
                    onClick={() => choosePlan(tier)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive ? tone.active : tone.idle
                    }`}
                  >
                    <span>{tone.label}</span>
                    {isActive ? (
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">
                        check
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {error ? <p className="px-3 pb-1 text-xs font-medium text-red-600">{error}</p> : null}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

function SupportTicketsPanel() {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [detailTicketId, setDetailTicketId] = useState(null);
  const filterMenuRef = useRef(null);

  useEffect(() => {
    if (!isFilterOpen) return undefined;

    function handleOutsideClick(event) {
      if (!filterMenuRef.current?.contains(event.target)) setIsFilterOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isFilterOpen]);

  async function loadTickets() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/support-inquiries", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load support tickets.");
      setTickets(result.inquiries ?? []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadTickets, 0);
    return () => clearTimeout(timeout);
  }, []);

  function toggleCategory(category) {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((value) => value !== category) : [...current, category],
    );
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTickets = tickets.filter((ticket) => {
    if (selectedCategories.length && !selectedCategories.includes(ticket.subject)) return false;
    if (normalizedSearch) {
      const searchable = `${ticket.subject} ${ticket.email ?? ""} ${ticket.username ?? ""} ${ticket.message} ${formatTicketNumber(ticket.ticketNumber)}`;
      return searchable.toLowerCase().includes(normalizedSearch);
    }
    return true;
  });

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-[#0D1E4C]">
          Support Tickets
          <span className="rounded-full bg-[#0D1E4C] px-2 py-0.5 text-xs font-bold text-white">{tickets.length}</span>
        </h2>

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
              placeholder="Search tickets"
              className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
          </div>

          <div ref={filterMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsFilterOpen((open) => !open)}
              aria-label="Filter tickets"
              aria-expanded={isFilterOpen}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/70 shadow-[0_12px_30px_rgba(13,30,76,0.16)] backdrop-blur-xl transition hover:bg-white/60 ${
                isFilterOpen || selectedCategories.length ? "bg-[#0D1E4C] text-white" : "bg-white/35 text-[#0D1E4C]"
              }`}
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                filter_list
              </span>
              {selectedCategories.length ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-black text-white">
                  {selectedCategories.length}
                </span>
              ) : null}
            </button>

            {isFilterOpen ? (
              <div className="absolute right-0 top-6 z-40 w-48 rounded-[20px] border border-white/70 bg-white/60 p-2 shadow-[0_20px_55px_rgba(13,30,76,0.22)] backdrop-blur-3xl">
                <div className="space-y-0.5">
                  {SUPPORT_INQUIRY_SUBJECTS.map((category) => {
                    const checked = selectedCategories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1 text-left text-xs font-semibold text-[#0D1E4C] transition hover:bg-white/70"
                      >
                        {checked ? (
                          <span className="material-symbols-outlined text-[16px] text-[#0D1E4C]" aria-hidden="true">
                            check_circle
                          </span>
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-[#0D1E4C] bg-white/40" />
                        )}
                        {category}
                      </button>
                    );
                  })}
                </div>

                {selectedCategories.length ? (
                  <button
                    type="button"
                    onClick={() => setSelectedCategories([])}
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
        {error ? <p className="py-4 text-center text-sm font-semibold text-red-600">{error}</p> : null}
        {isLoading ? <p className="py-4 text-center text-sm font-semibold text-[#94a3b8]">Loading tickets...</p> : null}
        {!isLoading && !error && !filteredTickets.length ? (
          <p className="py-6 text-center text-sm font-semibold text-[#94a3b8]">
            {tickets.length ? "No matching tickets." : "No open support tickets."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredTickets.map((ticket) => (
              <li
                key={ticket.inquiryId}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-white/40 px-4 py-2.5 backdrop-blur-md"
              >
                <span className="text-xs font-bold text-[#94a3b8]">{formatTicketNumber(ticket.ticketNumber)}</span>
                <span className="text-sm font-bold text-[#0B1B32]">{ticket.email || ticket.username || "Unknown user"}</span>
                <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-2 py-0.5 text-xs font-bold text-[#0D1E4C]">
                  {ticket.subject}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <TicketStatusBadge status={ticket.status} />
                  <span className="text-xs font-medium text-[#64748B]">{formatCreatedAt(ticket.createdAt)}</span>
                </span>
                <IconButton
                  icon="open_in_new"
                  label="View ticket"
                  onClick={() => setDetailTicketId(ticket.inquiryId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailTicketId ? (
        <TicketDetailModal
          inquiryId={detailTicketId}
          variant="admin"
          onClose={() => setDetailTicketId(null)}
          onChanged={() => {
            setDetailTicketId(null);
            loadTickets();
          }}
        />
      ) : null}
    </section>
  );
}

function AssignRoleOrgModal({ account, roles, organizations, onClose, onSaved }) {
  const [roleId, setRoleId] = useState(() => String(account.requested_role_id ?? ""));
  const [organizationId, setOrganizationId] = useState(() => String(account.requested_organization_id ?? ""));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!roleId || !organizationId) {
      setError("Please select both a role and an organization.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/platformadmin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ userId: account.user_id, roleId: Number(roleId), organizationId, email: account.email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not assign role and organization.");
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-300 flex items-center justify-center bg-white/40 px-4">
      <div className="relative w-full max-w-sm rounded-4xl border border-white/60 bg-slate-100/60 p-10 shadow-2xl backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-slate-100"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            close
          </span>
        </button>

        <p className="px-12 text-center text-lg font-black text-[#0D1E4C]">{account.email}</p>

        <div className="mt-6">
          <AssignmentSelectors roleId={roleId} setRoleId={setRoleId} organizationId={organizationId} setOrganizationId={setOrganizationId} roles={roles} organizations={organizations} />
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}

        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="mt-4 w-full rounded-full bg-[#0D1E4C] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <AccountActionsIcon />
            {isSaving ? "Saving..." : "Assign"}
          </span>
        </button>
      </div>
    </div>
  );
}

function AccountActions({ account, onPlanSaved, onAssign }) {
  const isUnassigned = account.account_status === "Unassigned";

  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton
        icon="mail"
        label="Send email"
        onClick={() => {
          window.location.href = `mailto:${account.email}`;
        }}
      />
      {isUnassigned ? (
        <IconButton icon={<AccountActionsIcon />} label="Assign role & organization" onClick={() => onAssign(account)} />
      ) : (
        <PlanOverrideMenu account={account} onSaved={onPlanSaved} />
      )}
    </div>
  );
}

function csvValue(value) {
  const stringValue = String(value ?? "");
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export default function PlatformAdminDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState([]);
  const [organizationFilter, setOrganizationFilter] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignModalAccount, setAssignModalAccount] = useState(null);

  async function fetchAccounts() {
    const response = await fetch("/api/platformadmin/accounts", { headers: await authHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load platform accounts.");
    return result;
  }

  // A bare "fetch failed" is almost always a one-off network blip between
  // the server and Supabase, not a real fault — retry once before showing
  // the user anything, and only surface a friendly message if it recurs.
  async function loadAccounts() {
    setIsLoading(true);
    setError("");
    try {
      const result = await fetchAccounts();
      setAccounts(result.accounts ?? []);
      setRoles(result.roles ?? []);
      setOrganizations(result.organizations ?? []);
    } catch (firstError) {
      if (/fetch failed/i.test(firstError.message)) {
        try {
          const result = await fetchAccounts();
          setAccounts(result.accounts ?? []);
          setRoles(result.roles ?? []);
          setOrganizations(result.organizations ?? []);
        } catch {
          setError("Could not reach the server. Check your connection and try refreshing.");
        }
      } else {
        setError(firstError.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadAccounts, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const counts = { All: filteredBeforeStatus.length, Active: 0, Unassigned: 0, Suspended: 0 };
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
      account.created_at,
    ]);
    const csv = [
      "Email,Username,Job Title,Organization,Role,Status,Joined",
      ...rows.map((row) => row.map(csvValue).join(",")),
    ].join("\r\n");
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
          {["All", "Active", "Suspended", "Unassigned"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                statusFilter === status
                  ? SELECTED_STATUS_TONES[status]
                  : "border-white/60 bg-white/40 text-[#0A2540] hover:bg-white/60"
              }`}
            >
              {status}
              <span
                className={`min-w-5 rounded-full px-1.5 text-center text-xs font-bold ${
                  statusFilter === status ? "bg-white/40" : "bg-[#0D1E4C]/8"
                }`}
              >
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
            title="Refresh"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0A2540] transition hover:text-[#0D1E4C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className={`h-4.5 w-4.5 ${isLoading ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <span
                className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]"
                style={ICON_WEIGHT}
                aria-hidden="true"
              >
                search
              </span>
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
              className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-[#C7DDEB] bg-white pl-4 pr-5 text-sm font-bold text-[#0D1E4C] shadow-sm transition hover:bg-[#F1F5F9]"
            >
              <span className="material-symbols-outlined text-[20px]" style={BOLD_ICON_WEIGHT} aria-hidden="true">
                download
              </span>
              Export data
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        ) : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading accounts...</p> : null}

        <div className="overflow-x-auto pt-3">
          <div
            className="hidden min-w-225 gap-x-2 px-4 text-xs font-bold uppercase tracking-wide text-[#64748B] sm:grid"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <span>Email</span>
            <span>Username</span>
            <span>Job Title</span>
            <span>Organization</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Joined</span>
            <span className="text-right">Actions</span>
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-7 space-y-2 overflow-x-auto overflow-y-auto pr-1">
        {visibleAccounts.map((account) => (
          <div
            key={account.user_id}
            className="grid min-w-225 items-center gap-x-2 rounded-2xl bg-white/40 px-4 py-2 backdrop-blur-md"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <a href={`mailto:${account.email}`} className="truncate text-sm font-bold text-[#0B1B32] hover:underline">
              {account.email}
            </a>
            <span className="truncate text-sm text-[#475569]">@{account.username}</span>
            <span className="truncate text-sm text-[#475569]">{account.job_title || "—"}</span>
            <span className="truncate text-sm text-[#475569]">
              {account.organization?.organization_name ?? "No organization"}
            </span>
            <span className="truncate text-sm text-[#475569]">{account.role?.role_name ?? "—"}</span>
            <StatusBadge status={account.account_status} />
            <span className="truncate text-right text-sm text-[#475569]">{formatCreatedAt(account.created_at)}</span>
            <AccountActions account={account} onPlanSaved={loadAccounts} onAssign={setAssignModalAccount} />
          </div>
        ))}

        {!visibleAccounts.length && !isLoading ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-[#94a3b8]">No accounts match your filters.</p>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-0 flex-3 gap-4 pb-1">
        <div className="min-h-0 flex-5 overflow-y-auto">
          <PlatformAdminActivityLog />
        </div>
        <div className="min-h-0 flex-6 overflow-y-auto">
          <SupportTicketsPanel />
        </div>
      </div>

      {assignModalAccount ? (
        <AssignRoleOrgModal
          account={assignModalAccount}
          roles={roles}
          organizations={organizations}
          onClose={() => setAssignModalAccount(null)}
          onSaved={() => {
            setAssignModalAccount(null);
            loadAccounts();
          }}
        />
      ) : null}
    </div>
  );
}
