import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Read access is broad (any signed-in org member) since the Leave Balance
// panel needs this for every role — only *changing* the totals is a User
// Admin capability.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ annualLeaveTotal: 16, sickLeaveTotal: 14 });
    }

    const { data: organization, error } = await supabase
      .from("organization")
      .select("annual_leave_total, sick_leave_total")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      annualLeaveTotal: organization?.annual_leave_total ?? 16,
      sickLeaveTotal: organization?.sick_leave_total ?? 14,
    });
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
        { error: "You must belong to an organization to change its leave policy." },
        { status: 400 },
      );
    }

    const { annualLeaveTotal, sickLeaveTotal } = await request.json();
    const annual = Number(annualLeaveTotal);
    const sick = Number(sickLeaveTotal);

    if (!Number.isInteger(annual) || annual < 0 || !Number.isInteger(sick) || sick < 0) {
      return NextResponse.json(
        { error: "Annual and sick leave totals must be whole numbers of 0 or more." },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("organization")
      .update({ annual_leave_total: annual, sick_leave_total: sick, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, annualLeaveTotal: annual, sickLeaveTotal: sick });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
