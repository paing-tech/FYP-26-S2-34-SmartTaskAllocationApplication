import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { taskId, userId } = await request.json();

    if (!taskId || !userId) {
      return NextResponse.json({ error: "Task and employee are required." }, { status: 400 });
    }

    // Server-side backstop — only Employee-role accounts are eligible for
    // task assignment, whether assigned by AI or manually.
    const { data: account } = await supabase
      .from("user_account")
      .select("role:role_id(role_name)")
      .eq("user_id", userId)
      .maybeSingle();

    if (String(account?.role?.role_name ?? "").trim().toLowerCase() !== "employee") {
      return NextResponse.json({ error: "Tasks can only be assigned to Employee accounts." }, { status: 400 });
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
