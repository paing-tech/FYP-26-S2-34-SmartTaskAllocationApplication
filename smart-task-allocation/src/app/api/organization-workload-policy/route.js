import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Read access is broad (any signed-in org member) since Insights' Workload
// Distribution chart needs this for every role that can view it — only
// *changing* the limit is a User Admin capability.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ workloadTaskLimit: 8 });
    }

    const { data: organization, error } = await supabase
      .from("organization")
      .select("workload_task_limit")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ workloadTaskLimit: organization?.workload_task_limit ?? 8 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json(
        { error: "You must belong to an organization to change its workload policy." },
        { status: 400 },
      );
    }

    const { workloadTaskLimit } = await request.json();
    const limit = Number(workloadTaskLimit);

    if (!Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json({ error: "Workload limit must be a number greater than 0." }, { status: 400 });
    }

    const { error } = await supabase
      .from("organization")
      .update({ workload_task_limit: limit, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, workloadTaskLimit: limit });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
