import { NextResponse } from "next/server";
import { getAuthenticatedUser, requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const VALID_PLANS = ["starter", "pro", "team"];

// Read access is broad (any signed-in user) — every gated checkpoint in the
// app needs this list to decide whether the current org's plan clears the
// bar. Only Platform Admin can change a feature's required plan.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("feature_flag")
      .select("feature_key, feature_name, description, required_plan")
      .order("feature_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ featureFlags: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { featureKey, requiredPlan } = await request.json();

    if (!featureKey) {
      return NextResponse.json({ error: "Feature key is required." }, { status: 400 });
    }

    if (!VALID_PLANS.includes(requiredPlan)) {
      return NextResponse.json({ error: "Required plan must be one of: starter, pro, team." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("feature_flag")
      .update({ required_plan: requiredPlan, updated_at: new Date().toISOString() })
      .eq("feature_key", featureKey)
      .select("feature_key, feature_name, description, required_plan")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Feature not found." }, { status: 404 });
    }

    return NextResponse.json({ featureFlag: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
