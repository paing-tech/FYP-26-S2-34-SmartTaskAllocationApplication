import { NextResponse } from "next/server";
import { requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getUserAccount } from "@/app/api/my-organization/route";

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
      return NextResponse.json({ error: "No organization to update." }, { status: 400 });
    }

    const { fromUserId, toUserId } = await request.json();
    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      return NextResponse.json({ error: "A connection needs two different people." }, { status: 400 });
    }

    const { data: people, error: peopleError } = await supabase
      .from("user_account")
      .select("user_id")
      .eq("organization_id", account.organization_id)
      .in("user_id", [fromUserId, toUserId]);

    if (peopleError) {
      return NextResponse.json({ error: peopleError.message }, { status: 400 });
    }
    if ((people ?? []).length !== 2) {
      return NextResponse.json({ error: "Both people must belong to your organization." }, { status: 400 });
    }

    const { data: connection, error: insertError } = await supabase
      .from("org_chart_connection")
      .upsert(
        { organization_id: account.organization_id, from_user_id: fromUserId, to_user_id: toUserId },
        { onConflict: "organization_id,from_user_id,to_user_id" },
      )
      .select("connection_id, from_user_id, to_user_id")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, connection });
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

    const { connectionId } = await request.json();
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("org_chart_connection")
      .delete()
      .eq("connection_id", connectionId)
      .eq("organization_id", account.organization_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
