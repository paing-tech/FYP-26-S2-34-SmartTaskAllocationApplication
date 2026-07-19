import { NextResponse } from "next/server";
import { isPlatformAdminRole, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Accept departments as {id, name} objects (new format) or plain name strings
// (legacy). Returns normalized {id, name} entries with a non-empty name.
function normalizeDepartments(departments) {
  return (Array.isArray(departments) ? departments : [])
    .map((department) =>
      typeof department === "string"
        ? { id: null, name: cleanString(department) }
        : { id: department?.id ?? null, name: cleanString(department?.name) },
    )
    .filter((department) => department.name);
}

// Sync an organization's departments to exactly the submitted set: rename the
// ones with an id, insert the new ones, and delete the removed ones (detaching
// any users first so the delete doesn't hit a foreign-key error).
async function syncDepartments(supabase, organizationId, departments) {
  const incoming = normalizeDepartments(departments);

  const { data: existing, error: existingError } = await supabase
    .from("department")
    .select("department_id, department_name")
    .eq("organization_id", organizationId);
  if (existingError) {
    return existingError;
  }

  const keepIds = new Set(
    incoming.filter((d) => d.id != null).map((d) => Number(d.id)),
  );
  const toDelete = (existing ?? []).filter((d) => !keepIds.has(Number(d.department_id)));

  if (toDelete.length) {
    const deleteIds = toDelete.map((d) => d.department_id);
    await supabase.from("user_account").update({ department_id: null }).in("department_id", deleteIds);
    const { error: deleteError } = await supabase
      .from("department")
      .delete()
      .in("department_id", deleteIds);
    if (deleteError) {
      return deleteError;
    }
  }

  for (const department of incoming.filter((d) => d.id != null)) {
    const { error: renameError } = await supabase
      .from("department")
      .update({ department_name: department.name, updated_at: new Date().toISOString() })
      .eq("department_id", department.id)
      .eq("organization_id", organizationId);
    if (renameError) {
      return renameError;
    }
  }

  const existingNames = new Set(
    (existing ?? [])
      .filter((d) => keepIds.has(Number(d.department_id)))
      .map((d) => d.department_name.toLowerCase()),
  );
  const newNames = Array.from(
    new Set(
      incoming
        .filter((d) => d.id == null)
        .map((d) => d.name)
        .filter((name) => !existingNames.has(name.toLowerCase())),
    ),
  );
  if (newNames.length) {
    const { error: insertError } = await supabase.from("department").insert(
      newNames.map((name) => ({
        organization_id: organizationId,
        department_name: name,
      })),
    );
    if (insertError) {
      return insertError;
    }
  }

  return null;
}

export async function getUserAccount(supabase, user) {
  const { data, error } = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data) {
    return { account: data, error };
  }

  const byEmail = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("email", user.email)
    .maybeSingle();

  return { account: byEmail.data, error: byEmail.error };
}

function normalizeAccount(account, profilesByUserId) {
  const profile = profilesByUserId.get(account.user_id) ?? {};
  const fullName = cleanString(profile.full_name) || account.username || account.email;

  return {
    ...account,
    full_name: fullName,
    job_title: profile.job_title ?? "",
    profile_picture_url: profile.profile_picture_url ?? "",
    phone_number: profile.phone_number ?? "",
    bio: profile.bio ?? "",
  };
}

export async function getAccountsWithProfiles(supabase, organizationId) {
  // Only ever surface accounts within the requester's organization, and never
  // platform admins (developer-side, org-agnostic accounts).
  if (!organizationId) {
    return { accounts: [] };
  }

  const { data: accountRows, error: accountsError } = await supabase
    .from("user_account")
    .select(
      "user_id, username, email, account_status, organization_id, department_id, role:role_id(role_name), department:department_id(department_name)",
    )
    .eq("organization_id", organizationId)
    .order("username", { ascending: true });

  if (accountsError) {
    return { accounts: [], error: accountsError };
  }

  const accounts = (accountRows ?? []).filter(
    (account) => !isPlatformAdminRole(account.role?.role_name),
  );

  const userIds = accounts.map((account) => account.user_id);

  if (!userIds.length) {
    return { accounts: [] };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profile")
    .select("user_id, full_name, job_title, phone_number, bio, profile_picture_url")
    .in("user_id", userIds);

  if (profilesError) {
    return { accounts: [], error: profilesError };
  }

  const profilesByUserId = new Map(
    (profiles ?? []).map((profile) => [profile.user_id, profile]),
  );

  return {
    accounts: (accounts ?? []).map((account) =>
      normalizeAccount(account, profilesByUserId),
    ),
  };
}

async function getOrganizationPayload(supabase, account) {
  const { accounts, error: accountsError } = await getAccountsWithProfiles(
    supabase,
    account?.organization_id,
  );

  if (accountsError) {
    return { error: accountsError };
  }

  if (!account?.organization_id) {
    return {
      organization: null,
      departments: [],
      accounts,
      currentUserId: account?.user_id ?? null,
    };
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organization")
    .select("*")
    .eq("organization_id", account.organization_id)
    .maybeSingle();

  if (organizationError) {
    return { error: organizationError };
  }

  const { data: departments, error: departmentsError } = await supabase
    .from("department")
    .select("department_id, organization_id, department_name, description")
    .eq("organization_id", account.organization_id)
    .order("department_name", { ascending: true });

  if (departmentsError) {
    return { error: departmentsError };
  }

  return {
    organization,
    departments: departments ?? [],
    accounts,
    currentUserId: account.user_id,
  };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getUserAccount(supabase, user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    const payload = await getOrganizationPayload(supabase, account);

    if (payload.error) {
      return NextResponse.json({ error: payload.error.message }, { status: 400 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const adminCheck = await requireUserAdmin(request, supabase);

    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: 403 });
    }

    const { account, error: accountError } = await getUserAccount(supabase, adminCheck.user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!account) {
      return NextResponse.json({ error: "User account was not found." }, { status: 400 });
    }

    const {
      organizationName,
      organizationCode,
      organizationEmail,
      organizationType,
      logoUrl,
      departments = [],
    } = await request.json();
    const payload = {
      organization_name: cleanString(organizationName),
      organization_code: cleanString(organizationCode) || null,
      organization_email: cleanString(organizationEmail).toLowerCase() || null,
      organization_type: cleanString(organizationType) || null,
      logo_url: cleanString(logoUrl) || null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.organization_name) {
      return NextResponse.json(
        { error: "Organization name is required." },
        { status: 400 },
      );
    }

    if (account.organization_id) {
      const { error } = await supabase
        .from("organization")
        .update(payload)
        .eq("organization_id", account.organization_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const departmentSyncError = await syncDepartments(
        supabase,
        account.organization_id,
        departments,
      );

      if (departmentSyncError) {
        return NextResponse.json({ error: departmentSyncError.message }, { status: 400 });
      }

      const responsePayload = await getOrganizationPayload(supabase, account);

      if (responsePayload.error) {
        return NextResponse.json(
          { error: responsePayload.error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({ success: true, ...responsePayload });
    }

    const { data: createdOrganization, error: createError } = await supabase
      .from("organization")
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select("organization_id")
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const { error: linkError } = await supabase
      .from("user_account")
      .update({
        organization_id: createdOrganization.organization_id,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", account.user_id);

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const departmentNames = Array.from(
      new Set(normalizeDepartments(departments).map((department) => department.name)),
    );

    if (departmentNames.length) {
      const { error: departmentError } = await supabase.from("department").insert(
        departmentNames.map((departmentName) => ({
          organization_id: createdOrganization.organization_id,
          department_name: departmentName,
        })),
      );

      if (departmentError) {
        return NextResponse.json({ error: departmentError.message }, { status: 400 });
      }
    }

    const responsePayload = await getOrganizationPayload(supabase, {
      ...account,
      organization_id: createdOrganization.organization_id,
    });

    if (responsePayload.error) {
      return NextResponse.json({ error: responsePayload.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...responsePayload });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getUserAccount(supabase, user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!account?.organization_id) {
      return NextResponse.json(
        { error: "Set up your organization before assigning departments." },
        { status: 400 },
      );
    }

    const { action, userId, departmentId } = await request.json();

    if (action !== "assignDepartment") {
      return NextResponse.json({ error: "Unsupported organization action." }, { status: 400 });
    }

    if (!userId || !departmentId) {
      return NextResponse.json(
        { error: "User and department are required." },
        { status: 400 },
      );
    }

    const { data: department, error: departmentError } = await supabase
      .from("department")
      .select("department_id")
      .eq("department_id", Number(departmentId))
      .eq("organization_id", account.organization_id)
      .maybeSingle();

    if (departmentError) {
      return NextResponse.json({ error: departmentError.message }, { status: 400 });
    }

    if (!department) {
      return NextResponse.json(
        { error: "Department does not belong to this organization." },
        { status: 404 },
      );
    }

    const { error: updateError } = await supabase
      .from("user_account")
      .update({
        organization_id: account.organization_id,
        department_id: department.department_id,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const responsePayload = await getOrganizationPayload(supabase, account);

    if (responsePayload.error) {
      return NextResponse.json({ error: responsePayload.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...responsePayload });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
