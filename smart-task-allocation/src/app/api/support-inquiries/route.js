import { NextResponse } from "next/server";
import { getAuthenticatedUser, requirePlatformAdmin } from "@/lib/serverAuth";
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

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: inquiries, error } = await supabase
      .from("support_inquiry")
      .select("inquiry_id, user_id, organization_id, subject, message, status, attachment_url, created_at, resolved_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const userIds = [...new Set((inquiries ?? []).map((inquiry) => inquiry.user_id))];
    const organizationIds = [...new Set((inquiries ?? []).map((inquiry) => inquiry.organization_id).filter(Boolean))];
    let profileByUserId = new Map();
    let accountByUserId = new Map();
    let organizationById = new Map();

    if (userIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", userIds),
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
        subject: inquiry.subject,
        message: inquiry.message,
        status: inquiry.status,
        attachmentUrl: inquiry.attachment_url,
        createdAt: inquiry.created_at,
        resolvedAt: inquiry.resolved_at,
        fullName: profileByUserId.get(inquiry.user_id)?.full_name || null,
        username: account?.username ?? null,
        email: account?.email ?? null,
        organizationName: organizationById.get(inquiry.organization_id)?.organization_name ?? null,
      };
    });

    return NextResponse.json({ inquiries: enriched });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { inquiryId, action } = await request.json();
    if (!inquiryId || !["resolve", "reopen"].includes(action)) {
      return NextResponse.json({ error: "A valid inquiry ID and action are required." }, { status: 400 });
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
