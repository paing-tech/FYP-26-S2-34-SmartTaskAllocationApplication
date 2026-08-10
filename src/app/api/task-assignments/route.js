import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { validateTaskAssignee } from "@/lib/taskEligibility";

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { taskId, userId } = await request.json();

    if (!taskId || !userId) {
      return NextResponse.json({ error: "Task and employee are required." }, { status: 400 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const eligibilityError = await validateTaskAssignee(supabase, { taskId, userId, organizationId });
    if (eligibilityError) {
      return NextResponse.json({ error: eligibilityError }, { status: 400 });
    }

    const { error } = await supabase.from("task_assignment").insert({
      task_id: taskId,
      user_id: userId,
      assigned_at: new Date().toISOString(),
      status: "Assigned",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
