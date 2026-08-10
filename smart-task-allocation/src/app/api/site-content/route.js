import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { SITE_CONTENT_DEFAULTS } from "@/lib/siteContentSchema";

const CONTENT_KEYS = Object.keys(SITE_CONTENT_DEFAULTS);

// Public, unauthenticated — the live marketing site reads its own copy from
// here. Missing rows (table not migrated yet, or a section never edited)
// silently fall back to the hardcoded defaults so the site never renders
// blank content.
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from("site_content").select("content_key, content");

    if (error) {
      return NextResponse.json({ content: SITE_CONTENT_DEFAULTS });
    }

    const rowByKey = new Map((data ?? []).map((row) => [row.content_key, row]));
    const content = {};

    for (const key of CONTENT_KEYS) {
      const row = rowByKey.get(key);
      content[key] = row ? { ...SITE_CONTENT_DEFAULTS[key], ...row.content } : SITE_CONTENT_DEFAULTS[key];
    }

    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ content: SITE_CONTENT_DEFAULTS });
  }
}
