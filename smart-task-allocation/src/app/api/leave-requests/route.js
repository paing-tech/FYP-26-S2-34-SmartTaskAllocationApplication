import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const BUCKET = "leave-certificates";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

async function getMyUserId(supabase, user) {
  const byId = await supabase.from("user_account").select("user_id").eq("user_id", user.id).maybeSingle();
  if (byId.data) return byId.data.user_id;

  const byEmail = await supabase.from("user_account").select("user_id").eq("email", user.email).maybeSingle();
  return byEmail.data?.user_id ?? null;
}

function isValidDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function parseDates(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(isValidDate))].sort();
  } catch {
    return [];
  }
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const userId = await getMyUserId(supabase, user);
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("leave_request")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const userId = await getMyUserId(supabase, user);
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const dates = parseDates(formData.get("dates") || "[]");
    const description = (formData.get("description") || "").toString().trim();
    const file = formData.get("certificate");

    if (!dates.length) {
      return NextResponse.json({ error: "Select at least one date." }, { status: 400 });
    }

    let certificateUrl = null;
    if (file && typeof file !== "string") {
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Only PNG, JPEG, WEBP images or PDF files are allowed." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "The certificate must be 5MB or smaller." }, { status: 400 });
      }

      const extension = (file.name?.split(".").pop() || file.type.split("/")[1] || "pdf").toLowerCase();
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      certificateUrl = publicUrlData.publicUrl;
    }

    // Attaching a medical certificate counts the request as sick leave;
    // without one it's drawn from annual leave — no manual type picker needed.
    const { data: created, error: insertError } = await supabase
      .from("leave_request")
      .insert({
        user_id: userId,
        dates,
        description: description || null,
        leave_type: certificateUrl ? "sick" : "annual",
        certificate_url: certificateUrl,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ request: created });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const userId = await getMyUserId(supabase, user);
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = await request.json();
    const leaveRequestId = body.leaveRequestId;
    if (!leaveRequestId) {
      return NextResponse.json({ error: "Leave request ID is required." }, { status: 400 });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (body.dates !== undefined) {
      const dates = Array.isArray(body.dates) ? body.dates.filter(isValidDate) : [];
      if (!dates.length) {
        return NextResponse.json({ error: "Select at least one date." }, { status: 400 });
      }
      updates.dates = [...new Set(dates)].sort();
    }
    if (body.description !== undefined) {
      updates.description = (body.description || "").trim() || null;
    }

    const { data: updated, error } = await supabase
      .from("leave_request")
      .update(updates)
      .eq("leave_request_id", leaveRequestId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ request: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const userId = await getMyUserId(supabase, user);
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const leaveRequestId = searchParams.get("leaveRequestId");
    if (!leaveRequestId) {
      return NextResponse.json({ error: "Leave request ID is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("leave_request")
      .delete()
      .eq("leave_request_id", leaveRequestId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
