import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireDemoUser } from "@/lib/demoServer";

// Tear down everything created for this demo: all org-scoped rows in FK-safe
// order, then the throwaway auth users. Nothing the guest did is kept.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { account, error } = await requireDemoUser(request, supabase);
    if (error) {
      return NextResponse.json({ error }, { status: 403 });
    }

    const organizationId = account?.organization_id ?? null;
    if (!organizationId) {
      return NextResponse.json({ success: true });
    }

    // Collect the id sets we need before deleting anything.
    const { data: accounts } = await supabase
      .from("user_account")
      .select("user_id")
      .eq("organization_id", organizationId);
    const userIds = (accounts ?? []).map((a) => a.user_id);

    const { data: workspaces } = userIds.length
      ? await supabase.from("workspace").select("workspace_id").in("created_by", userIds)
      : { data: [] };
    const workspaceIds = (workspaces ?? []).map((w) => w.workspace_id);

    const { data: tasks } = await supabase
      .from("task")
      .select("task_id")
      .eq("organization_id", organizationId);
    const taskIds = (tasks ?? []).map((t) => t.task_id);

    const { data: teams } = await supabase
      .from("team")
      .select("team_id")
      .eq("organization_id", organizationId);
    const teamIds = (teams ?? []).map((t) => t.team_id);

    const del = async (fn) => {
      try {
        await fn();
      } catch {
        /* best-effort */
      }
    };
    const inList = (table, column, ids) =>
      del(() => (ids.length ? supabase.from(table).delete().in(column, ids) : Promise.resolve()));
    const eq = (table, column, value) => del(() => supabase.from(table).delete().eq(column, value));

    // Children first, then parents.
    await inList("work_log", "user_id", userIds);
    await inList("task_assignment", "task_id", taskIds);
    await inList("task_comment", "task_id", taskIds);
    await inList("task_file", "task_id", taskIds);
    await inList("task_skill", "task_id", taskIds);
    await inList("task_qualification", "task_id", taskIds);
    await eq("task", "organization_id", organizationId);
    await inList("task_group", "workspace_id", workspaceIds);
    await inList("workspace_member", "workspace_id", workspaceIds);
    await inList("workspace", "workspace_id", workspaceIds);
    await inList("team_invitation", "team_id", teamIds);
    await inList("team_member", "team_id", teamIds);
    await eq("team", "organization_id", organizationId);
    await inList("availability", "user_id", userIds);
    await inList("user_skill", "user_id", userIds);
    await inList("user_qualification", "user_id", userIds);
    await inList("notification", "user_id", userIds);
    await inList("activity_log", "user_id", userIds);
    await inList("profile", "user_id", userIds);
    await eq("user_account", "organization_id", organizationId);
    await eq("department", "organization_id", organizationId);
    await eq("organization", "organization_id", organizationId);

    // Finally remove the throwaway auth users.
    for (const userId of userIds) {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
