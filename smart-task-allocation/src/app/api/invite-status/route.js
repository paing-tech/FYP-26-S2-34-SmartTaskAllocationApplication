import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Public, unauthenticated lookup used by the unified "Join your organization"
// signup form. Given an invited work email, reports whether an invitation
// exists, its status, and the organization name so the form can greet the user
// with "Welcome to {Organization}". Returns nothing sensitive.
export async function POST(request) {
  try {
    const { email } = await request.json();
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!cleanEmail) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_account")
      .select("account_status, organization_id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let organizationName = null;
    if (data?.organization_id) {
      const { data: org } = await supabase
        .from("organization")
        .select("organization_name")
        .eq("organization_id", data.organization_id)
        .maybeSingle();
      organizationName = org?.organization_name ?? null;
    }

    return NextResponse.json({
      found: Boolean(data),
      status: data?.account_status ?? null,
      organizationName,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
