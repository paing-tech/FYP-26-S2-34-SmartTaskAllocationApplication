import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("feedback")
      .select("feedback_id, user_id, rating, category, subject, feedback_message, created_at")
      .eq("status", "Approved")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userIds = [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
    let nameByUserId = new Map();
    if (userIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", userIds),
        supabase.from("user_account").select("user_id, username").in("user_id", userIds),
      ]);
      const accountNames = new Map((accounts ?? []).map((row) => [row.user_id, row.username]));
      nameByUserId = new Map(
        userIds.map((id) => [
          id,
          (profiles ?? []).find((row) => row.user_id === id)?.full_name || accountNames.get(id) || "Optima user",
        ]),
      );
    }

    const feedback = (data ?? []).map((row) => ({
      id: row.feedback_id,
      name: nameByUserId.get(row.user_id) || "Optima user",
      rating: row.rating,
      category: row.category,
      subject: row.subject,
      message: row.feedback_message,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ feedback });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
