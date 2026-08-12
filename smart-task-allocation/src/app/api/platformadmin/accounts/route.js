import { NextResponse } from "next/server";
import { isPlatformAdminRole, requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);

    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: accounts, error: accountsError } = await supabase
      .from("user_account")
      .select(
        "user_id, username, email, account_status, organization_id, role:role_id(role_name), organization:organization_id(organization_name)",
      )
      .order("email", { ascending: true });

    if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 400 });

    const visibleAccounts = (accounts ?? []).filter(
      (account) => !isPlatformAdminRole(account.role?.role_name) && account.account_status !== "Pending",
    );
    const userIds = visibleAccounts.map((account) => account.user_id);
    let profileByUserId = new Map();

    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("profile")
        .select("user_id, job_title")
        .in("user_id", userIds);
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
      profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    }

    return NextResponse.json({
      accounts: visibleAccounts.map((account) => ({
        ...account,
        job_title: profileByUserId.get(account.user_id)?.job_title ?? null,
      })),
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
