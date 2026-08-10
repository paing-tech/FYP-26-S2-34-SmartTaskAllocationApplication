import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireDemoUser, resolveRoleIds, roleKeyToHome } from "@/lib/demoServer";

const VALID_ROLES = ["useradmin", "manager", "employee"];

// Switch the demo account's role by updating its role_id. Role enforcement is
// derived from role_name → home route, so this re-points the whole dashboard.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error } = await requireDemoUser(request, supabase);
    if (error) {
      return NextResponse.json({ error }, { status: 403 });
    }

    const { role } = await request.json();
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Unknown demo role." }, { status: 400 });
    }

    const roleIds = await resolveRoleIds(supabase);
    const roleId = roleIds[role];
    if (roleId == null) {
      return NextResponse.json({ error: "That role is not configured." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("user_account")
      .update({ role_id: roleId })
      .eq("user_id", user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, home: roleKeyToHome(role) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
