export const sideMenuNavigation = {
  useradmin: {
    label: "User Admin",
    homeHref: "/useradmin/accounts",
    items: [
      { label: "Dashboard", href: "/useradmin/accounts", icon: "tile_large" },
      { label: "Organization", href: "/useradmin/organization", icon: "organization" },
      { label: "Workforce", href: "/useradmin/workforce", icon: "groups" },
      { label: "Insights", href: "/useradmin/insights", icon: "insights" },
      { label: "Settings", href: "/useradmin/settings", icon: "settings" },
      { label: "Agent", href: "/useradmin/agents", icon: "agents" },
    ],
  },
  manager: {
    label: "Manager",
    homeHref: "/manager/workspace",
    items: [
      { label: "Workspace", href: "/manager/workspace", icon: "workspace" },
      { label: "Team", href: "/manager/team", icon: "groups" },
      { label: "Attendance", href: "/manager/attendance", icon: "attendance" },
      { label: "Agent", href: "/manager/agents", icon: "agents" },
    ],
  },
  employee: {
    label: "Employee",
    homeHref: "/employee/workspace",
    items: [
      { label: "Tasks", href: "/employee/workspace", icon: "workspace" },
      { label: "Team", href: "/employee/team", icon: "groups" },
      { label: "Attendance", href: "/employee/attendance", icon: "attendance" },
      { label: "Agent", href: "/employee/agents", icon: "agents" },
    ],
  },
  platformadmin: {
    label: "Platform Admin",
    homeHref: "/platformadmin/dashboard",
    items: [
      { label: "Dashboard", href: "/platformadmin/dashboard", icon: "tile_large" },
      { label: "Content", href: "/platformadmin/content", icon: "content" },
      { label: "Agent", href: "/platformadmin/agents", icon: "agents" },
      { label: "Features", href: "/platformadmin/features", icon: "settings" },
    ],
  },
};
