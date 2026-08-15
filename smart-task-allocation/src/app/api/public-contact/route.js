import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { SUPPORT_INQUIRY_SUBJECTS } from "@/lib/supportInquiry";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Public, unauthenticated — the marketing site's "Contact Us" form. Lands
// in the same support_inquiry table (and Platform Admin review queue) as
// logged-in users' Contact Support, just with guest_name/guest_email
// instead of a user_id (see 20260826_allow_guest_support_inquiries.sql).
export async function POST(request) {
  try {
    const body = await request.json();
    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const subject = cleanString(body.subject);
    const message = cleanString(body.message);

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "Please fill in your name, email, subject, and message." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!SUPPORT_INQUIRY_SUBJECTS.includes(subject)) {
      return NextResponse.json({ error: "Please choose a valid subject." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("support_inquiry").insert({
      user_id: null,
      organization_id: null,
      guest_name: name,
      guest_email: email,
      subject,
      message,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
