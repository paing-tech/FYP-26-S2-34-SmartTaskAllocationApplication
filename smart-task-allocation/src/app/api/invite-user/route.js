import { NextResponse } from "next/server";
import { getRequesterOrganizationId, isPlatformAdminRoleId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { email, roleId } = await request.json();
    const cleanEmail = cleanString(email).toLowerCase();
    const temporaryUsername = `pending_${crypto.randomUUID()}`;
    const numericRoleId = Number(roleId);
    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ error: "Your account is not assigned to an organization." }, { status: 400 });
    }

    if (!cleanEmail || !Number.isInteger(numericRoleId)) {
      return NextResponse.json(
        { error: "Email and role are required." },
        { status: 400 },
      );
    }

    if (await isPlatformAdminRoleId(supabase, numericRoleId)) {
      return NextResponse.json(
        { error: "User Admins cannot invite Platform Admin accounts." },
        { status: 403 },
      );
    }

    const redirectTo = new URL("/accept-invite", request.url).toString();
    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo,
        data: {
          role_id: numericRoleId,
        },
      });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const invitedUserId = inviteData.user?.id;

    if (!invitedUserId) {
      return NextResponse.json(
        { error: "Supabase did not return an invited user ID." },
        { status: 400 },
      );
    }

    const { error: accountError } = await supabase.from("user_account").upsert(
      {
        user_id: invitedUserId,
        role_id: numericRoleId,
        organization_id: organizationId,
        username: temporaryUsername,
        email: cleanEmail,
        account_status: "Pending",
      },
      { onConflict: "user_id" },
    );

    if (accountError) {
      await supabase.auth.admin.deleteUser(invitedUserId);
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
