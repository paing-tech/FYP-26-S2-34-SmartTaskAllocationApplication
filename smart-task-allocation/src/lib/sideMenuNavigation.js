// `shortcut` is a single letter used by the global "G, <letter>" jump
// shortcut in TopInformationBar (press G then this key to navigate straight
// there). Only needs to be unique within each actor's own item list.
export const sideMenuNavigation = {
  useradmin: {
    label: "User Admin",
    homeHref: "/useradmin/accounts",
    items: [
      { label: "Dashboard", href: "/useradmin/accounts", icon: "tile_large", shortcut: "d" },
      { label: "Organization", href: "/useradmin/organization", icon: "organization", shortcut: "o" },
      { label: "Workforce", href: "/useradmin/workforce", icon: "groups", shortcut: "w" },
      { label: "Insights", href: "/useradmin/insights", icon: "insights", shortcut: "i" },
      { label: "Agent", href: "/useradmin/agents", icon: "agents", shortcut: "a" },
    ],
  },
  manager: {
    label: "Manager",
    homeHref: "/manager/workspace",
    items: [
      { label: "Workspace", href: "/manager/workspace", icon: "workspace", shortcut: "w" },
      { label: "Team", href: "/manager/team", icon: "groups", shortcut: "t" },
      { label: "Attendance", href: "/manager/attendance", icon: "attendance", shortcut: "a" },
      { label: "Agent", href: "/manager/agents", icon: "agents", shortcut: "g" },
    ],
  },
  employee: {
    label: "Employee",
    homeHref: "/employee/workspace",
    items: [
      { label: "Tasks", href: "/employee/workspace", icon: "workspace", shortcut: "t" },
      { label: "Team", href: "/employee/team", icon: "groups", shortcut: "e" },
      { label: "Attendance", href: "/employee/attendance", icon: "attendance", shortcut: "a" },
      { label: "Agent", href: "/employee/agents", icon: "agents", shortcut: "g" },
    ],
  },
  platformadmin: {
    label: "Platform Admin",
    homeHref: "/platformadmin/dashboard",
    items: [
      { label: "Dashboard", href: "/platformadmin/dashboard", icon: "tile_large", shortcut: "d" },
      { label: "Content", href: "/platformadmin/content", icon: "content", shortcut: "c" },
      { label: "Agent", href: "/platformadmin/agents", icon: "agents", shortcut: "a" },
      { label: "Features", href: "/platformadmin/features", icon: "settings", shortcut: "f" },
      { label: "Support", href: "/platformadmin/support", icon: "mail", shortcut: "s" },
    ],
  },
};
