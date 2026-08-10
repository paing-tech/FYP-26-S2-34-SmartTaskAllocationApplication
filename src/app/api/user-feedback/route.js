import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const MAX_FEEDBACK_LENGTH = 1000;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getAccount(supabase, user) {
  const byId = await supabase
    .from("user_account")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byId.data || !user.email) return byId;
  return supabase.from("user_account").select("user_id").eq("email", user.email).maybeSingle();
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { data: account, error: accountError } = await getAccount(supabase, user);
    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 404 });
    }

    const body = await request.json();
    const rating = Number(body.rating);
    const category = cleanString(body.category) || "General";
    const subject = cleanString(body.subject) || category;
    const message = cleanString(body.message);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !message) {
      return NextResponse.json(
        { error: "A rating from 1 to 5 and feedback comment are required." },
        { status: 400 },
      );
    }
    if (message.length > MAX_FEEDBACK_LENGTH) {
      return NextResponse.json(
        { error: `Feedback comments must be ${MAX_FEEDBACK_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    const createdAt = new Date().toISOString();
    const { data: feedback, error } = await supabase
      .from("feedback")
      .insert({
        user_id: account.user_id,
        rating,
        category,
        subject,
        feedback_message: message,
        status: "Pending",
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select("feedback_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await supabase.from("activity_log").insert({
      user_id: account.user_id,
      action: "User Feedback Submitted",
      details: JSON.stringify({ feedbackId: feedback.feedback_id, rating, category, status: "Pending" }),
      created_at: createdAt,
    });

    return NextResponse.json({ success: true, feedbackId: feedback.feedback_id, createdAt });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
