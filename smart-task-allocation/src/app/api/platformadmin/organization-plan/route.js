import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const VALID_PLANS = ["starter", "pro", "team"];

// A change into or out of the "team" tier is the only plan change worth
// logging — that's the tier that turns team-wide collaboration features on
// or off for everyone, unlike a Starter<->Pro change. Logged against the
// organization itself (by name, not a member email) since the whole org is
// what's affected, not any one account.
async function logPlanChange(supabase, { organizationId, organizationName, fromPlan, toPlan }) {
  if (fromPlan !== "team" && toPlan !== "team") return;

  await supabase.from("platform_activity_log").insert({
    organization_id: organizationId,
    type: "plan_change",
    emails: [],
    organization_name: organizationName ?? null,
    detail: `${fromPlan}->${toPlan}`,
  });
}

// Plan self-service (/api/organization-plan) is scoped to the requester's
// own org — a Platform Admin isn't a member of any org, and needs to set
// an arbitrary organization's plan directly (support overrides, comped
// accounts, manual upgrades — there's no real payment processor here).
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { organizationId, plan } = await request.json();

    if (!organizationId || !VALID_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: "An organization and a plan (starter, pro, or team) are required." },
        { status: 400 },
      );
    }

    const { data: organization } = await supabase
      .from("organization")
      .select("plan, organization_name")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const fromPlan = organization?.plan ?? "starter";

    const { error } = await supabase
      .from("organization")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (fromPlan !== plan) {
      await logPlanChange(supabase, {
        organizationId,
        organizationName: organization?.organization_name,
        fromPlan,
        toPlan: plan,
      });
    }

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
