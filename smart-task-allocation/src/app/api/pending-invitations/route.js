import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ invitations: [] });
    }

    const { data: pending, error } = await supabase
      .from("user_account")
      .select("user_id, email, created_at, invited_by, role:role_id(role_name)")
      .eq("organization_id", organizationId)
      .eq("account_status", "Pending")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const inviterIds = [...new Set((pending ?? []).map((account) => account.invited_by).filter(Boolean))];
    let inviterNameById = new Map();

    if (inviterIds.length) {
      const [{ data: inviterProfiles }, { data: inviterAccounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", inviterIds),
        supabase.from("user_account").select("user_id, username").in("user_id", inviterIds),
      ]);

      const usernameById = new Map((inviterAccounts ?? []).map((account) => [account.user_id, account.username]));
      inviterNameById = new Map(
        (inviterProfiles ?? []).map((profile) => [
          profile.user_id,
          profile.full_name || usernameById.get(profile.user_id) || "Unknown",
        ]),
      );

      inviterIds.forEach((id) => {
        if (!inviterNameById.has(id)) {
          inviterNameById.set(id, usernameById.get(id) || "Unknown");
        }
      });
    }

    const invitations = (pending ?? []).map((account) => ({
      userId: account.user_id,
      email: account.email,
      roleName: account.role?.role_name ?? null,
      createdAt: account.created_at,
      invitedByName: account.invited_by ? inviterNameById.get(account.invited_by) || "Unknown" : null,
    }));

    return NextResponse.json({ invitations });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const { data: target } = await supabase
      .from("user_account")
      .select("user_id, email, role_id, account_status")
      .eq("user_id", userId)
      .eq("organization_id", organizationId ?? "")
      .maybeSingle();

    if (!organizationId || !target || target.account_status !== "Pending") {
      return NextResponse.json({ error: "Pending invitation not found in your organization." }, { status: 404 });
    }

    const redirectTo = new URL("/accept-invite", request.url).toString();
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(target.email, {
      redirectTo,
      data: {
        role_id: target.role_id,
      },
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
