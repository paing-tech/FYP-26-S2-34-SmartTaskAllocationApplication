import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { AGENT_AVATARS } from "@/lib/agentAvatars";
import { isFoundryConfigured, getFoundryConfig, createFoundryVectorStore } from "@/lib/foundryAgent";

async function getManagerOrganizationId(supabase, user) {
  const { data } = await supabase.from("user_account").select("organization_id").eq("user_id", user.id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data, error } = await supabase.from("agent").select("*").eq("user_id", user.id).maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ agent: data ?? null });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    if (!isFoundryConfigured()) {
      return NextResponse.json(
        { error: "Azure AI Foundry is not configured. Set AZURE_AI_FOUNDRY_ENDPOINT, AZURE_AI_FOUNDRY_API_KEY, and AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT." },
        { status: 500 },
      );
    }

    const { data: existing } = await supabase.from("agent").select("agent_id").eq("user_id", user.id).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "You already have an agent." }, { status: 409 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    const avatarKey = AGENT_AVATARS.some((avatar) => avatar.key === body.avatarKey) ? body.avatarKey : "blue";
    if (!name) {
      return NextResponse.json({ error: "Agent name is required." }, { status: 400 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    if (!organizationId) {
      return NextResponse.json({ error: "Could not resolve your organization." }, { status: 400 });
    }

    const { deployment } = getFoundryConfig();
    const vectorStore = await createFoundryVectorStore({ name: `${name} knowledge` });

    const { data: created, error: insertError } = await supabase
      .from("agent")
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        name,
        foundry_deployment_name: deployment,
        foundry_vector_store_id: vectorStore.id,
        instructions,
        avatar_key: avatarKey,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ agent: created });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("agent")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }
    if (!existing) {
      return NextResponse.json({ error: "No agent found. Create one first." }, { status: 404 });
    }

    const body = await request.json();
    const updates = { updated_at: new Date().toISOString() };
    if (typeof body.instructions === "string") {
      updates.instructions = body.instructions.trim();
    }
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (AGENT_AVATARS.some((avatar) => avatar.key === body.avatarKey)) {
      updates.avatar_key = body.avatarKey;
    }

    const { data: updated, error: updateError } = await supabase
      .from("agent")
      .update(updates)
      .eq("agent_id", existing.agent_id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ agent: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
