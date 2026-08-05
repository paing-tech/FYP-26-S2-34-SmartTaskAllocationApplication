"use client";

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SignUpForm from "@/components/SignUpForm";
import ProfileDetailCard from "@/components/ProfileDetailCard";
import Portal from "@/components/Portal";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

// Lighter than the font's default weight (400) so the action icons read as
// less heavy/bold next to the surrounding text.
const ICON_WEIGHT = { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" };

// Real WhatsApp brand mark (green badge + white handset glyph) rather than a
// monochrome line icon, so it reads as the actual app rather than a generic
// "call" icon.
function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="#25D366"
        d="M16.001 0C7.164 0 0 7.163 0 16c0 2.822.738 5.564 2.14 7.972L0 32l8.235-2.16A15.9 15.9 0 0 0 16 32c8.836 0 16-7.164 16-16S24.837 0 16.001 0Z"
      />
      <path
        fill="#FFF"
        d="M23.472 18.616c-.408-.204-2.408-1.188-2.782-1.324-.373-.136-.645-.204-.916.204-.272.408-1.052 1.324-1.29 1.596-.238.272-.475.306-.883.102-.408-.204-1.723-.635-3.283-2.026-1.214-1.083-2.034-2.42-2.272-2.828-.238-.408-.025-.629.179-.833.184-.183.408-.476.612-.714.204-.238.272-.408.408-.68.136-.272.068-.51-.034-.714-.102-.204-.916-2.208-1.256-3.024-.33-.79-.666-.683-.916-.696-.238-.011-.51-.014-.782-.014-.272 0-.714.102-1.088.51-.373.408-1.427 1.394-1.427 3.4 0 2.004 1.462 3.941 1.666 4.213.204.272 2.876 4.393 6.968 6.162.974.42 1.734.671 2.327.858.978.311 1.868.267 2.572.162.784-.117 2.408-.984 2.747-1.935.34-.951.34-1.766.238-1.936-.102-.17-.373-.272-.782-.476Z"
      />
    </svg>
  );
}

function getWhatsAppHref(phoneNumber) {
  const digits = (phoneNumber ?? "").replace(/[^0-9]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

const VIEWS = [
  { id: "list", label: "List" },
  { id: "card", label: "Card" },
];

const STATUS_TONES = {
  Suspended: "bg-[#FEE4E2] text-[#B42318]",
  Pending: "bg-[#FEF3C7] text-[#92400E]",
};

// Background lives on each <td> (not the <tr>) so the row's rounded
// left/right corners actually clip the fill — a <tr>-level background paints
// as a plain rectangle behind the cells, which showed as a faded square edge
// poking out past the first/last cell's rounded corner. No per-cell shadow —
// adjacent cells' shadows overlapped at their shared edge and showed as a
// faded divider line between columns.
const LIST_CELL_CLASS = "bg-white/40 px-4 py-2 backdrop-blur-md";

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

function StatusBadge({ status, className = "" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        STATUS_TONES[status] ?? "bg-[#D1FADF] text-[#05603A]"
      } ${className}`}
    >
      {status}
    </span>
  );
}

function AccountAvatar({ account, sizeClass = "h-10 w-10" }) {
  const name = account.full_name || account.username || "Account";

  if (account.profile_picture_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={account.profile_picture_url}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-[#C7DDEB] text-[#0D1E4C]`}>
      <svg className="h-3/5 w-3/5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    </div>
  );
}

const IconButton = forwardRef(function IconButton(
  { icon, label, onClick, tone = "default", disabled = false },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30 ${
        tone === "danger" ? "text-[#B42318] hover:bg-[#FEE4E2]" : "text-[#0D1E4C] hover:bg-white/70"
      }`}
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

function MenuItem({ icon, label, onClick, tone = "default" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-sm font-semibold transition ${
        tone === "danger" ? "text-[#B42318] hover:bg-[#FEE4E2]" : "text-[#0B1B32] hover:bg-[#EEF2F8]"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]" style={ICON_WEIGHT} aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}

// Only Employee <-> Manager <-> User Admin are ranked here — Platform Admin
// is developer-side and never assignable by a User Admin (see /api/accounts).
function getPromoteTarget(roleName) {
  const normalized = (roleName ?? "").trim().toLowerCase();
  if (normalized === "employee") return { label: "Promote to Manager", targetRoleName: "Manager" };
  if (normalized === "manager") return { label: "Promote to User Admin", targetRoleName: "User Admin" };
  return null;
}

function getDemoteTarget(roleName) {
  const normalized = (roleName ?? "").trim().toLowerCase();
  if (normalized === "manager") return { label: "Demote to Employee", targetRoleName: "Employee" };
  if (normalized === "user admin") return { label: "Demote to Manager", targetRoleName: "Manager" };
  return null;
}

// The dropdown is rendered through a Portal at a computed fixed position
// rather than absolutely inside this row: table rows use backdrop-blur for
// their glassy background, and any ancestor with a CSS filter/backdrop-blur
// becomes a new stacking context that traps position:absolute/fixed
// descendants — without this, the menu painted behind (and got visually
// covered by) the rows below it instead of floating above everything.
function AccountActionsMenu({ account, roleIdByName, onRequestAction }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  const isActive = account.account_status !== "Suspended";
  const promote = getPromoteTarget(account.role?.role_name);
  const demote = getDemoteTarget(account.role?.role_name);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setIsOpen(true);
  }

  function requestAction(action) {
    setIsOpen(false);
    onRequestAction(action);
  }

  return (
    <div className="relative">
      <IconButton
        ref={buttonRef}
        icon="settings_account_box"
        label="Account actions"
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
      />

      {isOpen && menuPosition ? (
        <Portal>
          <div className="fixed inset-0 z-90" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-90 w-60 rounded-3xl border border-white/60 bg-white p-2 shadow-[0_20px_50px_rgba(13,30,76,0.2)]"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {promote ? (
              <MenuItem
                icon="arrow_circle_up"
                label={promote.label}
                onClick={() =>
                  requestAction({
                    account,
                    type: "role",
                    title: `${promote.label}?`,
                    roleId: roleIdByName.get(promote.targetRoleName.toLowerCase()),
                  })
                }
              />
            ) : null}
            {demote ? (
              <MenuItem
                icon="arrow_circle_down"
                label={demote.label}
                onClick={() =>
                  requestAction({
                    account,
                    type: "role",
                    title: `${demote.label}?`,
                    roleId: roleIdByName.get(demote.targetRoleName.toLowerCase()),
                  })
                }
              />
            ) : null}
            {isActive ? (
              <MenuItem
                icon="do_not_disturb_on"
                label="Suspend Account"
                tone="danger"
                onClick={() =>
                  requestAction({
                    account,
                    type: "status",
                    title: "Suspend Account?",
                    accountStatus: "Suspended",
                    tone: "danger",
                  })
                }
              />
            ) : (
              <MenuItem
                icon="check_circle"
                label="Activate Account"
                onClick={() =>
                  requestAction({
                    account,
                    type: "status",
                    title: "Activate Account?",
                    accountStatus: "Active",
                  })
                }
              />
            )}
            <MenuItem
              icon="delete"
              label="Delete Account"
              tone="danger"
              onClick={() =>
                requestAction({
                  account,
                  type: "delete",
                  title: "Delete Account?",
                  tone: "danger",
                })
              }
            />
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

// Minimal confirm step, then a password re-entry step before the action is
// actually sent — verified server-side against the requester's own account
// (see /api/verify-password), never the target account.
function ConfirmActionModal({ title, tone = "default", onCancel, onConfirm }) {
  const [step, setStep] = useState("confirm");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmClass =
    tone === "danger" ? "bg-[#B42318] hover:bg-[#8f1c13]" : "bg-[#0D1E4C] hover:bg-[#061a40]";

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!password || isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      const verifyResponse = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ password }),
      });
      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyResult.error || "Incorrect password.");
      }

      await onConfirm();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {step === "confirm" ? (
          <>
            <p className="text-center text-base font-bold text-[#0B1B32]">{title}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full border border-[#C7DDEB] py-2.5 text-sm font-bold text-[#0B1B32] transition hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep("password")}
                className={`flex-1 rounded-full py-2.5 text-sm font-bold text-white transition ${confirmClass}`}
              >
                Confirm
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handlePasswordSubmit}>
            <p className="text-center text-sm font-bold text-[#0B1B32]">{title}</p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              placeholder="Password"
              className="mt-3 w-full rounded-full border border-[#C7DDEB] px-4 py-2.5 text-sm text-[#0B1B32] outline-none focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
            {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full border border-[#C7DDEB] py-2.5 text-sm font-bold text-[#0B1B32] transition hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!password || isSubmitting}
                className={`flex-1 rounded-full py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${confirmClass}`}
              >
                {isSubmitting ? "Checking..." : "Confirm"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AccountActions({ account, roleIdByName, onRequestAction }) {
  const whatsappHref = getWhatsAppHref(account.phone_number);

  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton
        icon={<WhatsAppIcon />}
        label={whatsappHref ? "Message on WhatsApp" : "No phone number on file"}
        disabled={!whatsappHref}
        onClick={() => window.open(whatsappHref, "_blank", "noopener,noreferrer")}
      />
      <IconButton
        icon="mail"
        label="Send email"
        onClick={() => {
          window.location.href = `mailto:${account.email}`;
        }}
      />
      <AccountActionsMenu account={account} roleIdByName={roleIdByName} onRequestAction={onRequestAction} />
    </div>
  );
}

// Reserves the page's remaining space for features not built yet, so the
// accounts list doesn't stretch to fill the whole page.
function PlaceholderSection({ title, description }) {
  return (
    <section className="rounded-3xl border border-dashed border-white/60 bg-white/20 p-6">
      <h2 className="text-lg font-bold text-[#07183b]">{title}</h2>
      <p className="mt-1 text-sm font-semibold text-[#64748B]">{description}</p>
    </section>
  );
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? "");
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export default function AccountsPageContent() {
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [view, setView] = useState("list");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState([]);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState([]);
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [viewProfileUserId, setViewProfileUserId] = useState(null);
  const [searchMaxWidth, setSearchMaxWidth] = useState(null);
  const searchWrapperRef = useRef(null);
  const departmentButtonRef = useRef(null);

  function toggleRole(roleName) {
    setRoleFilter((current) =>
      current.includes(roleName) ? current.filter((item) => item !== roleName) : [...current, roleName],
    );
  }

  function toggleDepartment(department) {
    setDepartmentFilter((current) =>
      current.includes(department)
        ? current.filter((item) => item !== department)
        : [...current, department],
    );
  }

  async function loadAccounts() {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/accounts", {
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load accounts.");
      }

      setAccounts(result.accounts);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const response = await fetch("/api/roles", { headers: await authHeaders() });
      const result = await response.json();
      if (response.ok) setRoles(result.roles ?? []);
    } catch {
      // Best-effort — promote/demote menu items just won't resolve a target
      // role_id, and the resulting PATCH will surface a clear API error.
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadAccounts();
      loadRoles();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const roleIdByName = useMemo(() => {
    const map = new Map();
    for (const role of roles) {
      map.set((role.role_name || "").trim().toLowerCase(), role.role_id);
    }
    return map;
  }, [roles]);

  const roleOptions = useMemo(() => {
    if (roles.length) return roles.map((role) => role.role_name).sort();
    const names = new Set();
    for (const account of accounts) {
      names.add(account.role?.role_name ?? "Unassigned");
    }
    return Array.from(names).sort();
  }, [roles, accounts]);

  const departmentOptions = useMemo(() => {
    const names = new Set();
    for (const account of accounts) {
      names.add(account.department?.department_name ?? "No department");
    }
    return Array.from(names).sort();
  }, [accounts]);

  // Keeps the search bar's right edge lined up with the Department filter
  // button below it — measured live since the filter row's width shifts with
  // the number of role/department options and viewport width.
  useLayoutEffect(() => {
    function measure() {
      const wrapperRect = searchWrapperRef.current?.getBoundingClientRect();
      const deptRect = departmentButtonRef.current?.getBoundingClientRect();
      if (wrapperRect && deptRect) {
        setSearchMaxWidth(Math.max(200, deptRect.right - wrapperRect.left));
      }
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [roleOptions, departmentOptions]);

  // Accounts after search + role + department filters (but before the status
  // filter), so the status pill counts reflect the other active filters.
  const searchAndDeptFiltered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const searchable = `${account.full_name ?? ""} ${account.username} ${account.email} ${account.job_title ?? ""} ${account.role?.role_name ?? ""} ${account.department?.department_name ?? ""}`;
      if (!searchable.toLowerCase().includes(normalizedSearch)) return false;

      if (roleFilter.length) {
        const roleName = account.role?.role_name ?? "Unassigned";
        if (!roleFilter.includes(roleName)) return false;
      }

      if (departmentFilter.length) {
        const department = account.department?.department_name ?? "No department";
        if (!departmentFilter.includes(department)) return false;
      }

      return true;
    });
  }, [accounts, search, roleFilter, departmentFilter]);

  const statusCounts = useMemo(() => {
    const counts = { All: searchAndDeptFiltered.length, Active: 0, Suspended: 0, Pending: 0 };
    for (const account of searchAndDeptFiltered) {
      if (account.account_status in counts) counts[account.account_status] += 1;
    }
    return counts;
  }, [searchAndDeptFiltered]);

  const visibleAccounts = useMemo(() => {
    return statusFilter === "All"
      ? searchAndDeptFiltered
      : searchAndDeptFiltered.filter((account) => account.account_status === statusFilter);
  }, [searchAndDeptFiltered, statusFilter]);

  const groupedAccounts = useMemo(() => {
    return visibleAccounts.reduce((groups, account) => {
      const roleName = account.role?.role_name ?? "Unassigned";
      groups[roleName] = [...(groups[roleName] ?? []), account];
      return groups;
    }, {});
  }, [visibleAccounts]);

  async function performPendingAction() {
    if (!pendingAction) return;
    const { account, type, roleId, accountStatus } = pendingAction;

    if (type === "delete") {
      const response = await fetch(`/api/accounts?userId=${account.user_id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete account.");
    } else {
      const body = { userId: account.user_id };
      if (type === "role") body.roleId = roleId;
      if (type === "status") body.accountStatus = accountStatus;

      const response = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update account.");
    }

    setPendingAction(null);
    await loadAccounts();
  }

  // Exports every loaded account (not just the currently filtered/visible
  // ones) — "all records" per the request, independent of the active search
  // or filters.
  function handleExportCsv() {
    const headers = ["Full Name", "Username", "Email", "Job Title", "Phone Number", "Department", "Role", "Status"];
    const rows = accounts.map((account) => [
      account.full_name ?? "",
      account.username ?? "",
      account.email ?? "",
      account.job_title ?? "",
      account.phone_number ?? "",
      account.department?.department_name ?? "",
      account.role?.role_name ?? "",
      account.account_status ?? "",
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex shrink-0 rounded-full border border-white/60 bg-white/30 p-1 backdrop-blur-sm">
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                  view === option.id ? "bg-[#0D1E4C] text-white shadow-sm" : "text-[#0D1E4C] hover:bg-white/60"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div
            ref={searchWrapperRef}
            className="relative sm:flex-1"
            style={searchMaxWidth ? { maxWidth: searchMaxWidth } : undefined}
          >
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
              placeholder="Search for users"
              className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-[#C7DDEB] bg-white px-5 text-sm font-bold text-[#0D1E4C] shadow-sm transition hover:bg-[#F1F5F9]"
          >
            <span className="material-symbols-outlined text-[20px]" style={ICON_WEIGHT} aria-hidden="true">
              download
            </span>
            Export data
          </button>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[#0a2a66] px-6 text-sm font-bold text-white transition-colors hover:bg-[#061a40]"
          >
            <span className="material-symbols-outlined text-[20px]" style={ICON_WEIGHT} aria-hidden="true">
              person_add
            </span>
            Add User
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        {["All", "Active", "Suspended", "Pending"].map((status) => {
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-[#0D1E4C] bg-[#0D1E4C] text-white"
                  : "border-white/60 bg-white/40 text-[#0A2540] hover:bg-white/60"
              }`}
            >
              {status}
              <span
                className={`min-w-5 rounded-full px-1.5 text-center text-xs font-bold ${
                  active ? "bg-white/25 text-white" : "bg-[#0D1E4C]/10 text-[#0D1E4C]"
                }`}
              >
                {statusCounts[status]}
              </span>
            </button>
          );
        })}

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsRoleOpen((open) => !open)}
            aria-expanded={isRoleOpen}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              roleFilter.length
                ? "border-[#0D1E4C] bg-white/60 text-[#0A2540]"
                : "border-white/60 bg-white/40 text-[#0A2540] hover:bg-white/60"
            }`}
          >
            Role
            {roleFilter.length ? (
              <span className="min-w-5 rounded-full bg-[#0D1E4C] px-1.5 text-center text-xs font-bold text-white">
                {roleFilter.length}
              </span>
            ) : null}
            <svg
              className={`h-4 w-4 transition-transform ${isRoleOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {isRoleOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsRoleOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl border border-white/60 bg-white/85 p-2 shadow-[0_20px_50px_rgba(13,30,76,0.2)] backdrop-blur-xl">
                <div className="max-h-60 overflow-y-auto">
                  {roleOptions.length ? (
                    roleOptions.map((roleName) => {
                      const checked = roleFilter.includes(roleName);
                      return (
                        <label
                          key={roleName}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#0B1B32] hover:bg-white/70"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRole(roleName)}
                            className="h-4 w-4 accent-[#0D1E4C]"
                          />
                          <span className="min-w-0 truncate">{roleName}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="px-2 py-2 text-xs text-[#94a3b8]">No roles</p>
                  )}
                </div>
                {roleFilter.length ? (
                  <button
                    type="button"
                    onClick={() => setRoleFilter([])}
                    className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-[#64748B] hover:bg-white/70"
                  >
                    Clear selection
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className="relative">
          <button
            ref={departmentButtonRef}
            type="button"
            onClick={() => setIsDeptOpen((open) => !open)}
            aria-expanded={isDeptOpen}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              departmentFilter.length
                ? "border-[#0D1E4C] bg-white/60 text-[#0A2540]"
                : "border-white/60 bg-white/40 text-[#0A2540] hover:bg-white/60"
            }`}
          >
            Department
            {departmentFilter.length ? (
              <span className="min-w-5 rounded-full bg-[#0D1E4C] px-1.5 text-center text-xs font-bold text-white">
                {departmentFilter.length}
              </span>
            ) : null}
            <svg
              className={`h-4 w-4 transition-transform ${isDeptOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {isDeptOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsDeptOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl border border-white/60 bg-white/85 p-2 shadow-[0_20px_50px_rgba(13,30,76,0.2)] backdrop-blur-xl">
                <div className="max-h-60 overflow-y-auto">
                  {departmentOptions.length ? (
                    departmentOptions.map((department) => {
                      const checked = departmentFilter.includes(department);
                      return (
                        <label
                          key={department}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#0B1B32] hover:bg-white/70"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDepartment(department)}
                            className="h-4 w-4 accent-[#0D1E4C]"
                          />
                          <span className="min-w-0 truncate">{department}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="px-2 py-2 text-xs text-[#94a3b8]">No departments</p>
                  )}
                </div>
                {departmentFilter.length ? (
                  <button
                    type="button"
                    onClick={() => setDepartmentFilter([])}
                    className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-[#64748B] hover:bg-white/70"
                  >
                    Clear selection
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {isLoading ? <p className="text-sm text-[#52627a]">Loading accounts...</p> : null}
      </div>

      {/* Capped to roughly 5 rows tall — only this list scrolls, the
          controls above and the column header (sticky) never move. */}
      {view === "list" ? (
        <div className="max-h-96 shrink-0 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-225 border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10 bg-[#eef2f8]/95 backdrop-blur-sm">
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-[#64748B]">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Username</th>
                <th className="px-4 py-2">Job Title</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => (
                <tr key={account.user_id}>
                  <td className={`${LIST_CELL_CLASS} rounded-l-2xl`}>
                    <button
                      type="button"
                      onClick={() => setViewProfileUserId(account.user_id)}
                      className="flex min-w-0 items-center gap-3 rounded-full py-1 pr-3 text-left transition hover:bg-white/60"
                    >
                      <AccountAvatar account={account} sizeClass="h-9 w-9" />
                      <span className="min-w-0 truncate text-sm font-bold text-[#0B1B32]">
                        {account.full_name || account.username}
                      </span>
                    </button>
                  </td>
                  <td className={`${LIST_CELL_CLASS} text-sm text-[#475569]`}>@{account.username}</td>
                  <td className={`${LIST_CELL_CLASS} text-sm text-[#475569]`}>{account.job_title || "—"}</td>
                  <td className={`${LIST_CELL_CLASS} text-sm text-[#475569]`}>
                    {account.department?.department_name ?? "No department"}
                  </td>
                  <td className={`${LIST_CELL_CLASS} text-sm text-[#475569]`}>{account.role?.role_name ?? "—"}</td>
                  <td className={LIST_CELL_CLASS}>
                    <StatusBadge status={account.account_status} />
                  </td>
                  <td className={`${LIST_CELL_CLASS} rounded-r-2xl`}>
                    <AccountActions account={account} roleIdByName={roleIdByName} onRequestAction={setPendingAction} />
                  </td>
                </tr>
              ))}

              {!visibleAccounts.length && !isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#94a3b8]">
                    No accounts match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-96 shrink-0 space-y-5 overflow-y-auto">
          {Object.entries(groupedAccounts).map(([roleName, roleAccounts]) => (
            <section key={roleName} className="space-y-2">
              <h2 className="text-lg font-bold text-[#07183b]">{roleName}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {roleAccounts.map((account) => (
                  <article
                    key={account.user_id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/35 p-4 shadow-sm backdrop-blur-md"
                  >
                    <button
                      type="button"
                      onClick={() => setViewProfileUserId(account.user_id)}
                      className="flex items-center gap-3 rounded-2xl p-1 text-left transition hover:bg-white/45"
                    >
                      <AccountAvatar account={account} sizeClass="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-[#0B1B32]">
                          {account.full_name || account.username}
                        </h3>
                        <p className="truncate text-xs text-[#64748B]">
                          {account.department?.department_name ?? "No department"}
                        </p>
                        <StatusBadge status={account.account_status} className="mt-1.5" />
                      </div>
                    </button>
                    <div className="flex items-center justify-end gap-1 border-t border-white/50 pt-2">
                      <AccountActions account={account} roleIdByName={roleIdByName} onRequestAction={setPendingAction} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {!visibleAccounts.length && !isLoading ? (
            <p className="text-sm font-semibold text-[#94a3b8]">No accounts match your filters.</p>
          ) : null}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-1">
        <PlaceholderSection
          title="Role Permission Management"
          description="Configure what each role can see and do. Coming soon."
        />
        <PlaceholderSection title="Activity Logs" description="A history of account and permission changes. Coming soon." />
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07183b]/40 p-4">
          <div className="relative w-full max-w-md">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-[#07183b] shadow"
              aria-label="Close sign up form"
            >
              x
            </button>
            <SignUpForm
              onSuccess={() => {
                setIsFormOpen(false);
                loadAccounts();
              }}
            />
          </div>
        </div>
      ) : null}

      {viewProfileUserId ? (
        <ProfileDetailCard userId={viewProfileUserId} viewOnly onClose={() => setViewProfileUserId(null)} />
      ) : null}

      {pendingAction ? (
        <ConfirmActionModal
          title={pendingAction.title}
          tone={pendingAction.tone}
          onCancel={() => setPendingAction(null)}
          onConfirm={performPendingAction}
        />
      ) : null}
    </div>
  );
}
