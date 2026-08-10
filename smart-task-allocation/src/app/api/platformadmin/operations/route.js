import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const FEEDBACK_STATUSES = new Set(["Pending", "Approved", "Hidden", "Rejected"]);
const INQUIRY_STATUSES = new Set(["Open", "In Progress", "Resolved"]);

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDetails(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { message: String(value) };
  }
}

async function actorNames(supabase, userIds) {
  if (!userIds.length) return new Map();
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase.from("profile").select("user_id, full_name").in("user_id", userIds),
    supabase.from("user_account").select("user_id, username").in("user_id", userIds),
  ]);
  const accountNames = new Map((accounts ?? []).map((row) => [row.user_id, row.username]));
  return new Map(
    userIds.map((id) => [
      id,
      (profiles ?? []).find((row) => row.user_id === id)?.full_name || accountNames.get(id) || "Unknown user",
    ]),
  );
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const [{ data: logs, error: logError }, { data: feedback, error: feedbackError }, accountActivity] =
      await Promise.all([
        supabase
          .from("activity_log")
          .select("log_id, user_id, action, details, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("feedback")
          .select("feedback_id, user_id, rating, category, subject, feedback_message, status, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("account_activity_log")
          .select("activity_id, actor_user_id, target_label, action, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    if (logError || feedbackError) {
      return NextResponse.json({ error: (logError || feedbackError).message }, { status: 400 });
    }

    const userIds = [
      ...(logs ?? []).map((row) => row.user_id),
      ...(feedback ?? []).map((row) => row.user_id),
      ...(accountActivity.data ?? []).map((row) => row.actor_user_id),
    ].filter(Boolean);
    const names = await actorNames(supabase, [...new Set(userIds)]);

    const activity = [
      ...(logs ?? []).map((row) => ({
        id: `log-${row.log_id}`,
        actor: row.user_id ? names.get(row.user_id) || "Unknown user" : "Guest user",
        action: row.action,
        target: parseDetails(row.details).subject || parseDetails(row.details).message || "",
        createdAt: row.created_at,
      })),
      ...(accountActivity.data ?? []).map((row) => ({
        id: `account-${row.activity_id}`,
        actor: names.get(row.actor_user_id) || "Unknown user",
        action: `Account ${row.action}`,
        target: row.target_label || "",
        createdAt: row.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const inquiries = (logs ?? [])
      .filter((row) => row.action === "Contact Support Inquiry")
      .map((row) => ({
        logId: row.log_id,
        ...parseDetails(row.details),
        createdAt: row.created_at,
      }));

    const feedbackRows = (feedback ?? []).map((row) => ({
      feedbackId: row.feedback_id,
      userName: names.get(row.user_id) || "Optima user",
      rating: row.rating,
      category: row.category,
      subject: row.subject,
      message: row.feedback_message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ activity, feedback: feedbackRows, inquiries });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const type = cleanString(body.type);
    const now = new Date().toISOString();

    if (type === "feedback-status") {
      const status = cleanString(body.status);
      if (!body.feedbackId || !FEEDBACK_STATUSES.has(status)) {
        return NextResponse.json({ error: "A feedback record and valid status are required." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("feedback")
        .update({ status, updated_at: now })
        .eq("feedback_id", body.feedbackId)
        .select("feedback_id")
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: error?.message || "Feedback not found." }, { status: 404 });
      }
      await supabase.from("activity_log").insert({
        user_id: user.id,
        action: "Feedback Moderation Updated",
        details: JSON.stringify({ feedbackId: body.feedbackId, status }),
        created_at: now,
      });
      return NextResponse.json({ success: true });
    }

    if (type === "inquiry-status" || type === "inquiry-reply") {
      const { data: source, error: sourceError } = await supabase
        .from("activity_log")
        .select("log_id, action, details")
        .eq("log_id", body.logId)
        .maybeSingle();
      if (sourceError || !source || source.action !== "Contact Support Inquiry") {
        return NextResponse.json({ error: sourceError?.message || "Inquiry not found." }, { status: 404 });
      }

      const details = parseDetails(source.details);
      const status = cleanString(body.status) || details.status || "Open";
      if (!INQUIRY_STATUSES.has(status)) {
        return NextResponse.json({ error: "Select a valid inquiry status." }, { status: 400 });
      }

      const reply = cleanString(body.reply);
      if (type === "inquiry-reply" && !reply) {
        return NextResponse.json({ error: "Reply message is required." }, { status: 400 });
      }

      const replies = Array.isArray(details.replies) ? details.replies : [];
      if (reply) replies.push({ message: reply, senderId: user.id, createdAt: now });
      const updated = { ...details, status, replies, updatedAt: now };
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ details: JSON.stringify(updated) })
        .eq("log_id", body.logId);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      await supabase.from("activity_log").insert({
        user_id: user.id,
        action: "Contact Inquiry Updated",
        details: JSON.stringify({ sourceLogId: body.logId, status, reply: reply || null }),
        created_at: now,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported platform operation." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
