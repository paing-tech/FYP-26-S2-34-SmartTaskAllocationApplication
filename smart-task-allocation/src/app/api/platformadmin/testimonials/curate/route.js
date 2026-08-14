import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { curateTestimonialsFromFeedback } from "@/lib/testimonialCuration";

// Manual trigger for "Curate from feedback" — reads unprocessed
// support_inquiry rows (subject: Feedback), has the AI draft candidate
// testimonials from the positive ones, and inserts them as Pending (never
// shown publicly until a Platform Admin approves). Same underlying logic
// the curate_testimonials chat tool calls.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const result = await curateTestimonialsFromFeedback(supabase);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
