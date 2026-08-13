import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Skills are scoped per organization (see 20260824_add_skill_organization_id.sql)
// — used to populate the required-skills picker on tasks as well as the
// skill list on a user's own profile card, so any authenticated role (not
// just managers) can read their own org's catalog.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);
    if (!organizationId) {
      return NextResponse.json({ skills: [] });
    }

    const { data, error } = await supabase
      .from("skill")
      .select("skill_id, skill_name")
      .eq("organization_id", organizationId)
      .order("skill_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ skills: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Creating a skill that already exists within the requester's own org
// (case-insensitively) just returns the existing row instead of duplicating
// it — a different org can still have its own skill with the same name.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);
    if (!organizationId) {
      return NextResponse.json({ error: "You must belong to an organization to create a skill." }, { status: 400 });
    }

    const body = await request.json();
    const skillName = (body.skillName || "").trim();

    if (!skillName) {
      return NextResponse.json({ error: "Skill name is required." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("skill")
      .select("skill_id, skill_name")
      .eq("organization_id", organizationId)
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
      .insert({ skill_name: skillName, organization_id: organizationId })
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
