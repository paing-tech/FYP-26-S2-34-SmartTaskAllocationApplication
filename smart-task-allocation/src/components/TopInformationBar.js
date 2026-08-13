"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { sideMenuNavigation } from "@/lib/sideMenuNavigation";
import ProfileDetailCard from "@/components/ProfileDetailCard";
import ContactSupportModal from "@/components/ContactSupportModal";
import TicketDetailModal from "@/components/TicketDetailModal";
import { usePlanGate } from "@/components/PlanProvider";
import {
  DEMO_ROLES,
  clearDemoSession,
  demoAuthHeaders,
  isDemoSession,
} from "@/lib/demoClient";

const PLAN_TIER_CHIP_TONES = {
  pro: "bg-[#7C3AED]",
  team: "bg-[#CA8A04]",
};

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

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
  ],
  useradmin: [
    { label: "Create account", href: "/useradmin/accounts", group: "Accounts" },
    { label: "Invite user", href: "/useradmin/accounts", group: "Accounts" },
    { label: "Update organization profile", href: "/useradmin/organization", group: "Organization" },
  ],
  employee: [
    { label: "Open workspace", href: "/employee/workspace", group: "Workspace" },
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

function formatAnnouncementTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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

function DeveloperContactModal({ onClose }) {
  const contacts = [
    {
      label: "GitHub",
      href: "https://github.com/paing-tech",
      icon: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.13c.98 0 1.95.13 2.87.38 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.15v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>,
    },
    {
      label: "LinkedIn",
      href: "https://linkedin.com/in/paingthitxan",
      icon: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M5.34 7.67H1.82V22h3.52V7.67ZM3.58 2A2.07 2.07 0 1 0 3.58 6.14 2.07 2.07 0 0 0 3.58 2ZM22 13.78c0-4.32-2.3-6.33-5.38-6.33a4.63 4.63 0 0 0-4.2 2.31h-.05V7.67H9V22h3.52v-7.1c0-1.87.35-3.68 2.67-3.68 2.28 0 2.31 2.14 2.31 3.8V22H22v-8.22Z" /></svg>,
    },
    {
      label: "Email",
      href: "mailto:paingthit.xan@gmail.com",
      icon: <span className="material-symbols-outlined text-[26px]" aria-hidden="true">mail</span>,
    },
  ];

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="developer-contact-title" className="relative w-full max-w-md rounded-[36px] border border-white/70 bg-slate-200/90 p-8 text-[#0D1E4C] shadow-[0_28px_90px_rgba(7,24,59,0.25)] backdrop-blur-xl">
        <button type="button" onClick={onClose} aria-label="Close developer contact" className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/70"><span className="material-symbols-outlined text-[26px]" aria-hidden="true">close</span></button>
        <div className="flex flex-col items-center text-center">
          <h2 id="developer-contact-title" className="text-2xl font-black">Contact Developer</h2>
          <div className="mt-4 flex flex-col items-center">
            <p className="text-lg font-black">Paing Thit Xan</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Lead Full-Stack Developer</p>
          </div>
          <div className="mt-6 flex w-full justify-center gap-4">
            {contacts.map((contact) => <a key={contact.label} href={contact.href} target={contact.href.startsWith("mailto:") ? undefined : "_blank"} rel={contact.href.startsWith("mailto:") ? undefined : "noreferrer"} aria-label={contact.label} title={contact.label} className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-white/55 transition hover:-translate-y-1 hover:bg-white/85 hover:shadow-lg">{contact.icon}</a>)}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function TopInformationBar({ actor }) {
  const router = useRouter();
  const pathname = usePathname();
  const { plan, openPlanPicker } = usePlanGate();
  const searchInputRef = useRef(null);
  const pendingJumpKeyRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("all");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileCardOpen, setIsProfileCardOpen] = useState(false);
  const [isContactSupportOpen, setIsContactSupportOpen] = useState(false);
  const [isDeveloperContactOpen, setIsDeveloperContactOpen] = useState(false);
  const [detailInquiryId, setDetailInquiryId] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [accountSearchItems, setAccountSearchItems] = useState([]);
  const [isLoadingSearchItems, setIsLoadingSearchItems] = useState(false);
  const [profile, setProfile] = useState({ email: "", name: "", profilePictureUrl: "" });
  const [now, setNow] = useState(() => new Date());
  const [isDemo, setIsDemo] = useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);
  const isPlatformAdmin = actor === "platformadmin";

  useEffect(() => {
    queueMicrotask(() => setIsDemo(isDemoSession()));
  }, []);

  const baseSearchItems = useMemo(() => {
    const navigationItems =
      sideMenuNavigation[actor]?.items.map((item) => ({
        label: item.label,
        href: item.href,
        group: sideMenuNavigation[actor].label,
        type: "Page",
        shortcut: item.shortcut,
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
    const scopedItems =
      activeTab === "actions"
        ? searchItems.filter((item) => item.type === "Action" || item.type === "AI Agent")
        : searchItems;

    if (!normalizedQuery) {
      return scopedItems;
    }

    const matched = scopedItems.filter((item) =>
      `${item.group} ${item.label} ${item.description ?? ""} ${item.type} ${item.href}`
        .toLowerCase()
        .includes(normalizedQuery)
    );

    return activeTab === "actions" ? matched : matched.slice(0, 12);
  }, [activeTab, query, searchItems]);

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

  // Global shortcuts, active anywhere in the app (TopInformationBar is
  // mounted on every authenticated page via SideMenuLayout):
  //  - Cmd/Ctrl+K toggles the search palette, even while another input is
  //    focused — the same convention as GitHub/Linear/Vercel command bars.
  //  - "G" then a letter jumps straight to a nav item without opening the
  //    palette at all (see the per-item `shortcut` in sideMenuNavigation),
  //    Gmail/Linear style. Ignored while typing in a field so it doesn't
  //    hijack normal text entry.
  useEffect(() => {
    function isEditableTarget(target) {
      const tag = target?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
    }

    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        pendingJumpKeyRef.current = null;
        setIsSearchOpen((current) => {
          const next = !current;
          if (!next) setQuery("");
          setHighlightedIndex(0);
          return next;
        });
        return;
      }

      if (isSearchOpen || isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (pendingJumpKeyRef.current === "g") {
        pendingJumpKeyRef.current = null;
        const items = sideMenuNavigation[actor]?.items ?? [];
        const target = items.find((item) => item.shortcut === key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (key === "g") {
        pendingJumpKeyRef.current = "g";
        window.setTimeout(() => {
          pendingJumpKeyRef.current = null;
        }, 1200);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actor, isSearchOpen, router]);

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

    const fallbackProfile = {
      email: user?.email ?? "Signed in user",
      name: user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Profile",
      profilePictureUrl: user?.user_metadata?.avatar_url ?? "",
    };

    try {
      const response = await fetch("/api/my-profile", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load profile.");
      }

      setProfile({
        email: result.profile.email || fallbackProfile.email,
        name: result.profile.full_name || result.profile.username || fallbackProfile.name,
        profilePictureUrl: result.profile.profile_picture_url || fallbackProfile.profilePictureUrl,
      });
    } catch {
      setProfile(fallbackProfile);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(loadProfile, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function loadAnnouncements() {
    try {
      const result = await fetchJson("/api/announcements");
      setAnnouncements(result.announcements ?? []);
      setUnreadCount(result.unreadCount ?? 0);
    } catch {
      /* best-effort — the bell just stays empty */
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(loadAnnouncements, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openNotifications() {
    const opening = !isNotificationsOpen;
    setIsNotificationsOpen(opening);
    setIsProfileOpen(false);

    if (opening && unreadCount > 0) {
      setAnnouncements((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      try {
        await fetch("/api/announcements", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ markAllRead: true }),
        });
      } catch {
        /* best-effort — worst case the dot reappears next load */
      }
    }
  }

  async function openProfileMenu() {
    if (!isProfileOpen) {
      await loadProfile();
    }

    setIsProfileOpen((current) => !current);
    setIsNotificationsOpen(false);
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
    setActiveTab("all");
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
              setHighlightedIndex(0);
            }}
            className="absolute inset-0 flex h-full w-full items-center justify-between rounded-full border border-transparent bg-[#e8ebf1] pl-10 pr-3 text-left text-sm font-medium text-[#61708a] outline-none transition hover:bg-white/80 focus:border-[#b8c4d8] focus:bg-white"
            aria-label="Open global search"
          >
            <span>Search...</span>
            <span className="hidden shrink-0 rounded-md border border-[#c7d0e0] bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-[#61708a] sm:inline">
              {"⌘"}K
            </span>
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center justify-end gap-3">
        <div className="relative">
        <button
          type="button"
          onClick={openNotifications}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#07183b] transition hover:bg-white/70"
          aria-label="Open notifications"
          title="Notifications"
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#0a72e8] ring-2 ring-white/70" />
          ) : null}
        </button>

        {isNotificationsOpen ? (
          <div className="absolute right-0 top-12 w-80 rounded-xl border border-white/60 bg-white/20 p-3 shadow-[0_18px_60px_rgba(7,24,59,0.16)] backdrop-blur-sm">
            <div className="flex items-center justify-between px-1">
              <p className="font-bold text-[#07183b]">Notifications</p>
              <span className="rounded-full bg-[#eef6ff] px-2 py-1 text-xs font-bold text-[#0a2a66]">
                Live
              </span>
            </div>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
              {announcements.length ? (
                announcements.map((item) => (
                  <div
                    key={item.announcementId}
                    className={`rounded-lg p-3 ${item.isRead ? "bg-[#f8faff]" : "bg-[#eef6ff]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#07183b]">{item.title}</p>
                      <span className="shrink-0 text-[10px] font-semibold text-[#94a3b8]">
                        {formatAnnouncementTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#61708a]">{item.body}</p>
                    {item.relatedInquiryId ? (
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setDetailInquiryId(item.relatedInquiryId)}
                          aria-label="Open ticket"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[#0a2a66] transition hover:bg-white/70"
                        >
                          <span className="material-symbols-outlined text-lg" aria-hidden="true">
                            open_in_new
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-[#f8faff] p-3 text-xs font-semibold text-[#61708a]">
                  No announcements yet.
                </p>
              )}
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a2a66] text-white shadow-sm transition hover:bg-[#07183b]"
            aria-label="Profile"
            title="Profile"
          >
            {profile.profilePictureUrl ? (
              <Image
                src={profile.profilePictureUrl}
                alt={profile.name || "Profile"}
                width={44}
                height={44}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <UserIcon />
            )}
          </button>

          {!isPlatformAdmin && plan && plan !== "starter" ? (
            <span
              className={`pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[7px] font-black text-white shadow-sm ${
                PLAN_TIER_CHIP_TONES[plan] ?? "bg-[#0a2a66]"
              }`}
            >
              {capitalize(plan)}
            </span>
          ) : null}

          {isProfileOpen ? (
            <div className="absolute right-0 top-14 w-60 rounded-[28px] border border-white/60 bg-slate-200 px-4 py-4 shadow-[0_18px_60px_rgba(7,24,59,0.16)]">
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0a2a66] text-white">
                  {profile.profilePictureUrl ? (
                    <Image
                      src={profile.profilePictureUrl}
                      alt=""
                      width={44}
                      height={44}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserIcon />
                  )}
                </span>
                <p className="min-w-0 truncate text-sm font-bold text-[#07183b]">{profile.name}</p>
                {isDemo ? (
                  <span className="ml-auto shrink-0 rounded-full bg-[#eef6ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0a2a66]">
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

              <div className="mt-1 grid gap-1">
                {isDemo ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileCardOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className="flex items-center gap-2.5 rounded-full px-4 py-3 text-left text-sm font-bold text-[#07183b] transition hover:bg-white/60"
                  >
                    <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                      id_card
                    </span>
                    View Profile
                  </button>
                )}
                {!isDemo && !isPlatformAdmin && plan ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      openPlanPicker();
                    }}
                    className="flex items-center gap-2.5 rounded-full px-4 py-3 text-left text-sm font-bold text-[#07183b] transition hover:bg-white/60"
                  >
                    <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                      diamond
                    </span>
                    <span className="min-w-0 flex-1 truncate">Your Plan</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
                        PLAN_TIER_CHIP_TONES[plan] ?? "bg-[#94a3b8]"
                      }`}
                    >
                      {capitalize(plan)}
                    </span>
                  </button>
                ) : null}
                {isDemo || isPlatformAdmin ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsContactSupportOpen(true);
                    }}
                    className="flex items-center gap-2.5 rounded-full px-4 py-3 text-left text-sm font-bold text-[#07183b] transition hover:bg-white/60"
                  >
                    <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">
                      contact_support
                    </span>
                    Contact Support
                  </button>
                )}
                {!isDemo && isPlatformAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsDeveloperContactOpen(true);
                    }}
                    className="flex items-center gap-2.5 rounded-full px-4 py-3 text-left text-sm font-bold text-[#07183b] transition hover:bg-white/60"
                  >
                    <span className="material-symbols-outlined text-lg text-[#94a3b8]" aria-hidden="true">deployed_code_account</span>
                    Contact Developer
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={isDemo ? exitDemo : signOut}
                  className="flex items-center gap-2.5 rounded-full px-4 py-3 text-left text-sm font-bold text-red-700 transition hover:bg-red-50/80"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    logout
                  </span>
                  {isDemo ? "Exit demo" : "Log Out"}
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
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    closeSearch();
                    return;
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    setActiveTab((current) => (current === "all" ? "actions" : "all"));
                    setHighlightedIndex(0);
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlightedIndex((current) => Math.min(current + 1, searchResults.length - 1));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlightedIndex((current) => Math.max(current - 1, 0));
                    return;
                  }
                  if (event.key === "Enter") {
                    const target = searchResults[highlightedIndex];
                    if (target) {
                      event.preventDefault();
                      runSearchResult(target);
                    }
                  }
                }}
                placeholder="Search everything..."
                className="h-6 min-w-0 flex-1 bg-transparent text-xl font-semibold text-[#07183b] outline-none placeholder:text-[#61708a]"
                aria-label="Search everything"
              />
              <button
                type="button"
                onClick={closeSearch}
                className="rounded-md border border-white/60 bg-white/20 px-3 py-2 text-sm font-bold text-[#52627a] hover:bg-white/40"
              >
                Esc
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-white/60 px-6 py-2.5">
              {[
                { key: "all", label: "All" },
                { key: "actions", label: "Actions" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setHighlightedIndex(0);
                    searchInputRef.current?.focus();
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    activeTab === tab.key
                      ? "bg-[#0D1E4C] text-white"
                      : "bg-white/30 text-[#52627a] hover:bg-white/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <span className="ml-1 rounded border border-white/60 bg-white/30 px-1.5 py-0.5 text-[10px] font-bold text-[#667085]">
                Tab
              </span>
              <span className="text-[11px] font-semibold text-[#667085]">to switch</span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
              <p className="px-3 py-2 text-sm font-bold text-[#52627a]">
                {activeTab === "actions" ? "Actions" : "Results"}
              </p>
              <div className="space-y-1">
              {searchResults.map((item, index) => (
                  <button
                    key={`${item.type}-${item.group}-${item.href}-${item.label}-${item.id ?? ""}`}
                    onClick={() => {
                      runSearchResult(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left ${
                      index === highlightedIndex ? "bg-white/50" : "hover:bg-white/35"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{item.label}</span>
                      {item.description ? (
                        <span className="block truncate text-xs font-semibold text-[#667085]">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.shortcut ? (
                        <span className="flex items-center gap-1 rounded-md border border-white/60 bg-white/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#52627a]">
                          G {item.shortcut}
                        </span>
                      ) : null}
                      <span className="text-sm font-semibold text-[#667085]">
                        {activeTab === "actions" ? item.group : item.type}
                      </span>
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

            <div className="flex flex-wrap items-center gap-4 border-t border-white/60 px-6 py-3 text-[11px] font-semibold text-[#667085]">
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/60 bg-white/40 px-1.5 py-0.5">↑↓</kbd> Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/60 bg-white/40 px-1.5 py-0.5">↵</kbd> Open
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/60 bg-white/40 px-1.5 py-0.5">G</kbd> then a letter to jump to a page from anywhere
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {isProfileCardOpen ? <ProfileDetailCard onClose={() => setIsProfileCardOpen(false)} /> : null}
      {isContactSupportOpen ? <ContactSupportModal onClose={() => setIsContactSupportOpen(false)} /> : null}
      {isDeveloperContactOpen ? <DeveloperContactModal onClose={() => setIsDeveloperContactOpen(false)} /> : null}
      {detailInquiryId ? (
        <TicketDetailModal
          inquiryId={detailInquiryId}
          variant="user"
          onClose={() => setDetailInquiryId(null)}
          onChanged={() => setDetailInquiryId(null)}
        />
      ) : null}
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
