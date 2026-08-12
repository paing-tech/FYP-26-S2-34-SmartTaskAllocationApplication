import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Feeds the Workforce page's person picker — every active Manager and
// Employee in the org, split into the two sections the panel renders.
// Platform/User Admin accounts aren't people this page tracks performance
// for, so they're excluded rather than showing up as an odd third bucket.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ managers: [], employees: [] });
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("user_account")
      .select("user_id, role:role_id(role_name)")
      .eq("organization_id", organizationId)
      .eq("account_status", "Active");

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 400 });
    }

    const managerIds = [];
    const employeeIds = [];

    for (const account of accounts ?? []) {
      const roleName = String(account.role?.role_name || "").toLowerCase();
      if (roleName === "manager") managerIds.push(account.user_id);
      else if (roleName === "employee") employeeIds.push(account.user_id);
    }

    const allIds = [...managerIds, ...employeeIds];
    let profileByUserId = new Map();

    if (allIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profile")
        .select("user_id, full_name, profile_picture_url")
        .in("user_id", allIds);

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 400 });
      }

      profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    }

    function toPerson(userId, role) {
      const profile = profileByUserId.get(userId);
      return {
        userId,
        role,
        fullName: profile?.full_name || "Unnamed",
        avatarUrl: profile?.profile_picture_url ?? null,
      };
    }

    const byName = (a, b) => a.fullName.localeCompare(b.fullName);

    return NextResponse.json({
      managers: managerIds.map((userId) => toPerson(userId, "manager")).sort(byName),
      employees: employeeIds.map((userId) => toPerson(userId, "employee")).sort(byName),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
