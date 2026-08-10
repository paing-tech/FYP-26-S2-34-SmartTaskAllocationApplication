import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { userId, email, username } = await request.json();

    if (!userId || !email || !username) {
      return NextResponse.json(
        { error: "User ID, email, and username are required." },
        { status: 400 }
      );
    }

    if (userId !== user.id || email !== user.email) {
      return NextResponse.json(
        { error: "You can only activate your own account." },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("user_account")
      .update({
        username,
        account_status: "Active",
      })
      .eq("user_id", userId)
      .eq("email", email);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}