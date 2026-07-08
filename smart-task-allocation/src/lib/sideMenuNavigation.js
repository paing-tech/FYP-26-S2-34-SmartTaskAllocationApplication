export const sideMenuNavigation = {
  useradmin: {
    label: "User Admin",
    homeHref: "/useradmin/accounts",
    items: [
      { label: "Accounts", href: "/useradmin/accounts", icon: "users" },
      { label: "Organization", href: "/useradmin/organization", icon: "organization" },
      { label: "Roles", href: "/useradmin/roles", icon: "settings" },
      { label: "Agents", href: "/useradmin/agents", icon: "agents" },
    ],
  },
  manager: {
    label: "Manager",
    homeHref: "/manager/workspace",
    items: [
      { label: "Workspace", href: "/manager/workspace", icon: "workspace" },
      { label: "Team", href: "/manager/team", icon: "users" },
      { label: "Organization", href: "/manager/organization", icon: "organization" },
      { label: "Inbox", href: "/manager/inbox", icon: "inbox" },
      { label: "My Space", href: "/manager/my-space", icon: "home" },
      { label: "Archive", href: "/manager/archive", icon: "archive" },
      { label: "Agents", href: "/manager/agents", icon: "agents" },
      { label: "Support", href: "/manager/support", icon: "support" },
    ],
  },
  employee: {
    label: "Employee",
    homeHref: "/employee/workspace",
    items: [
      { label: "Workspace", href: "/employee/workspace", icon: "workspace" },
      { label: "Team", href: "/employee/team", icon: "users" },
      { label: "Inbox", href: "/employee/inbox", icon: "inbox" },
      { label: "My Space", href: "/employee/my-space", icon: "home" },
      { label: "Agents", href: "/employee/agents", icon: "agents" },
      { label: "Support", href: "/employee/support", icon: "support" },
    ],
  },
  platformadmin: {
    label: "Platform Admin",
    homeHref: "/platformadmin",
    items: [
      { label: "Home", href: "/platformadmin", icon: "home" },
      { label: "Agents", href: "/platformadmin/agents", icon: "agents" },
    ],
  },
};
