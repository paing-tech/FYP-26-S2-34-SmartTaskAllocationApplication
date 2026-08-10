import { NextResponse } from "next/server";
import { getAuthenticatedUser, getUserHomeRoute } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { homeRoute, error: routeError } = await getUserHomeRoute(user, supabase);

    if (routeError) {
      return NextResponse.json({ error: routeError }, { status: 400 });
    }

    if (!homeRoute) {
      return NextResponse.json(
        { error: "This account role does not have a home." },
        { status: 400 },
      );
    }

    return NextResponse.json({ homeRoute });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
