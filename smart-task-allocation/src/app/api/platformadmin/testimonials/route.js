import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Everything (Pending/Approved/Rejected), newest first — the review queue
// filters client-side by tab rather than refetching per status.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data: testimonials, error } = await supabase
      .from("testimonial")
      .select("testimonial_id, user_id, rating, testimonial_message, is_featured, status, source_inquiry_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!testimonials?.length) {
      return NextResponse.json({ testimonials: [] });
    }

    const userIds = [...new Set(testimonials.map((t) => t.user_id))];
    const inquiryIds = [...new Set(testimonials.map((t) => t.source_inquiry_id).filter(Boolean))];

    const [{ data: profiles }, { data: inquiries }] = await Promise.all([
      supabase.from("profile").select("user_id, full_name, job_title").in("user_id", userIds),
      inquiryIds.length
        ? supabase.from("support_inquiry").select("inquiry_id, message").in("inquiry_id", inquiryIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const inquiryById = new Map((inquiries ?? []).map((i) => [i.inquiry_id, i]));

    const result = testimonials.map((t) => ({
      id: t.testimonial_id,
      message: t.testimonial_message,
      rating: t.rating,
      status: t.status,
      isFeatured: t.is_featured,
      createdAt: t.created_at,
      authorName: profileByUser.get(t.user_id)?.full_name || "User",
      authorJobTitle: profileByUser.get(t.user_id)?.job_title || "",
      sourceFeedback: t.source_inquiry_id ? inquiryById.get(t.source_inquiry_id)?.message ?? null : null,
    }));

    return NextResponse.json({ testimonials: result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// approve/reject/feature — approve and reject are mutually exclusive
// (Approved is what the public site actually reads), feature just toggles
// is_featured independent of status.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { testimonialId, action } = await request.json();
    if (!testimonialId) {
      return NextResponse.json({ error: "Testimonial ID is required." }, { status: 400 });
    }

    let updates;
    if (action === "approve") {
      updates = { status: "Approved" };
    } else if (action === "reject") {
      updates = { status: "Rejected", is_featured: false };
    } else if (action === "toggle-featured") {
      const { data: current } = await supabase
        .from("testimonial")
        .select("is_featured")
        .eq("testimonial_id", testimonialId)
        .maybeSingle();
      if (!current) {
        return NextResponse.json({ error: "Testimonial not found." }, { status: 404 });
      }
      updates = { is_featured: !current.is_featured };
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const { error } = await supabase.from("testimonial").update(updates).eq("testimonial_id", testimonialId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requirePlatformAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const testimonialId = new URL(request.url).searchParams.get("testimonialId");
    if (!testimonialId) {
      return NextResponse.json({ error: "Testimonial ID is required." }, { status: 400 });
    }

    const { error } = await supabase.from("testimonial").delete().eq("testimonial_id", testimonialId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
