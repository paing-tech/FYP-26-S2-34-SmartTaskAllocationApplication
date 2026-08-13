import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: logs, error } = await supabase
      .from("platform_activity_log")
      .select("activity_id, type, emails, organization_name, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      activity: (logs ?? []).map((log) => ({
        activityId: log.activity_id,
        type: log.type,
        emails: log.emails ?? [],
        organizationName: log.organization_name,
        detail: log.detail,
        createdAt: log.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
