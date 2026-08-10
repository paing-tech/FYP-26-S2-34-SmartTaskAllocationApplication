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

    const { email, username, password, roleId } = await request.json();
    const cleanEmail = cleanString(email).toLowerCase();
    const cleanUsername = cleanString(username);
    const cleanPassword = cleanString(password);
    const numericRoleId = Number(roleId);
    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ error: "Your account is not assigned to an organization." }, { status: 400 });
    }

    if (
      !cleanEmail ||
      !cleanUsername ||
      cleanPassword.length < 6 ||
      !Number.isInteger(numericRoleId)
    ) {
      return NextResponse.json(
        { error: "Email, username, password, and role are required." },
        { status: 400 },
      );
    }

    if (await isPlatformAdminRoleId(supabase, numericRoleId)) {
      return NextResponse.json(
        { error: "User Admins cannot create Platform Admin accounts." },
        { status: 403 },
      );
    }

    const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        role_id: numericRoleId,
      },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const createdUserId = createdData.user?.id;

    if (!createdUserId) {
      return NextResponse.json(
        { error: "Supabase did not return a created user ID." },
        { status: 400 },
      );
    }

    const { error: accountError } = await supabase.from("user_account").upsert(
      {
        user_id: createdUserId,
        role_id: numericRoleId,
        organization_id: organizationId,
        username: cleanUsername,
        email: cleanEmail,
        account_status: "Active",
      },
      { onConflict: "user_id" },
    );

    if (accountError) {
      await supabase.auth.admin.deleteUser(createdUserId);
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
