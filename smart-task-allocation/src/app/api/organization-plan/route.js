import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId, requireUserAdminOrManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const VALID_PLANS = ["starter", "pro", "team"];

// Read access is broad (any signed-in org member) since every role's UI
// needs to know the org's plan to decide what's gated — only *changing*
// the plan is restricted below.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ plan: null });
    }

    const { data: organization, error } = await supabase
      .from("organization")
      .select("plan")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ plan: organization?.plan ?? "starter" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// No real payment processor exists in this app, so "upgrading" just sets
// this column directly — a Manager or User Admin can self-serve change
// their org's plan on the spot.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdminOrManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ error: "You must belong to an organization to change its plan." }, { status: 400 });
    }

    const { plan } = await request.json();

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: "Plan must be one of: starter, pro, team." }, { status: 400 });
    }

    const { error } = await supabase
      .from("organization")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
