import { NextResponse } from "next/server";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error } = await getAuthenticatedUser(request, supabase);
    if (error || !user) return NextResponse.json({ error: error || "Unauthorized." }, { status: 401 });

    const [{ data: roles, error: rolesError }, { data: organizations, error: organizationsError }, { data: account }] =
      await Promise.all([
        supabase.from("role").select("role_id, role_name").order("role_name"),
        supabase.from("organization").select("organization_id, organization_name").order("organization_name"),
        supabase
          .from("user_account")
          .select("requested_role_id, requested_organization_id")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 400 });
    if (organizationsError) return NextResponse.json({ error: organizationsError.message }, { status: 400 });

    return NextResponse.json({
      email: user.email,
      roles: (roles ?? []).filter((role) => !isPlatformAdminRole(role.role_name)),
      organizations: organizations ?? [],
      requestedRoleId: account?.requested_role_id ?? null,
      requestedOrganizationId: account?.requested_organization_id ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error } = await getAuthenticatedUser(request, supabase);
    if (error || !user) return NextResponse.json({ error: error || "Unauthorized." }, { status: 401 });

    const { roleId, organizationId } = await request.json();
    if (!roleId || !organizationId) {
      return NextResponse.json({ error: "Please select both a role and an organization." }, { status: 400 });
    }

    const { data: existingAccount, error: lookupError } = await supabase
      .from("user_account")
      .select("user_id, username")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });

    let updateError;
    if (existingAccount) {
      ({ error: updateError } = await supabase
        .from("user_account")
        .update({
          requested_role_id: roleId,
          requested_organization_id: organizationId,
          account_status: "Pending",
        })
        .eq("user_id", user.id));
    } else {
      const cleanEmail = String(user.email || "").trim().toLowerCase();
      const baseUsername = (cleanEmail.split("@")[0] || "user").replace(/[^a-z0-9]/g, "") || "user";
      const username = `${baseUsername}_${crypto.randomUUID().slice(0, 6)}`;

      ({ error: updateError } = await supabase.from("user_account").insert({
        user_id: user.id,
        email: cleanEmail,
        username,
        // Store the selected values so schemas with non-null role/org keys
        // accept the row. Pending prevents workspace access until Platform
        // Admin confirms the assignment.
        role_id: roleId,
        organization_id: organizationId,
        requested_role_id: roleId,
        requested_organization_id: organizationId,
        account_status: "Pending",
      }));

      if (!updateError) {
        await supabase.from("profile").upsert(
          {
            profile_id: crypto.randomUUID(),
            user_id: user.id,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
            profile_picture_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          },
          { onConflict: "user_id" },
        );
      }
    }
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
