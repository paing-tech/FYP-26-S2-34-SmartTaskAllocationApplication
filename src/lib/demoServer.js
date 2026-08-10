// Server-side helpers for the ephemeral /demo experience. Every demo account is
// tagged with user_metadata.demo === true so role-switching and teardown can
// only ever touch throwaway accounts, never a real user.

const ROLE_ALIASES = {
  useradmin: ["useradmin", "user_admin", "user admin"],
  manager: ["manager"],
  employee: ["employee"],
};

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// Map { useradmin, manager, employee } → role_id from the global role table.
export async function resolveRoleIds(supabase) {
  const { data: roles, error } = await supabase.from("role").select("role_id, role_name");
  if (error) {
    throw new Error(error.message);
  }

  const ids = {};
  for (const [key, aliases] of Object.entries(ROLE_ALIASES)) {
    const match = (roles ?? []).find((role) => aliases.includes(normalize(role.role_name)));
    if (match) {
      ids[key] = match.role_id;
    }
  }
  return ids;
}

export function roleKeyToHome(roleKey) {
  if (roleKey === "useradmin") return "/useradmin/accounts";
  if (roleKey === "employee") return "/employee/workspace";
  return "/manager/workspace";
}

// Resolve the authenticated user from a Bearer token and confirm it is a demo
// account. Returns { user, account } or { error }.
export async function requireDemoUser(request, supabase) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return { error: "Authentication token is required." };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: error?.message || "Could not load the demo user." };
  }

  if (data.user.user_metadata?.demo !== true) {
    return { error: "This action is only available to demo accounts." };
  }

  const { data: account } = await supabase
    .from("user_account")
    .select("user_id, organization_id, role_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return { user: data.user, account: account ?? null };
}
