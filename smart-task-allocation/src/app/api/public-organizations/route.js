import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Public, unauthenticated list of organizations for the marketing landing page.
// Returns only the name and logo (no contact details) so the logo marquee can
// showcase real customers without exposing private data.
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("organization")
      .select("organization_id, organization_name, logo_url")
      .order("organization_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ organizations: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
