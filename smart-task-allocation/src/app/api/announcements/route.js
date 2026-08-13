import { NextResponse } from "next/server";
import { getAuthenticatedUser, requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const RECENT_LIMIT = 30;

// Any authenticated user can read the feed (announcements are global, not
// org-scoped) and mark it read — only a Platform Admin can create one.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: announcements, error: announcementsError } = await supabase
      .from("announcement")
      .select("announcement_id, title, body, related_inquiry_id, created_at")
      .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);

    if (announcementsError) return NextResponse.json({ error: announcementsError.message }, { status: 400 });

    const announcementIds = (announcements ?? []).map((item) => item.announcement_id);
    let readIds = new Set();

    if (announcementIds.length) {
      const { data: reads, error: readsError } = await supabase
        .from("announcement_read")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", announcementIds);

      if (readsError) return NextResponse.json({ error: readsError.message }, { status: 400 });
      readIds = new Set((reads ?? []).map((row) => row.announcement_id));
    }

    const enriched = (announcements ?? []).map((item) => ({
      announcementId: item.announcement_id,
      title: item.title,
      body: item.body,
      relatedInquiryId: item.related_inquiry_id,
      createdAt: item.created_at,
      isRead: readIds.has(item.announcement_id),
    }));

    return NextResponse.json({
      announcements: enriched,
      unreadCount: enriched.filter((item) => !item.isRead).length,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.body === "string" ? body.body.trim() : "";

    if (!title || !message) {
      return NextResponse.json({ error: "Both a title and a message are required." }, { status: 400 });
    }

    const { data: announcement, error: insertError } = await supabase
      .from("announcement")
      .insert({ created_by: user.id, title, body: message })
      .select("announcement_id, title, body, created_at")
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

    return NextResponse.json({ announcement });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Marks every currently-unread announcement as read for the requester —
// the notification bell calls this once when the panel is opened.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: announcements, error: announcementsError } = await supabase
      .from("announcement")
      .select("announcement_id")
      .or(`target_user_id.is.null,target_user_id.eq.${user.id}`);

    if (announcementsError) return NextResponse.json({ error: announcementsError.message }, { status: 400 });

    const allIds = (announcements ?? []).map((row) => row.announcement_id);
    if (!allIds.length) return NextResponse.json({ success: true });

    const { data: reads, error: readsError } = await supabase
      .from("announcement_read")
      .select("announcement_id")
      .eq("user_id", user.id)
      .in("announcement_id", allIds);

    if (readsError) return NextResponse.json({ error: readsError.message }, { status: 400 });

    const readIds = new Set((reads ?? []).map((row) => row.announcement_id));
    const unreadIds = allIds.filter((id) => !readIds.has(id));
    if (!unreadIds.length) return NextResponse.json({ success: true });

    const { error: upsertError } = await supabase
      .from("announcement_read")
      .insert(unreadIds.map((announcementId) => ({ announcement_id: announcementId, user_id: user.id })));

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
