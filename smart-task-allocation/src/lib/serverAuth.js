import { getHomeRouteForRole } from "@/lib/roleRoutes";

export async function getAuthenticatedUser(request, supabase) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) {
    return { error: "Authentication token is required." };
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { error: error?.message || "Authenticated user could not be loaded." };
  }

  return { user: data.user };
}

// Platform admins are developer-side, org-agnostic accounts (they manage the
// marketing site, not any organization), so they are excluded from the User
// Admin account listings.
export function isPlatformAdminRole(roleName) {
  return (
    typeof roleName === "string" &&
    roleName.toLowerCase().replace(/[^a-z]/g, "") === "platformadmin"
  );
}

// Resolve a role_id to whether it is the Platform Admin role, so User Admins
// can't create/assign it regardless of the account's display name.
export async function isPlatformAdminRoleId(supabase, roleId) {
  if (roleId == null) {
    return false;
  }

  const { data } = await supabase
    .from("role")
    .select("role_name")
    .eq("role_id", roleId)
    .maybeSingle();

  return isPlatformAdminRole(data?.role_name);
}

// Resolve the organization the requester belongs to. Used to scope every
// listing so an actor only ever sees users within their own organization.
export async function getRequesterOrganizationId(supabase, user) {
  const byId = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byId.data?.organization_id) {
    return byId.data.organization_id;
  }

  if (user.email) {
    const byEmail = await supabase
      .from("user_account")
      .select("organization_id")
      .eq("email", user.email)
      .maybeSingle();

    return byEmail.data?.organization_id ?? null;
  }

  return null;
}

export async function getUserHomeRoute(user, supabase) {
  const { data: accountByUserId, error: accountByUserIdError } = await supabase
    .from("user_account")
    .select("role_id, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountByUserIdError) {
    return { error: accountByUserIdError.message };
  }

  let account = accountByUserId;

  if (!account && user.email) {
    const { data: accountByEmail, error: accountByEmailError } = await supabase
      .from("user_account")
      .select("role_id, account_status")
      .eq("email", user.email)
      .maybeSingle();

    if (accountByEmailError) {
      return { error: accountByEmailError.message };
    }

    account = accountByEmail;
  }

  if (account?.role_id == null) {
    return { error: "No role is assigned to this user." };
  }

  if (String(account.account_status || "").toLowerCase() !== "active") {
    return { error: "This account is suspended or inactive." };
  }

  const { data: role, error: roleError } = await supabase
    .from("role")
    .select("role_name")
    .eq("role_id", account.role_id)
    .maybeSingle();

  if (roleError) {
    return { error: roleError.message };
  }

  return { homeRoute: getHomeRouteForRole(role?.role_name) };
}

export async function requireHomeRoute(request, supabase, allowedRoutes, message) {
  const { user, error } = await getAuthenticatedUser(request, supabase);

  if (error) {
    return { error };
  }

  const { homeRoute, error: routeError } = await getUserHomeRoute(user, supabase);

  if (routeError) {
    return { error: routeError };
  }

  if (!allowedRoutes.includes(homeRoute)) {
    return { error: message };
  }

  return { user, homeRoute };
}

export async function requireUserAdmin(request, supabase) {
  return requireHomeRoute(
    request,
    supabase,
    ["/useradmin/accounts"],
    "Only User Admin accounts can manage user administration.",
  );
}

export async function requireManager(request, supabase) {
  return requireHomeRoute(
    request,
    supabase,
    ["/manager"],
    "Only Manager accounts can manage workspaces and teams.",
  );
}

// Read-only org chart access for Manager's view-only Team page — editing
// (POST/PATCH/DELETE) stays on requireUserAdmin alone everywhere else.
export async function requireUserAdminOrManager(request, supabase) {
  return requireHomeRoute(
    request,
    supabase,
    ["/useradmin/accounts", "/manager"],
    "Only User Admin or Manager accounts can view the organization chart.",
  );
}

export async function requireEmployee(request, supabase) {
  return requireHomeRoute(
    request,
    supabase,
    ["/employee/workspace"],
    "Only Employee accounts can access employee work areas.",
  );
}

export async function requirePlatformAdmin(request, supabase) {
  return requireHomeRoute(
    request,
    supabase,
    ["/platformadmin/content"],
    "Only Platform Admin accounts can manage marketing site content.",
  );
}

export async function requireManagerOrEmployee(request, supabase) {
  return requireHomeRoute(
    request,
    supabase,
    ["/manager", "/employee/workspace"],
    "Only Manager or Employee accounts can access task-request workflows.",
  );
}
