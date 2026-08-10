import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getAccountUserId(supabase, user) {
  const { data } = await supabase
    .from("user_account")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (data?.user_id) {
    return data.user_id;
  }

  const byEmail = await supabase
    .from("user_account")
    .select("user_id")
    .eq("email", user.email)
    .maybeSingle();

  return byEmail.data?.user_id ?? user.id;
}

async function attachCreatorProfiles(supabase, workspaces) {
  const creatorIds = [...new Set(workspaces.map((workspace) => workspace.created_by).filter(Boolean))];

  if (!creatorIds.length) {
    return workspaces;
  }

  const { data } = await supabase
    .from("user_account")
    .select("user_id, username, email")
    .in("user_id", creatorIds);
  const creatorsById = new Map((data ?? []).map((account) => [account.user_id, account]));

  return workspaces.map((workspace) => {
    const creator = creatorsById.get(workspace.created_by);

    return {
      ...workspace,
      created_by_name: creator?.username ?? creator?.email ?? "Unknown user",
      created_by_email: creator?.email ?? "",
    };
  });
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const accountUserId = await getAccountUserId(supabase, user);
    const { data, error } = await supabase
      .from("workspace")
      .select(
        "workspace_id, workspace_name, description, created_by, status, visibility, share_token, link_access, created_at"
      )
      .eq("created_by", accountUserId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ workspaces: await attachCreatorProfiles(supabase, data ?? []) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { workspaceName, description } = await request.json();
    const cleanedName = cleanString(workspaceName);

    if (!cleanedName) {
      return NextResponse.json({ error: "Workspace name is required." }, { status: 400 });
    }

    const accountUserId = await getAccountUserId(supabase, user);
    const workspaceId = randomUUID();
    const now = new Date().toISOString();
    const { error: workspaceError } = await supabase.from("workspace").insert({
      workspace_id: workspaceId,
      workspace_name: cleanedName,
      description: cleanString(description) || null,
      created_by: accountUserId,
      status: "Active",
      visibility: "Private",
      created_at: now,
      updated_at: now,
    });

    if (workspaceError) {
      return NextResponse.json({ error: workspaceError.message }, { status: 400 });
    }

    const { error: memberError } = await supabase.from("workspace_member").insert({
      workspace_id: workspaceId,
      user_id: accountUserId,
      joined_at: now,
    });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    return NextResponse.json({
      workspace: {
        workspace_id: workspaceId,
        workspace_name: cleanedName,
        description: cleanString(description) || null,
        created_by: accountUserId,
        created_by_name: user.email ?? "Current user",
        created_by_email: user.email ?? "",
        status: "Active",
        visibility: "Private",
        share_token: null,
        link_access: "Private",
        created_at: now,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { workspaceId, workspaceName, visibility, status, linkAccess } = await request.json();
    const cleanedName = cleanString(workspaceName);

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required." }, { status: 400 });
    }

    const updateValues = {
      updated_at: new Date().toISOString(),
    };

    if (workspaceName !== undefined) {
      if (!cleanedName) {
        return NextResponse.json({ error: "Workspace name is required." }, { status: 400 });
      }

      updateValues.workspace_name = cleanedName;
    }

    if (visibility !== undefined) {
      const cleanedVisibility = cleanString(visibility);

      if (!["Private", "Public"].includes(cleanedVisibility)) {
        return NextResponse.json({ error: "Visibility must be Private or Public." }, { status: 400 });
      }

      updateValues.visibility = cleanedVisibility;
    }

    if (status !== undefined) {
      const cleanedStatus = cleanString(status);

      if (!["Active", "Archived"].includes(cleanedStatus)) {
        return NextResponse.json({ error: "Status must be Active or Archived." }, { status: 400 });
      }

      updateValues.status = cleanedStatus;
    }

    const accountUserId = await getAccountUserId(supabase, user);
    if (linkAccess !== undefined) {
      const cleanedLinkAccess = cleanString(linkAccess);

      if (!["Private", "View", "Edit"].includes(cleanedLinkAccess)) {
        return NextResponse.json(
          { error: "Link access must be Private, View, or Edit." },
          { status: 400 }
        );
      }

      const { data: currentWorkspace, error: currentWorkspaceError } = await supabase
        .from("workspace")
        .select("workspace_id, share_token")
        .eq("workspace_id", workspaceId)
        .eq("created_by", accountUserId)
        .maybeSingle();

      if (currentWorkspaceError) {
        return NextResponse.json({ error: currentWorkspaceError.message }, { status: 400 });
      }

      if (!currentWorkspace) {
        return NextResponse.json({ error: "Workspace was not found." }, { status: 404 });
      }

      updateValues.link_access = cleanedLinkAccess;
      updateValues.share_token =
        cleanedLinkAccess === "Private" ? null : currentWorkspace.share_token ?? randomUUID();
    }

    const { data: workspace, error } = await supabase
      .from("workspace")
      .update(updateValues)
      .eq("workspace_id", workspaceId)
      .eq("created_by", accountUserId)
      .select(
        "workspace_id, workspace_name, description, created_by, status, visibility, share_token, link_access, created_at"
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required." }, { status: 400 });
    }

    const accountUserId = await getAccountUserId(supabase, user);

    // Confirm ownership before removing anything.
    const { data: ownedWorkspace } = await supabase
      .from("workspace")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("created_by", accountUserId)
      .maybeSingle();

    if (!ownedWorkspace) {
      return NextResponse.json(
        { error: "Workspace not found or you do not own it." },
        { status: 404 },
      );
    }

    // Remove dependents first — task → task_group → workspace_member — because
    // those foreign keys don't cascade (e.g. task.group_id → task_group).
    await supabase.from("task").delete().eq("workspace_id", workspaceId);
    await supabase.from("task_group").delete().eq("workspace_id", workspaceId);
    await supabase.from("workspace_member").delete().eq("workspace_id", workspaceId);

    const { error } = await supabase
      .from("workspace")
      .delete()
      .eq("workspace_id", workspaceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
