import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Skills are a global catalog (not organization-scoped), used to populate the
// required-skills picker on tasks as well as the skill list on a user's own
// profile card, so any authenticated role (not just managers) can read it.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("skill")
      .select("skill_id, skill_name")
      .order("skill_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ skills: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Skills are a shared global catalog, so creating one that already exists
// (case-insensitively) just returns the existing row instead of duplicating it.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const skillName = (body.skillName || "").trim();

    if (!skillName) {
      return NextResponse.json({ error: "Skill name is required." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("skill")
      .select("skill_id, skill_name")
      .ilike("skill_name", skillName)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (existing) {
      return NextResponse.json({ skill: existing });
    }

    const { data: created, error: createError } = await supabase
      .from("skill")
      .insert({ skill_name: skillName })
      .select("skill_id, skill_name")
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    return NextResponse.json({ skill: created });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
