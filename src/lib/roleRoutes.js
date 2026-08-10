const ROLE_ROUTES = {
  platformadmin: "/platformadmin/content",
  platform_admin: "/platformadmin/content",
  "platform admin": "/platformadmin/content",
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
