import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const authorization = request.headers.get("authorization") ?? "";
    let user = null;

    if (authorization.startsWith("Bearer ") && authorization.slice(7).trim()) {
      const auth = await getAuthenticatedUser(request, supabase);
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }
      user = auth.user;
    }

    const body = await request.json();
    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const subject = cleanString(body.subject || body.inquiryType);
    const message = cleanString(body.message);

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Name, email, subject, and message are required." },
        { status: 400 },
      );
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const createdAt = new Date().toISOString();
    const { data: inquiry, error } = await supabase
      .from("activity_log")
      .insert({
        user_id: user?.id ?? null,
        action: "Contact Support Inquiry",
        details: JSON.stringify({ name, email, subject, message, status: "Open", replies: [] }),
        created_at: createdAt,
      })
      .select("log_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      reference: `SUP-${inquiry.log_id}`,
      createdAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
