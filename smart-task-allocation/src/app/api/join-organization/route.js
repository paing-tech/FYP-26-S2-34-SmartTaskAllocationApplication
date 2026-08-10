import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const EMPLOYEE_NAMES = ["employee", "staff", "worker"];

// Find an existing Auth user by email (paginated; Supabase has no email filter).
async function findAuthUserByEmail(supabase, email) {
  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(
      (user) => (user.email || "").toLowerCase() === email,
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

// Public completion of an invitation. The user types their invited work email,
// full name, and a password; this activates the Pending account the admin
// created (keeping its invited role + organization) and sets the password so
// they can sign in. Used by both the website "Join" flow and the email link.
export async function POST(request) {
  try {
    const { fullName, email, password } = await request.json();
    const cleanEmail = cleanString(email).toLowerCase();
    const cleanFullName = cleanString(fullName);
    const cleanPassword = cleanString(password);

    if (!cleanEmail || cleanPassword.length < 6) {
      return NextResponse.json(
        { error: "Email and a password of at least 6 characters are required." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient();

    // The invitation lives as a user_account row created by the admin.
    const { data: account, error: accountLookupError } = await supabase
      .from("user_account")
      .select("user_id, role_id, organization_id, account_status")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (accountLookupError) {
      return NextResponse.json({ error: accountLookupError.message }, { status: 400 });
    }

    if (!account) {
      return NextResponse.json(
        { error: "We couldn't find an invitation for that email. Ask your admin to invite you." },
        { status: 404 },
      );
    }

    if (account.account_status === "Active") {
      return NextResponse.json(
        { error: "This account is already active. Please sign in instead." },
        { status: 409 },
      );
    }

    // Use the invited role if present; otherwise fall back to Employee.
    let roleId = account.role_id;
    if (roleId == null) {
      const { data: roles } = await supabase.from("role").select("role_id, role_name");
      const employeeRole = (roles ?? []).find((role) =>
        EMPLOYEE_NAMES.includes(cleanString(role.role_name).toLowerCase()),
      );
      roleId = employeeRole?.role_id ?? null;
    }

    // Resolve/repair the Auth user (created by inviteUserByEmail) and set the
    // password so they can sign in immediately.
    let authUserId = account.user_id;
    let authUser = authUserId
      ? (await supabase.auth.admin.getUserById(authUserId)).data?.user
      : null;

    if (!authUser) {
      authUser = await findAuthUserByEmail(supabase, cleanEmail);
      authUserId = authUser?.id ?? null;
    }

    if (authUser) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: cleanPassword,
        email_confirm: true,
        user_metadata: { full_name: cleanFullName },
      });
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
      authUserId = authUser.id;
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: { full_name: cleanFullName },
      });
      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }
      authUserId = created.user?.id ?? null;
    }

    if (!authUserId) {
      return NextResponse.json(
        { error: "Could not resolve the invited user." },
        { status: 400 },
      );
    }

    // Activate the account: give it a real username, keep role + organization.
    const baseUsername = cleanEmail.split("@")[0] || "member";
    const username = `${baseUsername}_${crypto.randomUUID().slice(0, 6)}`;

    const { error: activateError } = await supabase
      .from("user_account")
      .update({
        user_id: authUserId,
        role_id: roleId,
        username,
        account_status: "Active",
      })
      .eq("email", cleanEmail);

    if (activateError) {
      return NextResponse.json({ error: activateError.message }, { status: 400 });
    }

    // Store the full name on the profile so it shows across the admin pages.
    if (cleanFullName) {
      await supabase.from("profile").upsert(
        {
          profile_id: crypto.randomUUID(),
          user_id: authUserId,
          full_name: cleanFullName,
        },
        { onConflict: "user_id" },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
