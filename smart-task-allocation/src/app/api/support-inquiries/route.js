import { NextResponse } from "next/server";
import { getAuthenticatedUser, isPlatformAdminRole, requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const BUCKET = "support-inquiry-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);

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

async function resolveAccountWithRole(supabase, user) {
  const account = await resolveAccount(supabase, user);
  if (!account) return null;

  const { data: full } = await supabase
    .from("user_account")
    .select("user_id, organization_id, role:role_id(role_name)")
    .eq("user_id", account.user_id)
    .maybeSingle();

  return {
    userId: account.user_id,
    organizationId: account.organization_id,
    isPlatformAdmin: isPlatformAdminRole(full?.role?.role_name),
  };
}

// Contact Support should still work for a suspended account, same as the
// account-appeal flow — accept suspended:true instead of hard-rejecting.
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

    const formData = await request.formData();
    const subject = (formData.get("subject") || "").toString().trim();
    const message = (formData.get("message") || "").toString().trim();
    const file = formData.get("attachment");

    if (!subject || !message) {
      return NextResponse.json({ error: "Please provide a subject and a message." }, { status: 400 });
    }

    let attachmentUrl = null;
    if (file && typeof file !== "string") {
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: "Only PNG, JPEG, WEBP, PDF, or plain text attachments are allowed." },
          { status: 400 },
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Attachments must be 5MB or smaller." }, { status: 400 });
      }

      const extension = (file.name?.split(".").pop() || file.type.split("/")[1] || "bin").toLowerCase();
      const path = `${account.user_id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      attachmentUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("support_inquiry").insert({
      user_id: account.user_id,
      organization_id: account.organization_id ?? null,
      subject,
      message,
      attachment_url: attachmentUrl,
    });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// A single ticket can also be fetched by its own submitter (not just a
// Platform Admin) — that's what lets the "open ticket" action on a reply
// notification show the requester their own ticket.
async function getSingleInquiry(request, supabase, inquiryId) {
  const { user, error: authError } = await getAuthenticatedUser(request, supabase);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const requester = await resolveAccountWithRole(supabase, user);
  if (!requester) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const { data: inquiry, error } = await supabase
    .from("support_inquiry")
    .select(
      "inquiry_id, ticket_number, user_id, organization_id, subject, message, status, attachment_url, created_at, resolved_at, guest_name, guest_email",
    )
    .eq("inquiry_id", inquiryId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!inquiry) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const isOwner = inquiry.user_id === requester.userId;
  if (!isOwner && !requester.isPlatformAdmin) {
    return NextResponse.json({ error: "You do not have access to this ticket." }, { status: 403 });
  }

  const [{ data: profile }, { data: account }, { data: organization }] = await Promise.all([
    supabase.from("profile").select("full_name, job_title").eq("user_id", inquiry.user_id).maybeSingle(),
    supabase.from("user_account").select("username, email").eq("user_id", inquiry.user_id).maybeSingle(),
    inquiry.organization_id
      ? supabase.from("organization").select("organization_name").eq("organization_id", inquiry.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: replyRows, error: repliesError } = await supabase
    .from("announcement")
    .select("announcement_id, created_by, target_user_id, body, created_at")
    .eq("related_inquiry_id", inquiryId)
    .order("created_at", { ascending: true });

  if (repliesError) return NextResponse.json({ error: repliesError.message }, { status: 400 });

  const replyAuthorIds = [...new Set((replyRows ?? []).map((reply) => reply.created_by).filter(Boolean))];
  const [{ data: replyProfiles }, { data: replyAccounts }] = replyAuthorIds.length
    ? await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", replyAuthorIds),
        supabase.from("user_account").select("user_id, username, email").in("user_id", replyAuthorIds),
      ])
    : [{ data: [] }, { data: [] }];
  const replyProfileById = new Map((replyProfiles ?? []).map((item) => [item.user_id, item]));
  const replyAccountById = new Map((replyAccounts ?? []).map((item) => [item.user_id, item]));

  // A requester reply is fanned out to every Platform Admin, creating one
  // announcement per recipient. Collapse those delivery copies into one chat
  // message while retaining separate replies sent at different times.
  const seenReplies = new Set();
  const replies = [];
  for (const reply of replyRows ?? []) {
    const dedupeKey = `${reply.created_by}|${reply.created_at}|${reply.body}`;
    if (seenReplies.has(dedupeKey)) continue;
    seenReplies.add(dedupeKey);
    const authorProfile = replyProfileById.get(reply.created_by);
    const authorAccount = replyAccountById.get(reply.created_by);
    replies.push({
      replyId: reply.announcement_id,
      message: reply.body,
      createdAt: reply.created_at,
      authorName: authorProfile?.full_name || authorAccount?.username || authorAccount?.email || "User",
      isOwn: reply.created_by === requester.userId,
    });
  }

  return NextResponse.json({
    inquiry: {
      inquiryId: inquiry.inquiry_id,
      ticketNumber: inquiry.ticket_number,
      subject: inquiry.subject,
      message: inquiry.message,
      status: inquiry.status,
      attachmentUrl: inquiry.attachment_url,
      createdAt: inquiry.created_at,
      resolvedAt: inquiry.resolved_at,
      fullName: profile?.full_name || null,
      jobTitle: profile?.job_title || null,
      username: account?.username ?? null,
      email: account?.email ?? null,
      guestName: inquiry.guest_name ?? null,
      guestEmail: inquiry.guest_email ?? null,
      organizationName: organization?.organization_name ?? null,
      isOwner,
      replies,
    },
  });
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const inquiryId = new URL(request.url).searchParams.get("inquiryId");
    if (inquiryId) return await getSingleInquiry(request, supabase, inquiryId);

    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: inquiries, error } = await supabase
      .from("support_inquiry")
      .select(
        "inquiry_id, ticket_number, user_id, organization_id, subject, message, status, attachment_url, created_at, resolved_at, guest_name, guest_email",
      )
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const userIds = [...new Set((inquiries ?? []).map((inquiry) => inquiry.user_id))];
    const organizationIds = [...new Set((inquiries ?? []).map((inquiry) => inquiry.organization_id).filter(Boolean))];
    let profileByUserId = new Map();
    let accountByUserId = new Map();
    let organizationById = new Map();

    if (userIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name, job_title").in("user_id", userIds),
        supabase.from("user_account").select("user_id, username, email").in("user_id", userIds),
      ]);
      profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      accountByUserId = new Map((accounts ?? []).map((account) => [account.user_id, account]));
    }

    if (organizationIds.length) {
      const { data: organizations } = await supabase
        .from("organization")
        .select("organization_id, organization_name")
        .in("organization_id", organizationIds);
      organizationById = new Map((organizations ?? []).map((org) => [org.organization_id, org]));
    }

    const enriched = (inquiries ?? []).map((inquiry) => {
      const account = accountByUserId.get(inquiry.user_id);
      return {
        inquiryId: inquiry.inquiry_id,
        ticketNumber: inquiry.ticket_number,
        subject: inquiry.subject,
        message: inquiry.message,
        status: inquiry.status,
        attachmentUrl: inquiry.attachment_url,
        createdAt: inquiry.created_at,
        resolvedAt: inquiry.resolved_at,
        fullName: profileByUserId.get(inquiry.user_id)?.full_name || null,
        jobTitle: profileByUserId.get(inquiry.user_id)?.job_title || null,
        username: account?.username ?? null,
        email: account?.email ?? null,
        guestName: inquiry.guest_name ?? null,
        guestEmail: inquiry.guest_email ?? null,
        organizationName: organizationById.get(inquiry.organization_id)?.organization_name ?? null,
      };
    });

    return NextResponse.json({ inquiries: enriched });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// A Platform Admin can resolve or reopen any ticket; the ticket's own
// submitter can only close (resolve) their own — reopening stays admin-only
// since it's a triage decision, not something the requester needs.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { inquiryId, action } = await request.json();
    if (!inquiryId || !["resolve", "reopen"].includes(action)) {
      return NextResponse.json({ error: "A valid inquiry ID and action are required." }, { status: 400 });
    }

    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const requester = await resolveAccountWithRole(supabase, user);
    if (!requester) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    if (!requester.isPlatformAdmin) {
      if (action !== "resolve") {
        return NextResponse.json({ error: "Only Platform Admin can reopen a ticket." }, { status: 403 });
      }
      const { data: inquiry } = await supabase
        .from("support_inquiry")
        .select("user_id")
        .eq("inquiry_id", inquiryId)
        .maybeSingle();
      if (inquiry?.user_id !== requester.userId) {
        return NextResponse.json({ error: "You do not have access to this ticket." }, { status: 403 });
      }
    }

    const { error: updateError } = await supabase
      .from("support_inquiry")
      .update({
        status: action === "resolve" ? "resolved" : "open",
        resolved_at: action === "resolve" ? new Date().toISOString() : null,
      })
      .eq("inquiry_id", inquiryId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
