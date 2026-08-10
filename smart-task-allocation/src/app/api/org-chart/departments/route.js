import { NextResponse } from "next/server";
import { requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getUserAccount } from "@/app/api/my-organization/route";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 320;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request) {
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
      return NextResponse.json({ error: "Set up your organization first." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const posX = Number.isFinite(body.posX) ? Math.round(body.posX) : 40;
    const posY = Number.isFinite(body.posY) ? Math.round(body.posY) : 40;

    const { data: department, error: departmentError } = await supabase
      .from("department")
      .insert({ organization_id: account.organization_id, department_name: "Department" })
      .select("department_id, department_name")
      .single();

    if (departmentError) {
      return NextResponse.json({ error: departmentError.message }, { status: 400 });
    }

    const { data: boundary, error: boundaryError } = await supabase
      .from("org_chart_department")
      .insert({
        department_id: department.department_id,
        organization_id: account.organization_id,
        pos_x: posX,
        pos_y: posY,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      })
      .select("department_id, pos_x, pos_y, width, height")
      .single();

    if (boundaryError) {
      await supabase.from("department").delete().eq("department_id", department.department_id);
      return NextResponse.json({ error: boundaryError.message }, { status: 400 });
    }

    return NextResponse.json({
      department: { ...department, ...boundary },
    });
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
      return NextResponse.json({ error: "No organization to update." }, { status: 400 });
    }

    const { departmentId, name, posX, posY, width, height } = await request.json();
    if (!departmentId) {
      return NextResponse.json({ error: "departmentId is required." }, { status: 400 });
    }

    if (name != null) {
      const cleanedName = cleanString(name);
      if (!cleanedName) {
        return NextResponse.json({ error: "Department name cannot be empty." }, { status: 400 });
      }

      const { error: renameError } = await supabase
        .from("department")
        .update({ department_name: cleanedName, updated_at: new Date().toISOString() })
        .eq("department_id", departmentId)
        .eq("organization_id", account.organization_id);

      if (renameError) {
        return NextResponse.json({ error: renameError.message }, { status: 400 });
      }
    }

    const geometry = {};
    if (Number.isFinite(posX)) geometry.pos_x = Math.round(posX);
    if (Number.isFinite(posY)) geometry.pos_y = Math.round(posY);
    if (Number.isFinite(width)) geometry.width = Math.round(width);
    if (Number.isFinite(height)) geometry.height = Math.round(height);

    if (Object.keys(geometry).length) {
      const { error: geometryError } = await supabase
        .from("org_chart_department")
        .update({ ...geometry, updated_at: new Date().toISOString() })
        .eq("department_id", departmentId)
        .eq("organization_id", account.organization_id);

      if (geometryError) {
        return NextResponse.json({ error: geometryError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
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
      return NextResponse.json({ error: "No organization to update." }, { status: 400 });
    }

    const { departmentId } = await request.json();
    if (!departmentId) {
      return NextResponse.json({ error: "departmentId is required." }, { status: 400 });
    }

    await supabase
      .from("user_account")
      .update({ department_id: null })
      .eq("department_id", departmentId)
      .eq("organization_id", account.organization_id);

    const { error: deleteError } = await supabase
      .from("department")
      .delete()
      .eq("department_id", departmentId)
      .eq("organization_id", account.organization_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
