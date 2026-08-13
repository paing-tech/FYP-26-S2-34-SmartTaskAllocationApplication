import { NextResponse } from "next/server";
import { isPlatformAdminRole, isPlatformAdminRoleId, requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function listAllAuthUsers(supabase) {
  const users = [];
  const perPage = 200;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return { users: [], error };
    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
  }

  return { users, error: null };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);

    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: accounts, error: accountsError } = await supabase
      .from("user_account")
      .select(
        "user_id, username, email, account_status, organization_id, requested_role_id, requested_organization_id, created_at, role:role_id(role_name), organization:organization_id(organization_name, plan)",
      )
      .order("email", { ascending: true });

    if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 400 });

    const visibleAccounts = (accounts ?? []).filter(
      (account) =>
        !isPlatformAdminRole(account.role?.role_name) &&
        (account.account_status !== "Pending" ||
          (account.requested_role_id != null && account.requested_organization_id != null)),
    );

    // Unlike User Admin (scoped to one org's handful of accounts), this
    // spans every organization — an .in("user_id", userIds) filter here
    // built a query string tens of thousands of characters long, which
    // Supabase's gateway can't handle and reliably failed the request.
    // Fetching the whole (small) profile table and mapping locally avoids
    // that ceiling entirely.
    const [
      { data: profiles, error: profileError },
      { data: roles, error: rolesError },
      { data: organizations, error: organizationsError },
      { users: authUsers, error: authUsersError },
    ] =
      await Promise.all([
        supabase.from("profile").select("user_id, job_title"),
        supabase.from("role").select("role_id, role_name"),
        supabase.from("organization").select("organization_id, organization_name").order("organization_name", { ascending: true }),
        listAllAuthUsers(supabase),
      ]);

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
    if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 400 });
    if (organizationsError) return NextResponse.json({ error: organizationsError.message }, { status: 400 });
    if (authUsersError) return NextResponse.json({ error: authUsersError.message }, { status: 400 });

    const profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    const assignableRoles = (roles ?? []).filter((role) => !isPlatformAdminRole(role.role_name));
    const accountByUserId = new Map((accounts ?? []).map((account) => [account.user_id, account]));
    const orphanedAuthAccounts = authUsers
      .filter((user) => user.email && !accountByUserId.has(user.id))
      .map((user) => ({
        user_id: user.id,
        username: (user.email.split("@")[0] || "user").toLowerCase(),
        email: user.email,
        // UI-only derived state for an Auth user with no account row yet.
        account_status: "Unassigned",
        organization_id: null,
        requested_role_id: null,
        requested_organization_id: null,
        created_at: user.created_at,
        role: null,
        organization: null,
        job_title: null,
        auth_only: true,
      }));

    return NextResponse.json({
      accounts: [
        ...visibleAccounts.map((account) => ({
          ...account,
          // Unassigned is derived whenever either required assignment is absent.
          account_status:
            account.account_status === "Pending" || !account.role?.role_name || !account.organization_id
              ? "Unassigned"
              : account.account_status,
          job_title: profileByUserId.get(account.user_id)?.job_title ?? null,
        })),
        ...orphanedAuthAccounts,
      ].sort((a, b) => a.email.localeCompare(b.email)),
      roles: assignableRoles,
      organizations: organizations ?? [],
    });
  } catch (error) {
    // A bare "fetch failed" hides the actual reason (DNS, timeout, TLS,
    // refused connection, ...) — Node/undici nests it in error.cause, which
    // the default error.message drops. Surface it so this is diagnosable
    // from the browser instead of needing terminal access.
    const causeMessage = error.cause?.message || error.cause?.code;
    return NextResponse.json(
      { error: causeMessage ? `${error.message}: ${causeMessage}` : error.message },
      { status: 500 },
    );
  }
}

// Assigns a role + organization to an account that has neither — the state
// a Google/Microsoft sign-in with no prior invite lands in (see
// provisionUnassignedAccount in serverAuth.js). Flips it to Active once set.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { userId, roleId, organizationId, email } = await request.json();
    if (!userId || !roleId || !organizationId) {
      return NextResponse.json({ error: "A user, role, and organization are all required." }, { status: 400 });
    }

    const isPlatformAdminTarget = await isPlatformAdminRoleId(supabase, roleId);
    if (isPlatformAdminTarget) {
      return NextResponse.json({ error: "Platform Admin cannot be assigned from here." }, { status: 400 });
    }

    const { data: existingAccount, error: lookupError } = await supabase
      .from("user_account")
      .select("user_id, username")
      .eq("user_id", userId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });

    const cleanEmail = String(email || "").trim().toLowerCase();
    const username =
      existingAccount?.username ||
      `${(cleanEmail.split("@")[0] || "user").replace(/[^a-z0-9]/g, "") || "user"}_${crypto.randomUUID().slice(0, 6)}`;

    const { error: updateError } = await supabase.from("user_account").upsert(
      {
        user_id: userId,
        username,
        email: cleanEmail,
        role_id: roleId,
        organization_id: organizationId,
        account_status: "Active",
        requested_role_id: null,
        requested_organization_id: null,
      },
      { onConflict: "user_id" },
    );

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    if (!existingAccount) {
      const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
      const authUser = authUserData?.user;
      const fullName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || null;
      const avatarUrl = authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture || null;
      await supabase.from("profile").upsert(
        {
          profile_id: crypto.randomUUID(),
          user_id: userId,
          full_name: fullName,
          profile_picture_url: avatarUrl,
        },
        { onConflict: "user_id" },
      );
    }

    if (email) {
      await supabase.from("platform_activity_log").insert({ organization_id: organizationId, type: "joined", emails: [email] });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
