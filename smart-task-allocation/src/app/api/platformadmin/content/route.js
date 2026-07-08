import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { SITE_CONTENT_DEFAULTS } from "@/lib/siteContentSchema";

const CONTENT_KEYS = Object.keys(SITE_CONTENT_DEFAULTS);

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("site_content")
      .select("content_key, content, updated_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rowByKey = new Map((data ?? []).map((row) => [row.content_key, row]));
    const content = {};
    const meta = {};

    for (const key of CONTENT_KEYS) {
      const row = rowByKey.get(key);
      content[key] = row ? { ...SITE_CONTENT_DEFAULTS[key], ...row.content } : SITE_CONTENT_DEFAULTS[key];
      meta[key] = { updatedAt: row?.updated_at ?? null };
    }

    return NextResponse.json({ content, meta });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requirePlatformAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { contentKey, content } = await request.json();

    if (!CONTENT_KEYS.includes(contentKey)) {
      return NextResponse.json({ error: "Unknown content section." }, { status: 400 });
    }

    const { error } = await supabase.from("site_content").upsert({
      content_key: contentKey,
      content: content ?? {},
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
