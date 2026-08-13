import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
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

    const skillIds = (data ?? []).map((skill) => skill.skill_id);
    let counts = new Map();

    if (skillIds.length) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("user_skill")
        .select("skill_id")
        .in("skill_id", skillIds);

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 400 });
      }

      counts = (assignments ?? []).reduce((result, assignment) => {
        result.set(assignment.skill_id, (result.get(assignment.skill_id) ?? 0) + 1);
        return result;
      }, new Map());
    }

    return NextResponse.json({
      skills: (data ?? []).map((skill) => ({
        ...skill,
        assignment_count: counts.get(skill.skill_id) ?? 0,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const skillId = Number(new URL(request.url).searchParams.get("skillId"));
    if (!organizationId || !Number.isFinite(skillId)) {
      return NextResponse.json({ error: "A valid skill is required." }, { status: 400 });
    }

    const { data: skill } = await supabase.from("skill").select("skill_id")
      .eq("skill_id", skillId).eq("organization_id", organizationId).maybeSingle();
    if (!skill) return NextResponse.json({ error: "Skill not found." }, { status: 404 });

    const { count, error: countError } = await supabase.from("user_skill")
      .select("skill_id", { count: "exact", head: true }).eq("skill_id", skillId);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Skills assigned to people cannot be deleted." }, { status: 409 });
    }

    const { error: deleteError } = await supabase.from("skill").delete()
      .eq("skill_id", skillId).eq("organization_id", organizationId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const body = await request.json();
    const skillId = Number(body.skillId);
    const skillName = String(body.skillName ?? "").trim();
    if (!organizationId || !Number.isFinite(skillId) || !skillName) {
      return NextResponse.json({ error: "A valid skill name is required." }, { status: 400 });
    }

    const { data: duplicate, error: duplicateError } = await supabase.from("skill")
      .select("skill_id").eq("organization_id", organizationId).ilike("skill_name", skillName).maybeSingle();
    if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 400 });
    if (duplicate && duplicate.skill_id !== skillId) {
      return NextResponse.json({ error: "This skill already exists." }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabase.from("skill")
      .update({ skill_name: skillName }).eq("skill_id", skillId).eq("organization_id", organizationId)
      .select("skill_id, skill_name").maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Skill not found." }, { status: 404 });
    return NextResponse.json({ skill: updated });
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
