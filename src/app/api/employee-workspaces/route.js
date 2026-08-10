import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getAccount(supabase, user) {
  const { data, error } = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data) {
    return { account: data, error };
  }

  const byEmail = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("email", user.email)
    .maybeSingle();

  return { account: byEmail.data, error: byEmail.error };
}

async function getWorkspacesForEmployee(supabase, account) {
  const { data: memberRows, error: memberError } = await supabase
    .from("workspace_member")
    .select("workspace_id")
    .eq("user_id", account.user_id);

  if (memberError) {
    return { error: memberError };
  }

  const { data: assignedTasks, error: assignedTasksError } = await supabase
    .from("task")
    .select("workspace_id")
    .eq("assigned_to", account.user_id)
    .eq("organization_id", account.organization_id);

  if (assignedTasksError) {
    return { error: assignedTasksError };
  }

  const workspaceIds = [
    ...new Set(
      [...(memberRows ?? []), ...(assignedTasks ?? [])]
        .map((row) => row.workspace_id)
        .filter(Boolean),
    ),
  ];

  if (!workspaceIds.length) {
    return { workspaces: [] };
  }

  const { data: workspaces, error } = await supabase
    .from("workspace")
    .select("workspace_id, workspace_name, description, created_by, status, visibility, created_at")
    .in("workspace_id", workspaceIds)
    .order("created_at", { ascending: true });

  if (error) {
    return { error };
  }

  return { workspaces: workspaces ?? [] };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!account?.organization_id) {
      return NextResponse.json({ workspaces: [], tasks: [] });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const workspaceResult = await getWorkspacesForEmployee(supabase, account);

    if (workspaceResult.error) {
      return NextResponse.json({ error: workspaceResult.error.message }, { status: 400 });
    }

    const workspaces = workspaceResult.workspaces ?? [];
    const allowedWorkspaceIds = new Set(workspaces.map((workspace) => workspace.workspace_id));
    const selectedWorkspaceId =
      workspaceId && allowedWorkspaceIds.has(workspaceId)
        ? workspaceId
        : workspaces[0]?.workspace_id ?? "";

    if (!selectedWorkspaceId) {
      return NextResponse.json({ workspaces, tasks: [], selectedWorkspaceId: "" });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("task")
      .select("*")
      .eq("workspace_id", selectedWorkspaceId)
      .eq("organization_id", account.organization_id)
      .or(`assigned_to.eq.${account.user_id},owner_id.eq.${account.user_id}`)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    // Groups for the selected workspace (read-only column structure).
    const { data: groups } = await supabase
      .from("task_group")
      .select("group_id, group_name, workspace_id, sort_order")
      .eq("workspace_id", selectedWorkspaceId)
      .order("sort_order", { ascending: true })
      .order("group_id", { ascending: true });

    // Member display names so Owner / Assigned to can render full names.
    const memberIds = [
      ...new Set(
        (tasks ?? [])
          .flatMap((task) => [task.owner_id, task.assigned_to])
          .filter(Boolean),
      ),
    ];

    let members = [];
    if (memberIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", memberIds),
        supabase.from("user_account").select("user_id, username, email").in("user_id", memberIds),
      ]);
      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
      const accountMap = new Map((accounts ?? []).map((a) => [a.user_id, a]));
      members = memberIds.map((id) => ({
        user_id: id,
        full_name: profileMap.get(id) ?? null,
        username: accountMap.get(id)?.username ?? null,
        email: accountMap.get(id)?.email ?? null,
      }));
    }

    return NextResponse.json({
      workspaces,
      tasks: tasks ?? [],
      groups: groups ?? [],
      members,
      selectedWorkspaceId,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
