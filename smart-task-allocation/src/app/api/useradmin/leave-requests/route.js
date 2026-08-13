import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const organizationId = await getRequesterOrganizationId(supabase, user);
    if (!organizationId) return NextResponse.json({ error: "You must belong to an organization." }, { status: 400 });

    const [{ data: accounts, error: accountsError }, { data: policy, error: policyError }] = await Promise.all([
      supabase.from("user_account").select("user_id").eq("organization_id", organizationId),
      supabase.from("organization").select("annual_leave_total, sick_leave_total").eq("organization_id", organizationId).single(),
    ]);
    if (accountsError) throw accountsError;
    if (policyError) throw policyError;
    const userIds = (accounts ?? []).map((account) => account.user_id);
    if (!userIds.length) return NextResponse.json({ requests: [] });

    const [{ data: requests, error: requestsError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabase.from("leave_request").select("leave_request_id, user_id, dates, leave_type, status, description, certificate_url, created_at").in("user_id", userIds).order("created_at", { ascending: false }),
      supabase.from("profile").select("user_id, full_name").in("user_id", userIds),
    ]);
    if (requestsError) throw requestsError;
    if (profilesError) throw profilesError;

    const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name]));
    const approvedUsage = new Map();
    for (const record of requests ?? []) {
      if (String(record.status).toLowerCase() !== "approved") continue;
      const key = `${record.user_id}:${record.leave_type === "sick" ? "sick" : "annual"}`;
      approvedUsage.set(key, (approvedUsage.get(key) ?? 0) + (record.dates?.length ?? 0));
    }

    return NextResponse.json({
      requests: (requests ?? []).map((record) => {
        const type = record.leave_type === "sick" ? "sick" : "annual";
        const allowance = type === "sick" ? Number(policy.sick_leave_total ?? 0) : Number(policy.annual_leave_total ?? 0);
        const used = approvedUsage.get(`${record.user_id}:${type}`) ?? 0;
        return { ...record, full_name: names.get(record.user_id) || "Unknown user", leave_balance: Math.max(0, allowance - used), leave_allowance: allowance };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const organizationId = await getRequesterOrganizationId(supabase, user);
    const { leaveRequestId, status } = await request.json();
    if (!leaveRequestId || !["Approved", "Rejected"].includes(status)) return NextResponse.json({ error: "A valid request and status are required." }, { status: 400 });

    const { data: record, error: lookupError } = await supabase.from("leave_request").select("leave_request_id, user_id").eq("leave_request_id", leaveRequestId).single();
    if (lookupError) throw lookupError;
    const { data: account } = await supabase.from("user_account").select("organization_id").eq("user_id", record.user_id).single();
    if (!account || account.organization_id !== organizationId) return NextResponse.json({ error: "Leave request not found." }, { status: 404 });

    const { error } = await supabase.from("leave_request").update({ status, updated_at: new Date().toISOString() }).eq("leave_request_id", leaveRequestId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
