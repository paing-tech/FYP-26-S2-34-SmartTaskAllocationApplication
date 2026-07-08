import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getManagerOrganizationId(supabase, user) {
  const { data } = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.organization_id ?? null;
}

// List the task groups for the manager organization (ordered).
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    if (!organizationId) {
      return NextResponse.json({ groups: [] });
    }

    const { data, error } = await supabase
      .from("task_group")
      .select("group_id, organization_id, group_name, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("group_id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ groups: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Create a task group inside the manager organization.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }
    const { groupName } = await request.json();
    const name = cleanString(groupName) || "New Group";

    const { data: lastInOrganization } = await supabase
      .from("task_group")
      .select("sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = Number.isFinite(Number(lastInOrganization?.sort_order))
      ? Number(lastInOrganization.sort_order) + 1
      : 0;

    // group_id is a generated identity column — let the database assign it.
    const { data, error } = await supabase
      .from("task_group")
      .insert({
        organization_id: organizationId,
        group_name: name,
        sort_order: nextSortOrder,
      })
      .select("group_id, organization_id, group_name, sort_order")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ group: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Rename a task group.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { groupId, groupName } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("task_group")
      .update({ group_name: cleanString(groupName) || "Untitled", updated_at: new Date().toISOString() })
      .eq("group_id", groupId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Delete a task group. By default its tasks are detached (group_id -> null).
// Pass migrateToGroupId to move them into another group instead, or
// deleteTasks=true to delete the tasks (and their dependent rows) along with it.
export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const migrateToGroupId = searchParams.get("migrateToGroupId");
    const deleteTasks = searchParams.get("deleteTasks") === "true";

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required." }, { status: 400 });
    }

    if (deleteTasks) {
      const { data: groupTasks, error: groupTasksError } = await supabase
        .from("task")
        .select("task_id")
        .eq("group_id", groupId);

      if (groupTasksError) {
        return NextResponse.json({ error: groupTasksError.message }, { status: 400 });
      }

      const taskIds = (groupTasks ?? []).map((task) => task.task_id);

      if (taskIds.length) {
        // Children first, then the tasks themselves — these tables have no
        // cascading delete on task_id, so leftover rows would block the delete.
        await supabase.from("task_assignment").delete().in("task_id", taskIds);
        await supabase.from("task_assignee").delete().in("task_id", taskIds);
        await supabase.from("task_comment").delete().in("task_id", taskIds);
        await supabase.from("task_file").delete().in("task_id", taskIds);
        await supabase.from("task_skill").delete().in("task_id", taskIds);
        await supabase.from("task_qualification").delete().in("task_id", taskIds);

        const { error: taskDeleteError } = await supabase.from("task").delete().in("task_id", taskIds);

        if (taskDeleteError) {
          return NextResponse.json({ error: taskDeleteError.message }, { status: 400 });
        }
      }
    } else if (migrateToGroupId) {
      const { error: migrateError } = await supabase
        .from("task")
        .update({ group_id: migrateToGroupId, updated_at: new Date().toISOString() })
        .eq("group_id", groupId);

      if (migrateError) {
        return NextResponse.json({ error: migrateError.message }, { status: 400 });
      }
    } else {
      await supabase.from("task").update({ group_id: null }).eq("group_id", groupId);
    }

    const { error } = await supabase.from("task_group").delete().eq("group_id", groupId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
