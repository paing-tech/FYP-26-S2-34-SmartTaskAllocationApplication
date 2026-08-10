import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const USER_ADMIN_NAMES = ["useradmin", "user_admin", "user admin"];

// Find an existing Auth user by email (paginated; Supabase has no direct
// email filter). Used to adopt orphaned Auth users that have no user_account.
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

// Public self-serve admin registration. Unlike supabase.auth.signUp (which only
// creates an Auth user), this also inserts the matching user_account row with
// the User Admin role so the new admin can actually sign in and route correctly.
// The organization is left null — the admin sets it up after first login.
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

    // Reject duplicates up front so the user gets a clear message.
    const { data: existing } = await supabase
      .from("user_account")
      .select("user_id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "You're already registered. Please sign in to continue." },
        { status: 409 },
      );
    }

    // Resolve the User Admin role id from the role table by name.
    const { data: roles, error: rolesError } = await supabase
      .from("role")
      .select("role_id, role_name");

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 400 });
    }

    const adminRole = (roles ?? []).find((role) =>
      USER_ADMIN_NAMES.includes(cleanString(role.role_name).toLowerCase()),
    );

    if (!adminRole) {
      return NextResponse.json(
        { error: "User Admin role is not configured. Contact support." },
        { status: 400 },
      );
    }

    // Create the Auth user, auto-confirmed so they can sign in immediately.
    const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
        signup_intent: "admin",
      },
    });

    let createdUserId = createdData?.user?.id;

    if (createError) {
      // The Auth user may already exist but be orphaned (no user_account row) —
      // e.g. created by an earlier signUp. Adopt it: reset password, confirm,
      // and continue to create the missing user_account below.
      if (/already|exists/i.test(createError.message)) {
        const existingAuthUser = await findAuthUserByEmail(supabase, cleanEmail);

        if (!existingAuthUser) {
          return NextResponse.json(
            { error: "You're already registered. Please sign in to continue." },
            { status: 409 },
          );
        }

        createdUserId = existingAuthUser.id;
        await supabase.auth.admin.updateUserById(createdUserId, {
          password: cleanPassword,
          email_confirm: true,
          user_metadata: { full_name: cleanFullName, signup_intent: "admin" },
        });
      } else {
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }
    }

    if (!createdUserId) {
      return NextResponse.json(
        { error: "Supabase did not return a created user ID." },
        { status: 400 },
      );
    }

    // Derive a unique username from the email local part.
    const baseUsername = cleanEmail.split("@")[0] || "admin";
    const username = `${baseUsername}_${crypto.randomUUID().slice(0, 6)}`;

    const { error: accountError } = await supabase.from("user_account").upsert(
      {
        user_id: createdUserId,
        role_id: adminRole.role_id,
        organization_id: null,
        username,
        email: cleanEmail,
        account_status: "Active",
      },
      { onConflict: "user_id" },
    );

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    // Store the full name on the profile so it shows across the admin pages.
    if (cleanFullName) {
      await supabase.from("profile").upsert(
        {
          profile_id: crypto.randomUUID(),
          user_id: createdUserId,
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
