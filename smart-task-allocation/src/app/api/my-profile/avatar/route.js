import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const BUCKET = "profile-pictures";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function getMyUserId(supabase, user) {
  const byId = await supabase.from("user_account").select("user_id").eq("user_id", user.id).maybeSingle();
  if (byId.data) return byId.data.user_id;

  const byEmail = await supabase.from("user_account").select("user_id").eq("email", user.email).maybeSingle();
  return byEmail.data?.user_id ?? null;
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
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PNG, JPEG, WEBP, or GIF images are allowed." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
    }

    const extension = (file.name?.split(".").pop() || file.type.split("/")[1] || "png").toLowerCase();
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const profilePictureUrl = publicUrlData.publicUrl;

    const { error: profileUpsertError } = await supabase.from("profile").upsert(
      { user_id: userId, profile_picture_url: profilePictureUrl, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    if (profileUpsertError) {
      return NextResponse.json({ error: profileUpsertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, profile_picture_url: profilePictureUrl });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
