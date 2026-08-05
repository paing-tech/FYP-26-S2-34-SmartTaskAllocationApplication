"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { sideMenuNavigation } from "@/lib/sideMenuNavigation";
import ProfileDetailCard from "@/components/ProfileDetailCard";
import {
  DEMO_ROLES,
  clearDemoSession,
  demoAuthHeaders,
  isDemoSession,
} from "@/lib/demoClient";

const roleActions = {
  manager: [
    {
      label: "Create workspace",
      href: "/manager/workspace",
      group: "Workspace",
      actionId: "create-workspace",
    },
    {
      label: "Create workspace item",
      href: "/manager/workspace",
      group: "Workspace",
      actionId: "create-workspace-item",
    },
    { label: "View team", href: "/manager/team", group: "Team" },
    { label: "Open attendance", href: "/manager/attendance", group: "Attendance" },
    { label: "Review archive", href: "/manager/archive", group: "Archive" },
    { label: "Get support", href: "/manager/support", group: "Support" },
  ],
  useradmin: [
    { label: "Create account", href: "/useradmin/accounts", group: "Accounts" },
    { label: "Invite user", href: "/useradmin/accounts", group: "Accounts" },
    { label: "Update organization profile", href: "/useradmin/organization", group: "Organization" },
  ],
  employee: [
    { label: "Open workspace", href: "/employee/workspace", group: "Workspace" },
    { label: "Get support", href: "/employee/support", group: "Support" },
  ],
};

const aiAgentItems = {
  manager: [
    {
      label: "Optimus AI",
      description: "Automate task assignment and summarize workspace activity.",
      href: "/manager/workspace",
      group: "Workspace",
      type: "AI Agent",
      actionId: "open-optimus-ai",
    },
  ],
};

const notificationItems = [
  {
    id: 1,
    title: "Workspace activity",
    text: "Task updates and assignments will appear here.",
  },
  {
    id: 2,
    title: "Profile",
    text: "Profile and account alerts are available from every page.",
  },
];

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M2 13v2" />
      <path d="M22 13v2" />
    </svg>
  );
}

function RefreshIcon({ spinning }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function OptimusToggle({ checked, label, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/15"
      aria-pressed={checked}
    >
      <span className="text-sm font-black text-[#0D1E4C]">{label}</span>
      <span
        className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
          checked ? "bg-[#2563EB]" : "bg-white/35"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export default function TopInformationBar({ actor }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchInputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileCardOpen, setIsProfileCardOpen] = useState(false);
  const [isOptimusPanelOpen, setIsOptimusPanelOpen] = useState(false);
  const [optimusSettings, setOptimusSettings] = useState({
    smartTaskCreation: false,
    smartTaskAllocation: false,
  });
  const [isRefreshingSmartTasks, setIsRefreshingSmartTasks] = useState(false);
  const [smartTasksRefreshMessage, setSmartTasksRefreshMessage] = useState("");
  const [accountSearchItems, setAccountSearchItems] = useState([]);
  const [isLoadingSearchItems, setIsLoadingSearchItems] = useState(false);
  const [profile, setProfile] = useState({ email: "", name: "" });
  const [now, setNow] = useState(() => new Date());
  const [isDemo, setIsDemo] = useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setIsDemo(isDemoSession()));
  }, []);

  const baseSearchItems = useMemo(() => {
    const navigationItems =
      sideMenuNavigation[actor]?.items.map((item) => ({
        label: item.label,
        href: item.href,
        group: sideMenuNavigation[actor].label,
        type: "Action",
      })) ?? [];
    const actionItems = (roleActions[actor] ?? []).map((item) => ({
      ...item,
      type: "Action",
    }));

    return [...(aiAgentItems[actor] ?? []), ...actionItems, ...navigationItems];
  }, [actor]);

  const searchItems = useMemo(
    () => dedupeSearchItems([...accountSearchItems, ...baseSearchItems]),
    [accountSearchItems, baseSearchItems],
  );

  // Current page name, derived from the active route. Picks the longest matching
  // nav href so nested routes still resolve to their section.
  const currentPageName = useMemo(() => {
    const items = sideMenuNavigation[actor]?.items ?? [];
    const match = items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];

    return match?.label ?? "";
  }, [actor, pathname]);

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return searchItems;
    }

    return searchItems
      .filter((item) =>
        `${item.group} ${item.label} ${item.description ?? ""} ${item.type} ${item.href}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 12);
  }, [query, searchItems]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isSearchOpen]);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();

    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function fetchJson(path) {
    const response = await fetch(path, { headers: await authHeaders() });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Could not load ${path}.`);
    }

    return result;
  }

  async function loadAccountSearchItems() {
    setIsLoadingSearchItems(true);

    try {
      if (actor === "manager") {
        const [workspaceResult, taskResult, employeeResult] = await Promise.allSettled([
          fetchJson("/api/workspaces"),
          fetchJson("/api/tasks"),
          fetchJson("/api/employees"),
        ]);

        setAccountSearchItems([
          ...itemsFromWorkspaces(settledValue(workspaceResult), "/manager/workspace"),
          ...itemsFromTasks(settledValue(taskResult), "/manager/workspace"),
          ...itemsFromMembers(settledValue(employeeResult), "/manager/team"),
        ]);
        return;
      }

      if (actor === "employee") {
        const [workspaceResult] = await Promise.allSettled([fetchJson("/api/employee-workspaces")]);

        setAccountSearchItems([
          ...itemsFromWorkspaces(settledValue(workspaceResult), "/employee/workspace"),
          ...itemsFromTasks(settledValue(workspaceResult), "/employee/workspace"),
        ]);
        return;
      }

      if (actor === "useradmin") {
        const [accountResult, organizationResult] = await Promise.allSettled([
          fetchJson("/api/accounts"),
          fetchJson("/api/my-organization"),
        ]);

        setAccountSearchItems([
          ...itemsFromAccounts(settledValue(accountResult), "/useradmin/accounts"),
          ...itemsFromOrganization(settledValue(organizationResult), "/useradmin/organization"),
        ]);
      }
    } finally {
      setIsLoadingSearchItems(false);
    }
  }

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      loadAccountSearchItems();
    }, 0);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, isSearchOpen]);

  async function loadProfile() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    setProfile({
      email: user?.email ?? "Signed in user",
      name: user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Profile",
    });
  }

  async function openProfileMenu() {
    if (!isProfileOpen) {
      await loadProfile();
    }

    setIsProfileOpen((current) => !current);
    setIsNotificationsOpen(false);
    setIsOptimusPanelOpen(false);
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function switchDemoRole(roleKey) {
    if (isSwitchingRole) return;
    setIsSwitchingRole(true);
    try {
      const response = await fetch("/api/demo/role", {
        method: "POST",
        headers: await demoAuthHeaders(),
        body: JSON.stringify({ role: roleKey }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not switch role.");
      }
      setIsProfileOpen(false);
      router.push(result.home);
      router.refresh();
    } catch {
      /* swallow — demo only */
    } finally {
      setIsSwitchingRole(false);
    }
  }

  async function exitDemo() {
    const supabase = getSupabaseBrowserClient();
    try {
      await fetch("/api/demo/end", { method: "POST", headers: await demoAuthHeaders() });
    } catch {
      /* best-effort teardown */
    }
    clearDemoSession();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  function logoHref() {
    return sideMenuNavigation[actor]?.homeHref ?? "/";
  }

  function closeSearch() {
    setIsSearchOpen(false);
    setQuery("");
  }

  // Dispatching the event here — in the click handler itself, rather than
  // inside the setOptimusSettings updater — matters: updater functions run
  // during React's render of this component, so a synchronous listener that
  // calls setState on WorkspaceView from inside one triggers "Cannot update a
  // component while rendering a different component".
  function toggleOptimusSetting(key) {
    const nextValue = !optimusSettings[key];

    setOptimusSettings((current) => ({ ...current, [key]: nextValue }));

    if (key === "smartTaskCreation") {
      window.dispatchEvent(
        new CustomEvent("optima:optimus-setting-change", {
          detail: {
            actor,
            feature: "smart_task_creation",
            enabled: nextValue,
          },
        }),
      );
    }

    if (key === "smartTaskAllocation") {
      window.dispatchEvent(
        new CustomEvent("optima:optimus-setting-change", {
          detail: {
            actor,
            feature: "smart_task_allocation",
            enabled: nextValue,
          },
        }),
      );
    }

  }

  // Runs Smart Task Creation's allocation-history analysis on demand — the
  // agent decides what's due/missing and creates it directly on the board
  // (skipping anything that already has an equivalent open task) rather than
  // this being a background toggle.
  async function handleRefreshSmartTasks() {
    if (isRefreshingSmartTasks) return;
    setIsRefreshingSmartTasks(true);
    setSmartTasksRefreshMessage("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "refresh-smart-tasks" }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not refresh smart tasks.");
      }

      const createdCount = (result.recurringCreated ?? 0) + (result.historyCreated ?? 0);
      setSmartTasksRefreshMessage(
        createdCount ? `Created ${createdCount} new task${createdCount === 1 ? "" : "s"}.` : "No new tasks needed.",
      );
      window.dispatchEvent(new CustomEvent("optima:tasks-refreshed"));
    } catch (refreshError) {
      setSmartTasksRefreshMessage(refreshError.message || "Could not refresh smart tasks.");
    } finally {
      setIsRefreshingSmartTasks(false);
    }
  }

  function runSearchResult(item) {
    closeSearch();

    if (item.actionId) {
      const detail = {
        actionId: item.actionId,
        actor,
        href: item.href,
      };

      window.sessionStorage.setItem("optima:pending-search-action", JSON.stringify(detail));
      window.dispatchEvent(new CustomEvent("optima:search-action", { detail }));

      if (pathname !== item.href) {
        router.push(item.href);
      }

      return;
    }

    router.push(item.href);
  }

  return (
    <>
    <div className="relative z-100 flex min-h-14 w-full items-center gap-4 bg-white/20 backdrop-blur-md px-2 py-1 sm:px-6 lg:px-6">

        <Image
          src="/optimalogowhite.png"
          alt="Optima"
          width={32}
          height={32}
          className="h-8 w-8 object-contain"
        />

        {currentPageName ? (
          <span className="hidden whitespace-nowrap uppercase font-bold text-[#1E293B] sm:block">
            {currentPageName}
          </span>
        ) : null}

      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
        <div className="relative h-10 w-[min(30rem,calc(100vw-14rem))]">
          <span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#61708a]">
            <SearchIcon />
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(true);
              setIsNotificationsOpen(false);
              setIsProfileOpen(false);
              setIsOptimusPanelOpen(false);
            }}
            className="absolute inset-0 h-full w-full rounded-full border border-transparent bg-[#e8ebf1] pl-10 pr-4 text-left text-sm font-medium text-[#61708a] outline-none transition hover:bg-white/80 focus:border-[#b8c4d8] focus:bg-white"
            aria-label="Open global search"
          >
            Search...
          </button>
        </div>

        {actor === "manager" && pathname === "/manager/workspace" ? (
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => {
                setIsOptimusPanelOpen((current) => !current);
                setIsNotificationsOpen(false);
                setIsProfileOpen(false);
                closeSearch();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/20 text-[#0D1E4C] shadow-sm backdrop-blur-xl transition hover:bg-white/35 hover:scale-110"
              aria-label="Open Optimus AI settings"
              title="Optimus AI"
            >
              <AgentsIcon />
            </button>

            {isOptimusPanelOpen ? (
              <div className="absolute left-0 top-11 z-[120] w-72 rounded-3xl border border-white/60 bg-slate-200/90 p-3 shadow-[0_20px_70px_rgba(7,24,59,0.18)] backdrop-blur-3xl">
                <OptimusToggle
                  checked={optimusSettings.smartTaskCreation}
                  label="Smart Task Creation"
                  onChange={() => toggleOptimusSetting("smartTaskCreation")}
                />
                <OptimusToggle
                  checked={optimusSettings.smartTaskAllocation}
                  label="Smart Task Allocation"
                  onChange={() => toggleOptimusSetting("smartTaskAllocation")}
                />

                <div className="mt-1 border-t border-white/40 pt-2">
                  <button
                    type="button"
                    onClick={handleRefreshSmartTasks}
                    disabled={isRefreshingSmartTasks}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/15 disabled:opacity-60"
                  >
                    <span className="text-sm font-black text-[#0D1E4C]">Refresh smart tasks</span>
                    <RefreshIcon spinning={isRefreshingSmartTasks} />
                  </button>
                  {smartTasksRefreshMessage ? (
                    <p className="px-3 pb-1 text-xs font-semibold text-[#52627a]">{smartTasksRefreshMessage}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center justify-end gap-3">
        <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsNotificationsOpen((current) => !current);
            setIsProfileOpen(false);
            setIsOptimusPanelOpen(false);
          }}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#07183b] transition hover:bg-white/70"
          aria-label="Open notifications"
          title="Workspace activity"
        >
          <BellIcon />
          <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#0a72e8] ring-2 ring-white/70" />
        </button>

        {isNotificationsOpen ? (
          <div className="absolute right-0 top-12 w-80 rounded-xl border border-white/60 bg-white/20 p-3 shadow-[0_18px_60px_rgba(7,24,59,0.16)] backdrop-blur-sm">
            <div className="flex items-center justify-between px-1">
              <p className="font-bold text-[#07183b]">Notifications</p>
              <span className="rounded-full bg-[#eef6ff] px-2 py-1 text-xs font-bold text-[#0a2a66]">
                Live
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {notificationItems.map((item) => (
                <div key={item.id} className="rounded-lg bg-[#f8faff] p-3">
                  <p className="text-sm font-bold text-[#07183b]">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#61708a]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        </div>
        <p className="hidden whitespace-nowrap text-sm font-bold text-[#07183b] sm:block">
          {formatDateTime(now)}
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={openProfileMenu}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0a2a66] text-white shadow-sm transition hover:bg-[#07183b]"
            aria-label="Profile"
            title="Profile"
          >
            <UserIcon />
          </button>

          {isProfileOpen ? (
            <div className="absolute right-0 top-14 w-72 rounded-xl border border-white/60 bg-white/20 p-3 shadow-[0_18px_60px_rgba(7,24,59,0.16)] backdrop-blur-lg">
              <div className="rounded-lg bg-[#f8faff] p-3">
                <p className="text-sm font-bold text-[#07183b]">{profile.name}</p>
                <p className="mt-1 truncate text-xs text-[#61708a]">{profile.email}</p>
                {isDemo ? (
                  <span className="mt-2 inline-flex rounded-full bg-[#eef6ff] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0a2a66]">
                    Demo mode
                  </span>
                ) : null}
              </div>

              {isDemo ? (
                <div className="mt-3 rounded-lg border border-white/60 bg-white/40 p-2">
                  <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#61708a]">
                    Try a role
                  </p>
                  <div className="grid gap-1">
                    {DEMO_ROLES.map((role) => {
                      const isCurrent = role.home.startsWith(`/${actor}`);
                      return (
                        <button
                          key={role.key}
                          type="button"
                          disabled={isSwitchingRole}
                          onClick={() => switchDemoRole(role.key)}
                          className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold transition disabled:opacity-60 ${
                            isCurrent
                              ? "bg-[#0a2a66] text-white"
                              : "text-[#07183b] hover:bg-[#eef6ff]"
                          }`}
                        >
                          {role.label}
                          {isCurrent ? <span className="text-xs">Current</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 grid gap-2">
                {isDemo ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileCardOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className="rounded-md px-3 py-2 text-left text-sm font-bold text-[#07183b] hover:bg-[#eef6ff]"
                  >
                    View profile
                  </button>
                )}
                <button
                  type="button"
                  onClick={isDemo ? exitDemo : signOut}
                  className="rounded-md px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50"
                >
                  {isDemo ? "Exit demo" : "Log out"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>

      {isSearchOpen ? (
        <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center px-4 py-10">
          <div className="pointer-events-auto mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-white/60 bg-white/20 text-[#07183b] shadow-[0_28px_90px_rgba(7,24,59,0.28)] backdrop-blur-md">
            <div className="flex items-center gap-4 border-b border-white/60 px-6 py-5">
              <span className="text-[#61708a]">
                <SearchIcon />
              </span>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsSearchOpen(false);
                    setQuery("");
                  }
                }}
                placeholder="Search everything..."
                className="h-6 min-w-0 flex-1 bg-transparent text-xl font-semibold text-[#07183b] outline-none placeholder:text-[#61708a]"
                aria-label="Search everything"
              />
              <button
                type="button"
                onClick={() => {
                  setIsSearchOpen(false);
                  setQuery("");
                }}
                className="rounded-md border border-white/60 bg-white/20 px-3 py-2 text-sm font-bold text-[#52627a] hover:bg-white/40"
              >
                Esc
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
              <p className="px-3 py-2 text-sm font-bold text-[#52627a]">
                Results
              </p>
              <div className="space-y-1">
              {searchResults.map((item) => (
                  <button
                    key={`${item.type}-${item.group}-${item.href}-${item.label}-${item.id ?? ""}`}
                    onClick={() => {
                      runSearchResult(item);
                    }}
                    className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-white/35"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{item.label}</span>
                      {item.description ? (
                        <span className="block truncate text-xs font-semibold text-[#667085]">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-[#667085]">
                      {item.type}
                    </span>
                  </button>
                ))}
                {!searchResults.length ? (
                  <p className="rounded-lg px-3 py-8 text-center text-sm font-semibold text-[#667085]">
                    {isLoadingSearchItems
                      ? "Loading account results..."
                      : "No matching results."}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isProfileCardOpen ? <ProfileDetailCard onClose={() => setIsProfileCardOpen(false)} /> : null}
    </>
  );
}

function settledValue(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function dedupeSearchItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.type}-${item.href}-${item.label}-${item.id ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function itemsFromWorkspaces(payload, href) {
  return (payload?.workspaces ?? []).map((workspace) => ({
    id: workspace.workspace_id,
    label: workspace.workspace_name,
    description: workspace.description || "Workspace",
    href,
    group: "Workspace",
    type: "Workspace",
  }));
}

function itemsFromTasks(payload, href) {
  return (payload?.tasks ?? []).map((task) => ({
    id: task.task_id,
    label: task.title,
    description: [task.status, task.priority].filter(Boolean).join(" · ") || "Task",
    href,
    group: "Workspace",
    type: "Task",
  }));
}

function itemsFromMembers(payload, href) {
  const members = payload?.members ?? payload?.employees ?? payload?.user_accounts ?? [];

  return members.map((member) => ({
    id: member.user_id,
    label: member.profile?.full_name || member.full_name || member.username || member.email || "Member",
    description: [
      member.role?.role_name,
      member.department?.department_name,
      member.email,
    ]
      .filter(Boolean)
      .join(" · "),
    href,
    group: "Team",
    type: "Member",
  }));
}

function itemsFromAccounts(payload, href) {
  return (payload?.accounts ?? []).map((account) => ({
    id: account.user_id,
    label: account.username || account.email || "Account",
    description: [account.role?.role_name, account.account_status, account.email]
      .filter(Boolean)
      .join(" · "),
    href,
    group: "Accounts",
    type: "Member",
  }));
}

function itemsFromOrganization(payload, href) {
  const items = [];

  if (payload?.organization?.organization_name) {
    items.push({
      id: payload.organization.organization_id,
      label: payload.organization.organization_name,
      description: payload.organization.organization_type || "Organization",
      href,
      group: "Organization",
      type: "Organization",
    });
  }

  for (const department of payload?.departments ?? []) {
    items.push({
      id: department.department_id,
      label: department.department_name,
      description: "Department",
      href,
      group: "Organization",
      type: "Department",
    });
  }

  return items;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
  const day = new Intl.DateTimeFormat("en", { day: "numeric" }).format(value);
  const month = new Intl.DateTimeFormat("en", { month: "short" }).format(value);
  const year = new Intl.DateTimeFormat("en", { year: "2-digit" }).format(value);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short" }).format(value);

  return `${time} ${day} ${month} ${year} ${weekday}`;
}
