import { NextResponse } from "next/server";
import { getAuthenticatedUser, getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function resolveAccount(supabase, user) {
  const byUserId = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byUserId.data) {
    return byUserId.data;
  }

  if (!user.email) {
    return null;
  }

  const byEmail = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("email", user.email)
    .maybeSingle();

  return byEmail.data;
}

// A suspended account is the one case where getAuthenticatedUser returns a
// truthy error alongside a real user — every other route treats that error
// as a hard rejection, but this endpoint exists specifically to let a
// suspended user through, so it accepts suspended:true instead of rejecting.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError, suspended } = await getAuthenticatedUser(request, supabase);

    if (!user || (authError && !suspended)) {
      return NextResponse.json({ error: authError || "Authentication required." }, { status: 403 });
    }

    const account = await resolveAccount(supabase, user);

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = await request.json();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return NextResponse.json({ error: "Please describe why your account should be reactivated." }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("account_appeal")
      .select("appeal_id")
      .eq("user_id", account.user_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true });
    }

    const { error: insertError } = await supabase.from("account_appeal").insert({
      organization_id: account.organization_id,
      user_id: account.user_id,
      reason,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ appeals: [] });
    }

    const { data: appeals, error } = await supabase
      .from("account_appeal")
      .select("appeal_id, user_id, reason, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userIds = [...new Set((appeals ?? []).map((appeal) => appeal.user_id))];
    let profileByUserId = new Map();
    let accountByUserId = new Map();

    if (userIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name, profile_picture_url").in("user_id", userIds),
        supabase.from("user_account").select("user_id, username, email").in("user_id", userIds),
      ]);

      profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      accountByUserId = new Map((accounts ?? []).map((account) => [account.user_id, account]));
    }

    const enriched = (appeals ?? []).map((appeal) => {
      const account = accountByUserId.get(appeal.user_id);
      return {
        appealId: appeal.appeal_id,
        userId: appeal.user_id,
        reason: appeal.reason,
        createdAt: appeal.created_at,
        fullName: profileByUserId.get(appeal.user_id)?.full_name || null,
        profilePictureUrl: profileByUserId.get(appeal.user_id)?.profile_picture_url || null,
        username: account?.username ?? null,
        email: account?.email ?? null,
      };
    });

    return NextResponse.json({ appeals: enriched });
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

    const { appealId, action } = await request.json();

    if (!appealId || !["reactivate", "dismiss"].includes(action)) {
      return NextResponse.json({ error: "A valid appeal ID and action are required." }, { status: 400 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const { data: appeal } = await supabase
      .from("account_appeal")
      .select("appeal_id, user_id, organization_id")
      .eq("appeal_id", appealId)
      .eq("organization_id", organizationId ?? "")
      .maybeSingle();

    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found in your organization." }, { status: 404 });
    }

    if (action === "reactivate") {
      const { error: reactivateError } = await supabase
        .from("user_account")
        .update({ account_status: "Active" })
        .eq("user_id", appeal.user_id);

      if (reactivateError) {
        return NextResponse.json({ error: reactivateError.message }, { status: 400 });
      }
    }

    const { error: updateError } = await supabase
      .from("account_appeal")
      .update({
        status: action === "reactivate" ? "approved" : "dismissed",
        resolved_at: new Date().toISOString(),
      })
      .eq("appeal_id", appealId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
