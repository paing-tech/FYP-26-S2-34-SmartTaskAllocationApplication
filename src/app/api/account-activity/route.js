import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ activity: [] });
    }

    const { data: logs, error } = await supabase
      .from("account_activity_log")
      .select("activity_id, actor_user_id, target_user_id, target_label, action, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const actorIds = [...new Set((logs ?? []).map((log) => log.actor_user_id).filter(Boolean))];
    let actorNameById = new Map();

    if (actorIds.length) {
      const [{ data: actorProfiles }, { data: actorAccounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", actorIds),
        supabase.from("user_account").select("user_id, username").in("user_id", actorIds),
      ]);

      const usernameById = new Map((actorAccounts ?? []).map((account) => [account.user_id, account.username]));
      actorNameById = new Map(
        (actorProfiles ?? []).map((profile) => [
          profile.user_id,
          profile.full_name || usernameById.get(profile.user_id) || "Unknown",
        ]),
      );

      actorIds.forEach((id) => {
        if (!actorNameById.has(id)) {
          actorNameById.set(id, usernameById.get(id) || "Unknown");
        }
      });
    }

    const activity = (logs ?? []).map((log) => ({
      activityId: log.activity_id,
      actorName: log.actor_user_id === user.id ? "You" : actorNameById.get(log.actor_user_id) || "Unknown",
      targetLabel: log.target_label,
      action: log.action,
      createdAt: log.created_at,
    }));

    return NextResponse.json({ activity });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
