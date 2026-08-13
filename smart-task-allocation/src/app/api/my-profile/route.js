import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const GENDER_OPTIONS = new Set(["Male", "Female", "Prefer not to say"]);

// Resolves the caller's own user_account row (by id, falling back to email —
// same pattern as getUserAccount in my-organization/route.js) with the
// fields a self-service profile card needs.
async function getMyAccount(supabase, user) {
  const columns =
    "user_id, username, email, organization_id, department_id, role:role_id(role_name), department:department_id(department_name)";

  const byId = await supabase.from("user_account").select(columns).eq("user_id", user.id).maybeSingle();
  if (byId.error || byId.data) {
    return { account: byId.data, error: byId.error };
  }

  const byEmail = await supabase.from("user_account").select(columns).eq("email", user.email).maybeSingle();
  return { account: byEmail.data, error: byEmail.error };
}

// Viewing a colleague's card (e.g. from the org chart) instead of your own —
// only allowed when the target account is in the same organization as you.
async function getAccountForViewing(supabase, user, targetUserId) {
  const columns =
    "user_id, username, email, organization_id, department_id, role:role_id(role_name), department:department_id(department_name)";

  const requesterOrganizationId = await getRequesterOrganizationId(supabase, user);
  const { data: targetAccount, error } = await supabase
    .from("user_account")
    .select(columns)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    return { error };
  }
  if (!targetAccount || !requesterOrganizationId || targetAccount.organization_id !== requesterOrganizationId) {
    return { account: null };
  }

  return { account: targetAccount };
}

async function getMyProfilePayload(supabase, account) {
  const [
    { data: profile, error: profileError },
    { data: userSkills, error: skillsError },
    { data: qualifications, error: qualificationsError },
  ] = await Promise.all([
    supabase
      .from("profile")
      .select("full_name, job_title, phone_number, address, bio, profile_picture_url, date_of_birth, gender")
      .eq("user_id", account.user_id)
      .maybeSingle(),
    supabase.from("user_skill").select("skill:skill_id(skill_id, skill_name)").eq("user_id", account.user_id),
    supabase
      .from("user_qualification")
      .select("user_qualification_id, description")
      .eq("user_id", account.user_id)
      .order("created_at", { ascending: true }),
  ]);

  if (profileError) {
    return { error: profileError };
  }
  if (skillsError) {
    return { error: skillsError };
  }
  if (qualificationsError) {
    return { error: qualificationsError };
  }

  return {
    profile: {
      user_id: account.user_id,
      username: account.username,
      email: account.email,
      role_name: account.role?.role_name ?? "",
      department_name: account.department?.department_name ?? "",
      full_name: profile?.full_name ?? "",
      job_title: profile?.job_title ?? "",
      phone_number: profile?.phone_number ?? "",
      address: profile?.address ?? "",
      bio: profile?.bio ?? "",
      profile_picture_url: profile?.profile_picture_url ?? "",
      date_of_birth: profile?.date_of_birth ?? "",
      gender: profile?.gender ?? "",
      skills: (userSkills ?? [])
        .map((row) => row.skill)
        .filter(Boolean)
        .sort((a, b) => a.skill_name.localeCompare(b.skill_name)),
      qualifications: (qualifications ?? []).map((row) => row.description),
    },
  };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    const { account, error: accountError } =
      targetUserId && targetUserId !== user.id
        ? await getAccountForViewing(supabase, user, targetUserId)
        : await getMyAccount(supabase, user);
    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { profile, error: payloadError } = await getMyProfilePayload(supabase, account);
    if (payloadError) {
      return NextResponse.json({ error: payloadError.message }, { status: 400 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { account, error: accountError } = await getMyAccount(supabase, user);
    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = await request.json();
    const username = cleanString(body.username);
    const email = cleanString(body.email).toLowerCase();
    const fullName = cleanString(body.fullName);
    const jobTitle = cleanString(body.jobTitle);
    const phoneNumber = cleanString(body.phoneNumber);
    const address = cleanString(body.address);
    const dateOfBirth = cleanString(body.dateOfBirth);
    const gender = cleanString(body.gender);
    const skillNames = Array.from(
      new Set((Array.isArray(body.skillNames) ? body.skillNames : []).map((name) => cleanString(name)).filter(Boolean)),
    );
    const qualifications = Array.from(
      new Set(
        (Array.isArray(body.qualifications) ? body.qualifications : [])
          .map((entry) => cleanString(entry))
          .filter(Boolean),
      ),
    );

    if (!username || !email) {
      return NextResponse.json({ error: "Username and email are required." }, { status: 400 });
    }
    if (gender && !GENDER_OPTIONS.has(gender)) {
      return NextResponse.json({ error: "Invalid gender option." }, { status: 400 });
    }

    const { error: accountUpdateError } = await supabase
      .from("user_account")
      .update({ username, email, updated_at: new Date().toISOString() })
      .eq("user_id", account.user_id);

    if (accountUpdateError) {
      const message = accountUpdateError.message.includes("duplicate")
        ? "That username or email is already taken."
        : accountUpdateError.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { error: profileUpsertError } = await supabase.from("profile").upsert(
      {
        user_id: account.user_id,
        full_name: fullName || null,
        job_title: jobTitle || null,
        phone_number: phoneNumber || null,
        address: address || null,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (profileUpsertError) {
      return NextResponse.json({ error: profileUpsertError.message }, { status: 400 });
    }

    const { error: deleteQualificationsError } = await supabase
      .from("user_qualification")
      .delete()
      .eq("user_id", account.user_id);

    if (deleteQualificationsError) {
      return NextResponse.json({ error: deleteQualificationsError.message }, { status: 400 });
    }

    if (qualifications.length) {
      const { error: insertQualificationsError } = await supabase
        .from("user_qualification")
        .insert(qualifications.map((description) => ({ user_id: account.user_id, description })));

      if (insertQualificationsError) {
        return NextResponse.json({ error: insertQualificationsError.message }, { status: 400 });
      }
    }

    const { data: existingSkillRows, error: existingSkillsError } = await supabase
      .from("user_skill")
      .select("skill_id, skill:skill_id(skill_name)")
      .eq("user_id", account.user_id);

    if (existingSkillsError) {
      return NextResponse.json({ error: existingSkillsError.message }, { status: 400 });
    }

    const existingNames = new Map(
      (existingSkillRows ?? []).map((row) => [row.skill?.skill_name?.toLowerCase(), row.skill_id]),
    );
    const nextNameSet = new Set(skillNames.map((name) => name.toLowerCase()));

    const skillIdsToRemove = (existingSkillRows ?? [])
      .filter((row) => !nextNameSet.has(row.skill?.skill_name?.toLowerCase()))
      .map((row) => row.skill_id);

    if (skillIdsToRemove.length) {
      const { error: removeError } = await supabase
        .from("user_skill")
        .delete()
        .eq("user_id", account.user_id)
        .in("skill_id", skillIdsToRemove);

      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 400 });
      }
    }

    const namesToAdd = skillNames.filter((name) => !existingNames.has(name.toLowerCase()));

    for (const name of namesToAdd) {
      const { data: existingSkill, error: findSkillError } = await supabase
        .from("skill")
        .select("skill_id")
        .eq("organization_id", account.organization_id)
        .ilike("skill_name", name)
        .maybeSingle();

      if (findSkillError) {
        return NextResponse.json({ error: findSkillError.message }, { status: 400 });
      }

      let skillId = existingSkill?.skill_id;
      if (!skillId) {
        const { data: createdSkill, error: createSkillError } = await supabase
          .from("skill")
          .insert({ skill_name: name, organization_id: account.organization_id })
          .select("skill_id")
          .single();

        if (createSkillError) {
          return NextResponse.json({ error: createSkillError.message }, { status: 400 });
        }
        skillId = createdSkill.skill_id;
      }

      const { error: linkError } = await supabase
        .from("user_skill")
        .upsert({ user_id: account.user_id, skill_id: skillId }, { onConflict: "user_id,skill_id" });

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 });
      }
    }

    const { account: refreshedAccount, error: refreshError } = await getMyAccount(supabase, user);
    if (refreshError) {
      return NextResponse.json({ error: refreshError.message }, { status: 400 });
    }

    const { profile, error: payloadError } = await getMyProfilePayload(supabase, refreshedAccount);
    if (payloadError) {
      return NextResponse.json({ error: payloadError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
