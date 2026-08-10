import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const BUCKET = "task-attachments";
const MAX_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function isManagerOrAdminRole(roleName) {
  const normalized = String(roleName ?? "").trim().toLowerCase();
  return normalized === "manager" || normalized === "user admin";
}

async function getAccount(supabase, user) {
  const columns = "user_id, organization_id, role:role_id(role_name)";
  const { data, error } = await supabase
    .from("user_account")
    .select(columns)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data) {
    return { account: data, error };
  }

  const byEmail = await supabase.from("user_account").select(columns).eq("email", user.email).maybeSingle();

  return { account: byEmail.data, error: byEmail.error };
}

// An employee assigned to the task (directly or via task_assignee) may read
// or upload attachments on it, same as a Manager/User Admin managing the
// wider board — mirrors the isAssignedToMe gate in /api/employee-tasks's
// PATCH, but widened so the task's own org-wide managers aren't locked out.
async function loadAssignedTask(supabase, account, taskId) {
  const { data: task, error: taskError } = await supabase
    .from("task")
    .select("task_id, assigned_to, organization_id")
    .eq("task_id", taskId)
    .maybeSingle();

  if (taskError || !task || task.organization_id !== account.organization_id) {
    return null;
  }

  if (isManagerOrAdminRole(account.role?.role_name)) {
    return task;
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

async function toAttachmentPayload(supabase, row, authorsById) {
  const { data: signedUrlData } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

  return {
    id: row.attachment_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    createdAt: row.created_at,
    url: signedUrlData?.signedUrl ?? null,
    author: authorsById.get(row.user_id) ?? { user_id: row.user_id, full_name: null, avatar_url: null },
  };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

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
      .from("task_attachment")
      .select("attachment_id, user_id, file_name, storage_path, file_size, created_at")
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

    const attachments = await Promise.all(
      (rows ?? []).map((row) => toAttachmentPayload(supabase, row, authorsById)),
    );

    return NextResponse.json({ attachments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 400 });
    }

    const formData = await request.formData();
    const taskId = Number(formData.get("taskId"));
    const file = formData.get("file");

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
    }

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be 15MB or smaller." }, { status: 400 });
    }

    if (!(await loadAssignedTask(supabase, account, taskId))) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const storagePath = `${taskId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from("task_attachment")
      .insert({
        task_id: taskId,
        user_id: account.user_id,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
      })
      .select("attachment_id, user_id, file_name, storage_path, file_size, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profile")
      .select("full_name, profile_picture_url")
      .eq("user_id", account.user_id)
      .maybeSingle();

    const authorsById = new Map([
      [
        account.user_id,
        {
          user_id: account.user_id,
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.profile_picture_url ?? null,
        },
      ],
    ]);

    return NextResponse.json({ attachment: await toAttachmentPayload(supabase, row, authorsById) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 400 });
    }

    const attachmentId = new URL(request.url).searchParams.get("attachmentId");

    if (!attachmentId) {
      return NextResponse.json({ error: "Attachment ID is required." }, { status: 400 });
    }

    const { data: attachment, error: attachmentError } = await supabase
      .from("task_attachment")
      .select("attachment_id, task_id, user_id, storage_path")
      .eq("attachment_id", attachmentId)
      .maybeSingle();

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    // Only the person who uploaded a file can remove it — being assigned to
    // the task isn't enough, otherwise any co-assignee could delete another
    // person's upload.
    if (attachment.user_id !== account.user_id) {
      return NextResponse.json({ error: "You can only delete your own attachments." }, { status: 403 });
    }

    if (!(await loadAssignedTask(supabase, account, attachment.task_id))) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    await supabase.storage.from(BUCKET).remove([attachment.storage_path]);

    const { error: deleteError } = await supabase
      .from("task_attachment")
      .delete()
      .eq("attachment_id", attachmentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
