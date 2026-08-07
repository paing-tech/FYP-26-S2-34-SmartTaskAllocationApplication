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

// Only an employee assigned to the task (directly or via task_assignee) may
// read or post comments on it — mirrors the isAssignedToMe gate in
// /api/employee-tasks's PATCH.
async function loadAssignedTask(supabase, account, taskId) {
  const { data: task, error: taskError } = await supabase
    .from("task")
    .select("task_id, assigned_to, organization_id")
    .eq("task_id", taskId)
    .maybeSingle();

  if (taskError || !task || task.organization_id !== account.organization_id) {
    return null;
  }

  if (task.assigned_to === account.user_id) {
    return task;
  }

  const { data: assigneeRow } = await supabase
    .from("task_assignee")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("user_id", account.user_id)
    .maybeSingle();

  return assigneeRow ? task : null;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 400 });
    }

    const taskId = Number(new URL(request.url).searchParams.get("taskId"));

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
    }

    if (!(await loadAssignedTask(supabase, account, taskId))) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { data: rows, error } = await supabase
      .from("task_comment")
      .select("comment_id, user_id, comment_text, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const authorIds = [...new Set((rows ?? []).map((row) => row.user_id))];
    let authorsById = new Map();

    if (authorIds.length) {
      const { data: profiles } = await supabase
        .from("profile")
        .select("user_id, full_name, profile_picture_url")
        .in("user_id", authorIds);
      authorsById = new Map(
        (profiles ?? []).map((profile) => [
          profile.user_id,
          { user_id: profile.user_id, full_name: profile.full_name, avatar_url: profile.profile_picture_url },
        ]),
      );
    }

    const comments = (rows ?? []).map((row) => ({
      id: row.comment_id,
      userId: row.user_id,
      commentText: row.comment_text,
      createdAt: row.created_at,
      author: authorsById.get(row.user_id) ?? { user_id: row.user_id, full_name: null, avatar_url: null },
    }));

    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 400 });
    }

    const { taskId, commentText } = await request.json();
    const cleanText = String(commentText || "").trim();

    if (!taskId || !cleanText) {
      return NextResponse.json({ error: "Task ID and comment text are required." }, { status: 400 });
    }

    if (!(await loadAssignedTask(supabase, account, taskId))) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { data: row, error } = await supabase
      .from("task_comment")
      .insert({ task_id: taskId, user_id: account.user_id, comment_text: cleanText })
      .select("comment_id, user_id, comment_text, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profile")
      .select("full_name, profile_picture_url")
      .eq("user_id", account.user_id)
      .maybeSingle();

    return NextResponse.json({
      comment: {
        id: row.comment_id,
        userId: row.user_id,
        commentText: row.comment_text,
        createdAt: row.created_at,
        author: {
          user_id: account.user_id,
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.profile_picture_url ?? null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 400 });
    }

    const commentId = new URL(request.url).searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json({ error: "Comment ID is required." }, { status: 400 });
    }

    const { data: comment, error: commentError } = await supabase
      .from("task_comment")
      .select("comment_id, task_id, user_id")
      .eq("comment_id", commentId)
      .maybeSingle();

    if (commentError || !comment) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    // Only the author can delete their own comment — being assigned to the
    // task isn't enough, otherwise any co-assignee could delete someone
    // else's comment.
    if (comment.user_id !== account.user_id) {
      return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
    }

    if (!(await loadAssignedTask(supabase, account, comment.task_id))) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { error: deleteError } = await supabase.from("task_comment").delete().eq("comment_id", commentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
