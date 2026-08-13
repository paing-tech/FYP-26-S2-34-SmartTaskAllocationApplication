import { NextResponse } from "next/server";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function formatTicketNumber(value) {
  return value ? `#${String(value).padStart(5, "0")}` : "#—";
}

async function resolveAccount(supabase, user) {
  const byUserId = await supabase
    .from("user_account")
    .select("user_id, role:role_id(role_name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byUserId.data) return byUserId.data;
  if (!user.email) return null;

  const byEmail = await supabase
    .from("user_account")
    .select("user_id, role:role_id(role_name)")
    .eq("email", user.email)
    .maybeSingle();

  return byEmail.data;
}

// A reply to a support ticket is delivered as a targeted announcement (see
// 20260821_add_announcement_target_user.sql) rather than a new messaging
// system. Bidirectional: a Platform Admin replying targets the ticket's
// submitter; the submitter replying back fans out to every Platform Admin,
// since there's no single "assigned agent" concept here.
export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const account = await resolveAccount(supabase, user);
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const { inquiryId, message } = await request.json();
    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!inquiryId || !cleanMessage) {
      return NextResponse.json({ error: "A ticket and a reply message are required." }, { status: 400 });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_inquiry")
      .select("user_id, ticket_number")
      .eq("inquiry_id", inquiryId)
      .maybeSingle();

    if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 400 });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    const isAdmin = isPlatformAdminRole(account.role?.role_name);
    const isOwner = ticket.user_id === account.user_id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "You do not have access to this ticket." }, { status: 403 });
    }

    let targetUserIds;
    if (isOwner && !isAdmin) {
      const { data: roles } = await supabase.from("role").select("role_id, role_name");
      const adminRoleIds = (roles ?? []).filter((role) => isPlatformAdminRole(role.role_name)).map((role) => role.role_id);
      const { data: admins } = adminRoleIds.length
        ? await supabase.from("user_account").select("user_id").in("role_id", adminRoleIds)
        : { data: [] };
      targetUserIds = (admins ?? []).map((admin) => admin.user_id);
    } else {
      targetUserIds = [ticket.user_id];
    }

    if (!targetUserIds.length) {
      return NextResponse.json({ error: "No recipient found for this reply." }, { status: 400 });
    }

    const title = `Re: ${formatTicketNumber(ticket.ticket_number)}`;
    const { error: insertError } = await supabase.from("announcement").insert(
      targetUserIds.map((targetUserId) => ({
        created_by: user.id,
        target_user_id: targetUserId,
        related_inquiry_id: inquiryId,
        title,
        body: cleanMessage,
      })),
    );

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
