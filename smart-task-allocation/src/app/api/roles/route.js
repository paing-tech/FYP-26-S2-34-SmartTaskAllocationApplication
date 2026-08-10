import { NextResponse } from "next/server";
import { isPlatformAdminRole, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("role")
      .select("role_id, role_name")
      .order("role_id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Platform Admin is developer-side and not manageable by User Admins.
    const roles = (data ?? []).filter((role) => !isPlatformAdminRole(role.role_name));

    return NextResponse.json({ roles });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { roleName, description } = await request.json();
    const cleanRoleName = typeof roleName === "string" ? roleName.trim() : "";

    if (!cleanRoleName) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }

    const { error } = await supabase.from("role").insert({
      role_name: cleanRoleName,
      description: typeof description === "string" ? description.trim() : null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { roleId, roleName, description } = await request.json();

    const { error } = await supabase
      .from("role")
      .update({
        role_name: roleName,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq("role_id", roleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("roleId");

    const { error } = await supabase.from("role").delete().eq("role_id", roleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
