import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Re-confirms the requesting User Admin's own password before a sensitive
// account action (promote/demote/suspend/delete) proceeds. Verifies against
// a throwaway anon-key client — signInWithPassword either succeeds or
// errors, and the resulting session is discarded, never touching the
// caller's real session.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    const { error: signInError } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
