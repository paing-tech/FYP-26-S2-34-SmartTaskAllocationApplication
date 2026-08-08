export const sideMenuNavigation = {
  useradmin: {
    label: "User Admin",
    homeHref: "/useradmin/accounts",
    items: [
      { label: "Dashboard", href: "/useradmin/accounts", icon: "tile_large" },
      { label: "Organization", href: "/useradmin/organization", icon: "organization" },
      { label: "Agents", href: "/useradmin/agents", icon: "agents" },
    ],
  },
  manager: {
    label: "Manager",
    homeHref: "/manager/workspace",
    items: [
      { label: "Workspace", href: "/manager/workspace", icon: "workspace" },
      { label: "Team", href: "/manager/team", icon: "organization" },
      { label: "Attendance", href: "/manager/attendance", icon: "attendance" },
      { label: "Archive", href: "/manager/archive", icon: "archive" },
      { label: "Agents", href: "/manager/agents", icon: "agents" },
      { label: "Support", href: "/manager/support", icon: "support" },
    ],
  },
  employee: {
    label: "Employee",
    homeHref: "/employee/workspace",
    items: [
      { label: "Tasks", href: "/employee/workspace", icon: "workspace" },
      { label: "Agents", href: "/employee/agents", icon: "agents" },
      { label: "Support", href: "/employee/support", icon: "support" },
    ],
  },
  platformadmin: {
    label: "Platform Admin",
    homeHref: "/platformadmin/content",
    items: [
      { label: "Content", href: "/platformadmin/content", icon: "content" },
      { label: "Agents", href: "/platformadmin/agents", icon: "agents" },
      { label: "Features", href: "/platformadmin/features", icon: "settings" },
    ],
  },
};
