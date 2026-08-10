import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Email-first login: check whether an account exists before asking for the
// password. Used by the unauthenticated sign-in screen.
export async function POST(request) {
  try {
    const { email } = await request.json();
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!cleanEmail) {
      return NextResponse.json({ exists: false });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_account")
      .select("user_id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ exists: Boolean(data) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
