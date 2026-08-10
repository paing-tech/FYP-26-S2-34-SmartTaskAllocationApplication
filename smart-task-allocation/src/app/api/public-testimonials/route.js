import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Public, unauthenticated testimonials for the marketing landing page.
// Joins each testimonial's author to their profile (name, job title, photo) and
// organization name. Returns only display-safe fields.
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: testimonials, error } = await supabase
      .from("testimonial")
      .select("testimonial_id, user_id, rating, testimonial_message, is_featured, created_at")
      .neq("status", "Rejected")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!testimonials?.length) {
      return NextResponse.json({ testimonials: [] });
    }

    const userIds = [...new Set(testimonials.map((t) => t.user_id))];

    const [{ data: profiles }, { data: accounts }] = await Promise.all([
      supabase
        .from("profile")
        .select("user_id, full_name, job_title, profile_picture_url")
        .in("user_id", userIds),
      supabase
        .from("user_account")
        .select("user_id, username, organization_id")
        .in("user_id", userIds),
    ]);

    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const accountByUser = new Map((accounts ?? []).map((a) => [a.user_id, a]));

    const orgIds = [
      ...new Set((accounts ?? []).map((a) => a.organization_id).filter(Boolean)),
    ];
    let orgNameById = new Map();
    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from("organization")
        .select("organization_id, organization_name")
        .in("organization_id", orgIds);
      orgNameById = new Map((orgs ?? []).map((o) => [o.organization_id, o.organization_name]));
    }

    const result = testimonials.map((testimonial) => {
      const profile = profileByUser.get(testimonial.user_id) ?? {};
      const account = accountByUser.get(testimonial.user_id) ?? {};
      const orgName = account.organization_id
        ? orgNameById.get(account.organization_id)
        : null;
      const role = [profile.job_title, orgName].filter(Boolean).join(", ");

      return {
        id: testimonial.testimonial_id,
        text: testimonial.testimonial_message,
        name: profile.full_name || account.username || "User",
        role,
        image: profile.profile_picture_url || "",
      };
    });

    return NextResponse.json({ testimonials: result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
