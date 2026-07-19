import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getAccount(supabase, user) {
  const { data, error } = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data) {
    return { account: data, error };
  }

  const byEmail = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("email", user.email)
    .maybeSingle();

  return { account: byEmail.data, error: byEmail.error };
}

function normalizeAccount(account, profilesByUserId) {
  const profile = profilesByUserId.get(account.user_id) ?? {};
  const fullName = cleanString(profile.full_name) || account.username || account.email;

  return {
    ...account,
    full_name: fullName,
    profile_picture_url: profile.profile_picture_url ?? "",
    phone_number: profile.phone_number ?? "",
    bio: profile.bio ?? "",
  };
}

async function getOrganizationAccounts(supabase, organizationId) {
  const { data: accounts, error: accountsError } = await supabase
    .from("user_account")
    .select(
      "user_id, username, email, account_status, organization_id, department_id, role:role_id(role_name), department:department_id(department_name)",
    )
    .eq("organization_id", organizationId)
    .order("username", { ascending: true });

  if (accountsError) {
    return { error: accountsError };
  }

  const userIds = (accounts ?? []).map((account) => account.user_id);

  if (!userIds.length) {
    return { accounts: [] };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profile")
    .select("user_id, full_name, phone_number, bio, profile_picture_url")
    .in("user_id", userIds);

  if (profilesError) {
    return { error: profilesError };
  }

  const profilesByUserId = new Map(
    (profiles ?? []).map((profile) => [profile.user_id, profile]),
  );

  return {
    accounts: (accounts ?? []).map((account) =>
      normalizeAccount(account, profilesByUserId),
    ),
  };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!account?.organization_id) {
      return NextResponse.json({
        organization: null,
        departments: [],
        accounts: [],
        currentUserId: account?.user_id ?? null,
      });
    }

    const [
      { data: organization, error: organizationError },
      { data: departments, error: departmentsError },
      accountsResult,
    ] = await Promise.all([
      supabase
        .from("organization")
        .select("*")
        .eq("organization_id", account.organization_id)
        .maybeSingle(),
      supabase
        .from("department")
        .select("department_id, organization_id, department_name, description")
        .eq("organization_id", account.organization_id)
        .order("department_name", { ascending: true }),
      getOrganizationAccounts(supabase, account.organization_id),
    ]);

    if (organizationError) {
      return NextResponse.json({ error: organizationError.message }, { status: 400 });
    }

    if (departmentsError) {
      return NextResponse.json({ error: departmentsError.message }, { status: 400 });
    }

    if (accountsResult.error) {
      return NextResponse.json({ error: accountsResult.error.message }, { status: 400 });
    }

    return NextResponse.json({
      organization,
      departments: departments ?? [],
      accounts: accountsResult.accounts ?? [],
      currentUserId: account.user_id,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
