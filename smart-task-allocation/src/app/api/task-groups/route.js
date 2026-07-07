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

// Delete a task group. Tasks in the group are detached (group_id -> null).
export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required." }, { status: 400 });
    }

    await supabase.from("task").update({ group_id: null }).eq("group_id", groupId);
    const { error } = await supabase.from("task_group").delete().eq("group_id", groupId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
