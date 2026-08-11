const ROLE_ROUTES = {
  platformadmin: "/platformadmin/dashboard",
  platform_admin: "/platformadmin/dashboard",
  "platform admin": "/platformadmin/dashboard",
  useradmin: "/useradmin/accounts",
  user_admin: "/useradmin/accounts",
  "user admin": "/useradmin/accounts",
  manager: "/manager",
  employee: "/employee/workspace",
};

export function getHomeRouteForRole(roleName) {
  if (!roleName) {
    return null;
  }

  const normalizedRole = roleName.trim().toLowerCase();
  return ROLE_ROUTES[normalizedRole] ?? null;
}
