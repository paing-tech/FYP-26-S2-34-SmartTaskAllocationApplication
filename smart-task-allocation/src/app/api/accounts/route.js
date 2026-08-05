import { NextResponse } from "next/server";
import {
  getRequesterOrganizationId,
  isPlatformAdminRole,
  isPlatformAdminRoleId,
  requireUserAdmin,
} from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    // Scope to the requester's organization — never expose accounts from others.
    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ accounts: [] });
    }

    const { data, error } = await supabase
      .from("user_account")
      .select(
        "user_id, username, email, account_status, role_id, organization_id, department_id, role:role_id(role_name), organization:organization_id(organization_name), department:department_id(department_name)",
      )
      .eq("organization_id", organizationId)
      .order("role_id", { ascending: true })
      .order("username", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Platform admins are not part of any organization's user management.
    const accounts = (data ?? []).filter(
      (account) => !isPlatformAdminRole(account.role?.role_name),
    );

    // full_name lives in the profile table (1:1 with user_account) — fetch and merge.
    const userIds = accounts.map((account) => account.user_id);
    let profilesByUserId = new Map();

    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("profile")
        .select("user_id, full_name, job_title, phone_number, profile_picture_url")
        .in("user_id", userIds);

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }

      profilesByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    }

    const accountsWithProfile = accounts.map((account) => ({
      ...account,
      full_name: profilesByUserId.get(account.user_id)?.full_name ?? null,
      job_title: profilesByUserId.get(account.user_id)?.job_title ?? null,
      phone_number: profilesByUserId.get(account.user_id)?.phone_number ?? null,
      profile_picture_url: profilesByUserId.get(account.user_id)?.profile_picture_url ?? null,
    }));

    return NextResponse.json({ accounts: accountsWithProfile });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { userId, username, email, roleId, organizationId, accountStatus } =
      await request.json();

    // The admin may only modify accounts inside their own organization, and
    // never a Platform Admin account.
    const requesterOrgId = await getRequesterOrganizationId(supabase, user);
    const { data: target } = await supabase
      .from("user_account")
      .select("user_id, role:role_id(role_name)")
      .eq("user_id", userId)
      .eq("organization_id", requesterOrgId ?? "")
      .maybeSingle();

    if (!requesterOrgId || !target || isPlatformAdminRole(target.role?.role_name)) {
      return NextResponse.json(
        { error: "Account not found in your organization." },
        { status: 404 },
      );
    }

    // Don't let a User Admin promote anyone into the Platform Admin role.
    if (roleId !== undefined && (await isPlatformAdminRoleId(supabase, Number(roleId)))) {
      return NextResponse.json(
        { error: "User Admins cannot assign the Platform Admin role." },
        { status: 403 },
      );
    }

    const updates = {};

    if (username !== undefined) {
      updates.username = cleanString(username);
    }

    if (email !== undefined) {
      updates.email = cleanString(email).toLowerCase();
    }

    if (roleId !== undefined) {
      updates.role_id = Number(roleId);
    }

    if (organizationId !== undefined) {
      updates.organization_id = cleanString(organizationId) || null;
    }

    if (accountStatus !== undefined) {
      updates.account_status = cleanString(accountStatus);
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("user_account")
      .update(updates)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    // The admin may only delete accounts inside their own organization, and
    // never a Platform Admin account.
    const requesterOrgId = await getRequesterOrganizationId(supabase, user);
    const { data: target } = await supabase
      .from("user_account")
      .select("user_id, role:role_id(role_name)")
      .eq("user_id", userId)
      .eq("organization_id", requesterOrgId ?? "")
      .maybeSingle();

    if (!requesterOrgId || !target || isPlatformAdminRole(target.role?.role_name)) {
      return NextResponse.json(
        { error: "Account not found in your organization." },
        { status: 404 },
      );
    }

    const { error: accountError } = await supabase
      .from("user_account")
      .delete()
      .eq("user_id", userId);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      return NextResponse.json({ error: authDeleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
